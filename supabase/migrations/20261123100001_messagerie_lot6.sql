-- Lot 6 : messagerie et prêts.
--   * start_conversation / list_my_conversations / get_conversation / mark_conversation_read / get_unread_count
--   * start_loan / return_loan + clés d'erreur stables (hint) sur les prêts, les messages et l'anti-spam
--   * temps réel en canaux PRIVÉS (Broadcast) ; messages retiré de la publication postgres_changes
-- Clés d'erreur : SQLSTATE + hint stable ; le front ne compare jamais les messages (cf. create_listing).

-- ------------------------------------------------------------------ index
-- Pagination par (created_at, id) et dernier message : remplace l'index (conversation_id, created_at).
create index messages_conversation_created_id_idx on public.messages (conversation_id, created_at, id);
drop index public.messages_conversation_created_idx;
-- Compteurs de non-lus : seules les lignes non lues sont indexées (peu nombreuses).
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- Envoi idempotent : le client tire un uuid par message et le renvoie tel quel en cas de nouvel essai
-- (réponse perdue après une panne réseau). Un second envoi lève 23505 / message_already_sent.
alter table public.messages add column client_id uuid;
create unique index messages_sender_client_id_key on public.messages (sender_id, client_id);
grant insert (client_id) on public.messages to authenticated;

-- -------------------------------------------------------- anti-spam (hints)
create or replace function private.limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return new; end if;
  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de messages envoyés en une minute, réessaie dans un instant'
      using errcode = 'PT429', hint = 'message_rate_limit';
  end if;
  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Limite de 300 messages par jour atteinte'
      using errcode = 'PT429', hint = 'message_rate_limit';
  end if;
  return new;
end;
$$;

create or replace function private.limit_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null
     and (select count(*) from public.conversations where requester_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Limite de 20 nouvelles conversations par jour atteinte'
      using errcode = 'PT429', hint = 'conversation_rate_limit';
  end if;
  return new;
end;
$$;

-- --------------------------------------------------- validation des messages
-- Exécuté avant la RLS (les triggers BEFORE précèdent les WITH CHECK) : donne des hints stables sans rien
-- révéler à un tiers (la conversation n'est contrôlée que pour un participant ; sinon la RLS refuse, 42501
-- sans hint). Texte : retours à la ligne conservés (clean_multiline_text retire seulement invisibles,
-- bidi et caractères de contrôle, et compacte les espaces).
--   23514  body_empty, body_too_long
--   42501  conversation_closed (l'autre participant ou l'annonce n'existe plus : lecture seule)
--   23505  message_already_sent (même client_id déjà envoyé par cet expéditeur ; l'index unique couvre la course)
create or replace function private.validate_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req uuid;
  v_owner uuid;
  v_clean text;
begin
  -- garde-fou avant tout traitement regex
  if octet_length(new.body) > 20000 then
    raise exception 'Un message est limité à 2000 caractères' using errcode = '23514', hint = 'body_too_long';
  end if;
  v_clean := coalesce(private.clean_multiline_text(new.body), '');
  if v_clean = '' then
    raise exception 'Le message est vide' using errcode = '23514', hint = 'body_empty';
  end if;
  if char_length(v_clean) > 2000 then
    raise exception 'Un message est limité à 2000 caractères' using errcode = '23514', hint = 'body_too_long';
  end if;
  new.body := v_clean;

  if v_uid is not null and new.client_id is not null and exists (
    select 1 from public.messages m where m.sender_id = v_uid and m.client_id = new.client_id
  ) then
    raise exception 'Ce message a déjà été envoyé' using errcode = '23505', hint = 'message_already_sent';
  end if;

  if v_uid is not null then
    select c.requester_id, l.owner_id into v_req, v_owner
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    where c.id = new.conversation_id;
    if found and (v_uid = v_req or v_uid = v_owner) and (v_req is null or v_owner is null) then
      raise exception 'Cette conversation est terminée : l''autre membre n''existe plus'
        using errcode = '42501', hint = 'conversation_closed';
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_validate before insert on public.messages
  for each row execute function private.validate_message();

-- --------------------------------------------------------- prêts (hints)
-- Mêmes règles et mêmes messages qu'avant ; ajout des hints et de la cohérence de la date de retour.
--   42501  listing_not_found (annonce inexistante, ou qui n'est pas la tienne : indistinguable)
--   23514  listing_not_loanable (pas une annonce de prêt), loan_already_open (déjà prêtée),
--          listing_not_available (donnée/archivée), no_conversation, due_date_invalid,
--          loan_immutable_fields
create or replace function private.loans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_prev text := coalesce(nullif(current_setting('app.loan_sync', true), ''), 'off');
begin
  if new.due_at is not null and new.due_at < coalesce(new.started_at, now()) then
    raise exception 'La date de retour ne peut pas précéder le début du prêt'
      using errcode = '23514', hint = 'due_date_invalid';
  end if;

  if tg_op = 'INSERT' then
    select * into v_listing from public.listings
      where id = new.listing_id and owner_id = (select auth.uid()) for update;
    if not found then
      raise exception 'Annonce introuvable ou non autorisée' using errcode = '42501', hint = 'listing_not_found';
    end if;
    if v_listing.kind <> 'pret' then
      raise exception 'Seule une annonce de type prêt peut avoir un prêt'
        using errcode = '23514', hint = 'listing_not_loanable';
    end if;
    if v_listing.status not in ('disponible', 'reservee') then
      raise exception 'Cette annonce n''est pas prêtable dans son état actuel'
        using errcode = '23514', hint = case when v_listing.status = 'pretee' then 'loan_already_open' else 'listing_not_available' end;
    end if;
    if new.borrower_id is null or not exists (
      select 1 from public.conversations c
      where c.listing_id = new.listing_id and c.requester_id = new.borrower_id
        and private.conversation_has_messages(c.id)
    ) then
      raise exception 'Aucune conversation avec cet utilisateur sur cette annonce'
        using errcode = '23514', hint = 'no_conversation';
    end if;
    new.returned_at := null;
    perform set_config('app.loan_sync', 'on', true);
    update public.listings set status = 'pretee' where id = new.listing_id;
    perform set_config('app.loan_sync', v_prev, true);
  else
    if new.listing_id <> old.listing_id
       or (new.borrower_id is distinct from old.borrower_id and new.borrower_id is not null) then
      raise exception 'listing_id et borrower_id sont immuables'
        using errcode = '23514', hint = 'loan_immutable_fields';
    end if;
    -- returned_at est posé par le serveur (une seule fois), jamais par le client
    if old.returned_at is not null then
      new.returned_at := old.returned_at;
    elsif new.returned_at is not null then
      new.returned_at := now();
      perform set_config('app.loan_sync', 'on', true);
      update public.listings set status = 'disponible' where id = new.listing_id and status = 'pretee';
      perform set_config('app.loan_sync', v_prev, true);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------- start_conversation
-- Récupère ou crée la conversation du demandeur courant sur une annonce (idempotent, sûr en concurrence :
-- ON CONFLICT sur l'unicité (annonce, demandeur)). SECURITY DEFINER : le propriétaire et l'état de l'annonce
-- sont lus sans dépendre de la RLS, et rien n'est révélé sur les annonces d'autrui (une annonce archivée
-- d'un autre répond comme une annonce inexistante). Une conversation existante est renvoyée même si
-- l'annonce n'est plus visible. Le plafond de 20 conversations/jour (trigger conversations_limit) ne
-- s'applique qu'à une vraie création.
--   42501  auth_required
--   23514  own_listing (ta propre annonce), listing_unavailable (inexistante, archivée, donnée ou sans
--          propriétaire : aucune NOUVELLE conversation ; « réservée » et « prêtée » restent contactables)
--   PT429  conversation_rate_limit
-- C'est le seul chemin de création : le grant INSERT client sur conversations est retiré (cf. plus bas).
create or replace function public.start_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_owner uuid;
  v_status public.listing_status;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour contacter un membre' using errcode = '42501', hint = 'auth_required';
  end if;

  select c.id into v_id from public.conversations c
    where c.listing_id = p_listing_id and c.requester_id = v_uid;
  if found then
    return v_id;
  end if;

  select l.owner_id, l.status into v_owner, v_status from public.listings l where l.id = p_listing_id;
  if not found then
    raise exception 'Annonce indisponible' using errcode = '23514', hint = 'listing_unavailable';
  end if;
  if v_owner = v_uid then
    raise exception 'C''est ta propre annonce' using errcode = '23514', hint = 'own_listing';
  end if;
  if v_owner is null or v_status in ('archivee', 'donnee') then
    raise exception 'Annonce indisponible' using errcode = '23514', hint = 'listing_unavailable';
  end if;

  insert into public.conversations (listing_id, requester_id) values (p_listing_id, v_uid)
    on conflict (listing_id, requester_id) do nothing
    returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c
      where c.listing_id = p_listing_id and c.requester_id = v_uid;
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------- liste et en-tête de conversation
-- Une ligne par conversation dont l'appelant est participant (côté propriétaire : seulement celles qui
-- contiennent au moins un message). SECURITY DEFINER avec contrôle explicite sur
-- auth.uid() (plutôt qu'une policy RLS qui rendrait lisible, via l'API directe, toute annonce archivée
-- ou donnée dont on a été le demandeur) : seules les colonnes ci-dessous sont exposées.
create type public.conversation_summary as (
  conversation_id        uuid,
  role                   text,         -- 'owner' (propriétaire de l'annonce) ou 'requester' (demandeur)
  created_at             timestamptz,
  last_activity_at       timestamptz,  -- dernier message, sinon création : clé de tri
  listing_id             uuid,
  activity_name          text,
  listing_kind           public.listing_kind,
  listing_status         public.listing_status,
  cover_photo_path       text,         -- 1re photo (bucket public listing-photos), null si aucune
  other_user_id          uuid,         -- null : compte supprimé
  other_display_name     text,         -- null : compte supprimé (« Membre supprimé »)
  is_closed              boolean,      -- l'autre membre n'existe plus : lecture seule
  last_message_excerpt   text,         -- 140 caractères, espaces compactés
  last_message_at        timestamptz,
  last_message_from_me   boolean,
  unread_count           integer,      -- messages de l'autre non lus
  loan_id                uuid,         -- prêt ouvert de CE demandeur sur cette annonce, sinon null ; emprunteur supprimé : rattaché à CHAQUE conversation dont le demandeur est supprimé (le même loan_id peut donc apparaître sur plusieurs conversations)
  loan_started_at        timestamptz,
  loan_due_at            timestamptz
);

create or replace function private.my_conversations(p_conversation_id uuid default null)
returns setof public.conversation_summary
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  -- deux branches indexées (conversations_requester_idx, listings_owner_id_idx) plutôt qu'un OR
  mine as (
    select c.id, c.listing_id, c.requester_id, l.owner_id, c.created_at, 'requester'::text as role
    from me
    join public.conversations c on c.requester_id = me.uid
    join public.listings l on l.id = c.listing_id
    where p_conversation_id is null or c.id = p_conversation_id
    union all
    select c.id, c.listing_id, c.requester_id, l.owner_id, c.created_at, 'owner'::text
    from me
    join public.listings l on l.owner_id = me.uid
    join public.conversations c on c.listing_id = l.id
    -- le propriétaire ne voit une conversation qu'une fois un message envoyé : un simple clic « Contacter »
    -- ne révèle pas le pseudo du demandeur
    where (p_conversation_id is null or c.id = p_conversation_id)
      and exists (select 1 from public.messages x where x.conversation_id = c.id)
  )
  select
    m.id, m.role, m.created_at,
    coalesce(lm.created_at, m.created_at),
    l.id, a.name, l.kind, l.status,
    (select ph.storage_path from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
    other.id, other.display_name,
    (m.requester_id is null or m.owner_id is null),
    left(regexp_replace(lm.body, '\s+', ' ', 'g'), 140),
    lm.created_at,
    lm.sender_id = me.uid,
    coalesce(u.n, 0)::integer,
    lo.id, lo.started_at, lo.due_at
  from mine m
  cross join me
  join public.listings l on l.id = m.listing_id
  join public.activities a on a.id = l.activity_id
  left join public.profiles other
    on other.id = case when m.role = 'owner' then m.requester_id else m.owner_id end
  left join lateral (
    select x.body, x.created_at, x.sender_id from public.messages x
    where x.conversation_id = m.id order by x.created_at desc, x.id desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as n from public.messages x
    where x.conversation_id = m.id and x.read_at is null and x.sender_id is distinct from me.uid
  ) u on true
  left join lateral (
    select ln.id, ln.started_at, ln.due_at from public.loans ln
    where ln.listing_id = m.listing_id and ln.returned_at is null
      -- emprunteur supprimé (borrower_id null) : le prêt ouvert reste rattaché aux conversations dont le
      -- demandeur est lui aussi supprimé, pour que le propriétaire puisse appeler return_loan
      and (ln.borrower_id = m.requester_id or (ln.borrower_id is null and m.requester_id is null))
    limit 1
  ) lo on true
  order by 4 desc, m.id
  limit 200;
$$;

create or replace function public.list_my_conversations()
returns setof public.conversation_summary
language sql
stable
set search_path = ''
as $$
  select * from private.my_conversations(null);
$$;

-- En-tête d'une conversation (même ligne que la liste). Aucune ligne si l'appelant n'est pas participant
-- (ni oracle d'existence).
create or replace function public.get_conversation(p_conversation_id uuid)
returns setof public.conversation_summary
language sql
stable
set search_path = ''
as $$
  select * from private.my_conversations(p_conversation_id) where p_conversation_id is not null;
$$;

-- Badge de l'en-tête : total des messages non lus reçus. Chaque conversation est atteinte par son
-- index, puis ses seuls messages non lus (messages_unread_idx).
create or replace function public.get_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  mine as (
    select c.id from me join public.conversations c on c.requester_id = me.uid
    union all
    select c.id from me
    join public.listings l on l.owner_id = me.uid
    join public.conversations c on c.listing_id = l.id
  )
  select count(*)::integer
  from me, mine m
  join public.messages x on x.conversation_id = m.id
  where x.read_at is null and x.sender_id is distinct from me.uid;
$$;

-- -------------------------------------------------------- mark_conversation_read
-- Pose read_at sur les messages reçus non lus et renvoie leur nombre. SECURITY INVOKER : la RLS
-- (messages_update_read) limite l'effet aux participants et aux messages de l'autre ; un tiers ou un
-- identifiant inconnu donne 0, sans erreur.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.messages
    set read_at = now()
    where conversation_id = p_conversation_id
      and read_at is null
      and sender_id is distinct from (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------- start_loan / return_loan
-- Prêt depuis une conversation, côté propriétaire. SECURITY INVOKER : la RLS et le trigger
-- loans_before_write (règles, hints) s'appliquent. p_due_at facultatif, postérieur à maintenant.
--   42501  auth_required, conversation_not_found (inconnue, ou tu n'es pas le propriétaire de l'annonce),
--          listing_not_found
--   42501  conversation_closed (demandeur supprimé)
--   23514  listing_not_loanable, loan_already_open,
--          listing_not_available, due_date_invalid
create or replace function public.start_loan(p_conversation_id uuid, p_due_at timestamptz default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_listing uuid;
  v_borrower uuid;
  v_loan uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501', hint = 'auth_required';
  end if;
  select c.listing_id, c.requester_id into v_listing, v_borrower
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  where c.id = p_conversation_id and l.owner_id = v_uid;
  if not found then
    raise exception 'Conversation introuvable ou non autorisée' using errcode = '42501', hint = 'conversation_not_found';
  end if;
  if v_borrower is null then
    raise exception 'Le demandeur n''existe plus' using errcode = '42501', hint = 'conversation_closed';
  end if;
  insert into public.loans (listing_id, borrower_id, due_at)
    values (v_listing, v_borrower, p_due_at)
    returning id into v_loan;
  return v_loan;
end;
$$;

--   42501  auth_required, loan_not_found (inconnu, ou pas le tien : un emprunteur ne clôture pas un prêt
--          ouvert ; sur un prêt déjà rendu qu'il peut lire, l'emprunteur reçoit loan_already_returned)
--   23514  loan_already_returned
create or replace function public.return_loan(p_loan_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501', hint = 'auth_required';
  end if;
  update public.loans set returned_at = now() where id = p_loan_id and returned_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    if exists (select 1 from public.loans where id = p_loan_id and returned_at is not null) then
      raise exception 'Ce prêt est déjà clôturé' using errcode = '23514', hint = 'loan_already_returned';
    end if;
    raise exception 'Prêt introuvable ou non autorisé' using errcode = '42501', hint = 'loan_not_found';
  end if;
end;
$$;

-- ------------------------------------------- confidentialité côté propriétaire
-- Garantie : tant qu'AUCUN message n'a été écrit dans une conversation, le propriétaire de l'annonce n'en
-- voit rien (ni la conversation, ni le pseudo du demandeur) : un simple clic « Contacter » ne révèle personne.
-- Appliquée à la source (RLS), pas seulement dans les RPC :
--   * conversations_select (branche propriétaire) : exige au moins un message ; cela couvre aussi
--     messages_select, messages_update_read, la policy realtime.messages (leurs sous-requêtes sur
--     conversations héritent de cette RLS) et start_loan (invoker : conversation_not_found) ;
--   * shares_conversation_with (branche propriétaire) : le profil du demandeur n'est lisible qu'ensuite.
-- Côté demandeur rien ne change (il voit sa conversation et peut écrire le premier message ; le
-- propriétaire peut répondre dès qu'il existe). Un propriétaire ne peut pas écrire le premier message.
--   * loans_before_write (security definer) : une conversation sans message vaut no_conversation, sinon un
--     INSERT direct sur loans vers un uid public (listings.owner_id) révélerait un demandeur silencieux.
-- Fonction security definer pour éviter toute récursion RLS (messages_select dépend de conversations) ;
-- l'index messages (conversation_id, created_at, id) sert la recherche.
create or replace function private.conversation_has_messages(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages m where m.conversation_id = p_conversation_id);
$$;
revoke execute on function private.conversation_has_messages(uuid) from public, anon;
grant execute on function private.conversation_has_messages(uuid) to authenticated;

drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (
    requester_id = (select auth.uid())
    or (
      exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
      and private.conversation_has_messages(id)
    )
  );

create or replace function private.shares_conversation_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    where (c.requester_id = (select auth.uid()) and l.owner_id = p_profile_id)
       or (l.owner_id = (select auth.uid()) and c.requester_id = p_profile_id
           and private.conversation_has_messages(c.id))
  );
$$;

-- ------------------------------------------------------------------ privilèges
-- Création de conversation : uniquement via start_conversation (hints, idempotence). La policy
-- conversations_insert est conservée (défense en profondeur).
revoke insert on public.conversations from authenticated;

revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.list_my_conversations() from public, anon;
revoke execute on function public.get_conversation(uuid) from public, anon;
revoke execute on function public.get_unread_count() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.start_loan(uuid, timestamptz) from public, anon;
revoke execute on function public.return_loan(uuid) from public, anon;
revoke execute on function private.my_conversations(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
grant execute on function public.get_conversation(uuid) to authenticated;
grant execute on function public.get_unread_count() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.start_loan(uuid, timestamptz) to authenticated;
grant execute on function public.return_loan(uuid) to authenticated;
grant execute on function private.my_conversations(uuid) to authenticated;

-- ---------------------------------------------------------------- temps réel
-- Canaux PRIVÉS en Broadcast (plus de postgres_changes). Topics :
--   conversation:<id>  message_created, messages_read, loan_changed   (participants)
--   user:<uid>         inbox_changed                                  (cet utilisateur seulement)
-- Les payloads ne contiennent QUE des identifiants et des compteurs, jamais le corps d'un message :
-- realtime.send persiste chaque diffusion dans realtime.messages (rétention propre à Realtime, hors de
-- nos suppressions de compte) ; le client relit le contenu par l'API, soumise à la RLS.
-- realtime.send avale ses propres erreurs (simple WARNING) : une panne Realtime ne bloque jamais l'écriture.
alter publication supabase_realtime drop table public.messages;

-- Lecture des diffusions : un utilisateur ne reçoit que son topic user:<uid> et les conversations dont il
-- est participant (la sous-requête hérite de la RLS de conversations). Aucune policy INSERT : un client ne
-- peut rien émettre sur ces canaux (seuls les triggers ci-dessous publient). L'identifiant est extrait par
-- regexp_match (NULL si le topic n'a pas la forme exacte) : un CASE ne suffit pas, le planificateur évalue
-- le cast uuid à l'estimation et lèverait une erreur sur un topic quelconque.
create policy messagerie_broadcast_select on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    -- la ligne doit porter le topic autorisé : sinon un abonné à user:<moi> lirait aussi les lignes des autres
    and topic = (select realtime.topic())
    and (
      (select realtime.topic()) = 'user:' || (select auth.uid())::text
      or exists (
        select 1 from public.conversations c
        where c.id = (regexp_match((select realtime.topic()),
          '^conversation:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))[1]::uuid
      )
    )
  );

-- Nouveau message : conversation:<id> + inbox_changed au destinataire.
create or replace function private.messages_broadcast_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req uuid;
  v_owner uuid;
  v_recipient uuid;
begin
  select c.requester_id, l.owner_id into v_req, v_owner
  from public.conversations c join public.listings l on l.id = c.listing_id
  where c.id = new.conversation_id;
  v_recipient := case when new.sender_id is not distinct from v_req then v_owner else v_req end;

  perform realtime.send(
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id,
                       'sender_id', new.sender_id, 'created_at', new.created_at),
    'message_created', 'conversation:' || new.conversation_id::text);
  if v_recipient is not null then
    perform realtime.send(
      jsonb_build_object('conversation_id', new.conversation_id, 'reason', 'message'),
      'inbox_changed', 'user:' || v_recipient::text);
  end if;
  return null;
end;
$$;
create trigger messages_broadcast_insert after insert on public.messages
  for each row execute function private.messages_broadcast_insert();

-- Lecture : un seul événement par conversation et par instruction (tables de transition), pas un par
-- message. Pas de liste de colonnes possible avec les tables de transition : on filtre NULL -> non NULL.
create or replace function private.messages_broadcast_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r record;
begin
  for r in
    select n.conversation_id, count(*)::integer as n
    from new_rows n join old_rows o on o.id = n.id
    where o.read_at is null and n.read_at is not null
    group by n.conversation_id
  loop
    perform realtime.send(
      jsonb_build_object('conversation_id', r.conversation_id, 'count', r.n, 'reader_id', v_uid),
      'messages_read', 'conversation:' || r.conversation_id::text);
    if v_uid is not null then
      perform realtime.send(
        jsonb_build_object('conversation_id', r.conversation_id, 'reason', 'read'),
        'inbox_changed', 'user:' || v_uid::text);
    end if;
  end loop;
  return null;
end;
$$;
create trigger messages_broadcast_read after update on public.messages
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.messages_broadcast_read();

-- Prêt créé ou modifié (retour compris) : conversation:<id> + inbox_changed aux deux parties.
create or replace function private.loans_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_conv uuid;
  v_payload jsonb;
  v_user uuid;
begin
  -- pas de diffusion pour une mise à jour à vide (le client ne peut modifier que due_at et returned_at)
  if tg_op = 'UPDATE' and new.due_at is not distinct from old.due_at
     and new.returned_at is not distinct from old.returned_at
     and new.borrower_id is not distinct from old.borrower_id then
    return null;
  end if;
  select l.owner_id into v_owner from public.listings l where l.id = new.listing_id;
  select c.id into v_conv from public.conversations c
    where c.listing_id = new.listing_id and c.requester_id = new.borrower_id;
  v_payload := jsonb_build_object('conversation_id', v_conv, 'loan_id', new.id, 'listing_id', new.listing_id,
                                  'returned', new.returned_at is not null);
  if v_conv is not null then
    perform realtime.send(v_payload, 'loan_changed', 'conversation:' || v_conv::text);
  end if;
  foreach v_user in array array[v_owner, new.borrower_id] loop
    if v_user is not null then
      perform realtime.send(
        jsonb_build_object('conversation_id', v_conv, 'reason', 'loan'),
        'inbox_changed', 'user:' || v_user::text);
    end if;
  end loop;
  return null;
end;
$$;
create trigger loans_broadcast after insert or update on public.loans
  for each row execute function private.loans_broadcast();

revoke execute on function private.validate_message() from public, anon, authenticated;
revoke execute on function private.messages_broadcast_insert() from public, anon, authenticated;
revoke execute on function private.messages_broadcast_read() from public, anon, authenticated;
revoke execute on function private.loans_broadcast() from public, anon, authenticated;
