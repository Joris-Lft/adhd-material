-- Tables, contraintes, index, triggers. La RLS et les privilèges sont dans la migration suivante.

create type public.listing_kind as enum ('don', 'pret');
create type public.listing_status as enum ('disponible', 'reservee', 'donnee', 'pretee', 'archivee');

-- ---------------------------------------------------------------- cities
-- Référentiel des communes : alimenté par la migration de données (aucune écriture client).
create table public.cities (
  id              uuid primary key default gen_random_uuid(),
  insee_code      text not null unique check (insee_code ~ '^([0-9]{5}|2[AB][0-9]{3})$'),
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  name_normalized text generated always as (public.normalize_place(name)) stored,
  -- une commune peut avoir plusieurs codes postaux
  postal_codes    text[] not null default '{}'
                  check (array_to_string(postal_codes, ',') ~ '^([0-9]{5}(,[0-9]{5})*)?$'),
  population      integer check (population >= 0),
  location        extensions.geography(Point, 4326) not null,
  created_at      timestamptz not null default now()
);
create index cities_location_gist on public.cities using gist (location);
create index cities_name_trgm_idx on public.cities using gin (name_normalized extensions.gin_trgm_ops);

-- -------------------------------------------------------------- profiles
-- Le pseudo est public mais neutre : jamais dérivé de l'email ni des métadonnées OAuth
-- (être inscrit sur une plateforme TDAH peut révéler une donnée de santé).
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text not null,
  display_name_normalized text generated always as (public.normalize_text(display_name)) stored,
  display_name_confirmed  boolean not null default false,
  city_id                 uuid references public.cities (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 3 and 30),
  constraint profiles_display_name_normalized_length check (char_length(display_name_normalized) >= 3),
  -- unicité insensible à la casse, aux accents et aux caractères invisibles (anti-usurpation)
  constraint profiles_display_name_normalized_key unique (display_name_normalized)
);
create index profiles_city_id_idx on public.profiles (city_id);

-- Nettoie le pseudo et refuse les noms réservés (comparés sous forme normalisée) ainsi que le motif
-- « membre-… » (réservé aux pseudos générés : seul l'INSERT du trigger d'inscription peut le poser).
create or replace function private.clean_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_norm text;
begin
  new.display_name := public.clean_text(new.display_name);
  v_norm := public.normalize_text(new.display_name);
  if exists (
    select 1
    from unnest(array[
      'admin', 'administrateur', 'modération', 'moderateur', 'support', 'équipe', 'staff',
      'adhd-material', 'adhd material', 'system', 'système', 'anonyme', 'membre supprimé'
    ]) r
    where public.normalize_text(r) = v_norm
  ) then
    raise exception 'Ce pseudo n''est pas disponible' using errcode = '23514';
  end if;
  if v_norm ~ '^membre-'
     and (tg_op = 'UPDATE' and new.display_name is distinct from old.display_name) then
    raise exception 'Ce pseudo n''est pas disponible' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profiles_clean_display_name before insert or update of display_name on public.profiles
  for each row execute function private.clean_display_name();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Pseudo neutre « Membre-XXXX » (alphabet sans caractères ambigus).
create or replace function private.generate_pseudo(p_len integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_pseudo text := 'Membre-';
begin
  for i in 1..p_len loop
    v_pseudo := v_pseudo || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
  end loop;
  return v_pseudo;
end;
$$;

-- Création du profil à l'inscription ; nouvel essai en cas de collision de pseudo.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  for i in 1..10 loop
    begin
      insert into public.profiles (id, display_name)
      values (new.id, private.generate_pseudo(case when i <= 5 then 4 else 8 end));
      return new;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = new.id) then
        return new;
      end if;
    end;
  end loop;
  raise exception 'Impossible de générer un pseudo unique';
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ------------------------------------------------------------ activities
create table public.activities (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 60),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint activities_name_normalized_length check (char_length(name_normalized) >= 2),
  constraint activities_name_normalized_key unique (name_normalized)
);
create index activities_name_trgm_idx on public.activities using gin (name_normalized extensions.gin_trgm_ops);
create index activities_created_by_idx on public.activities (created_by, created_at);

create or replace function private.clean_activity_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := public.clean_text(new.name);
  return new;
end;
$$;
create trigger activities_clean_name before insert on public.activities
  for each row execute function private.clean_activity_name();

-- -------------------------------------------------------------- listings
-- Propriétaire supprimé : l'annonce est conservée, anonymisée (owner_id = null) et archivée ; son contenu
-- est purgé par le trigger profiles_purge_listings. Conversations, messages, prêts et signalements
-- restent pour l'autre partie (le front affiche « Annonce supprimée » / « Membre supprimé »).
create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  activity_id uuid not null references public.activities (id) on delete restrict,
  kind        public.listing_kind not null,
  status      public.listing_status not null default 'disponible',
  city_id     uuid not null references public.cities (id) on delete restrict,
  description text check (char_length(description) <= 2000),
  experience  text check (char_length(experience) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- un don ne peut pas être « prêté » et un prêt ne peut pas être « donné »
  constraint listings_kind_status_coherent check (
    (kind = 'don' and status <> 'pretee') or (kind = 'pret' and status <> 'donnee')
  ),
  -- une annonce sans propriétaire est forcément archivée (donc invisible)
  constraint listings_orphan_archived check (owner_id is not null or status = 'archivee')
);
create index listings_owner_id_idx on public.listings (owner_id);
create index listings_activity_id_idx on public.listings (activity_id);
create index listings_city_id_idx on public.listings (city_id);
create trigger listings_set_updated_at before update on public.listings
  for each row execute function private.set_updated_at();

-- -------------------------------------------------------- listing_photos
create table public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  -- {uid}/{nom}.{ext} : pas de « .. », pas de sous-dossier, extension image
  storage_path text not null unique
               check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$'),
  position     smallint not null check (position between 1 and 3),
  created_at   timestamptz not null default now(),
  constraint listing_photos_listing_position_key unique (listing_id, position)
);

-- ----------------------------------------------------------------- loans
-- Emprunteur supprimé : le prêt est conservé (borrower_id = null, « Membre supprimé »)
-- et reste ouvert ; le prêteur le clôture.
create table public.loans (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  borrower_id uuid references public.profiles (id) on delete set null,
  started_at  timestamptz not null default now(),
  due_at      timestamptz,
  returned_at timestamptz,
  constraint loans_due_after_start check (due_at is null or due_at >= started_at),
  constraint loans_return_after_start check (returned_at is null or returned_at >= started_at)
);
create index loans_listing_id_idx on public.loans (listing_id);
create index loans_borrower_id_idx on public.loans (borrower_id);
-- un seul prêt en cours par annonce
create unique index loans_one_open_per_listing on public.loans (listing_id) where returned_at is null;

-- Cycle de vie des prêts (security definer : seul chemin autorisé pour passer une annonce
-- vers/depuis « pretee », cf. listings_guard_status). Les erreurs ne révèlent rien d'une
-- annonce qui n'appartient pas à l'appelant.
create or replace function private.loans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_listing from public.listings
      where id = new.listing_id and owner_id = (select auth.uid()) for update;
    if not found then
      raise exception 'Annonce introuvable ou non autorisée' using errcode = '42501';
    end if;
    if v_listing.kind <> 'pret' then
      raise exception 'Seule une annonce de type prêt peut avoir un prêt' using errcode = '23514';
    end if;
    if v_listing.status not in ('disponible', 'reservee') then
      raise exception 'Cette annonce n''est pas prêtable dans son état actuel' using errcode = '23514';
    end if;
    if new.borrower_id is null or not exists (
      select 1 from public.conversations c
      where c.listing_id = new.listing_id and c.requester_id = new.borrower_id
    ) then
      raise exception 'Aucune conversation avec cet utilisateur sur cette annonce' using errcode = '23514';
    end if;
    new.returned_at := null;
    perform set_config('app.loan_sync', 'on', true);
    update public.listings set status = 'pretee' where id = new.listing_id;
    perform set_config('app.loan_sync', 'off', true);
  else
    if new.listing_id <> old.listing_id
       or (new.borrower_id is distinct from old.borrower_id and new.borrower_id is not null) then
      raise exception 'listing_id et borrower_id sont immuables' using errcode = '23514';
    end if;
    -- returned_at est posé par le serveur (une seule fois), jamais par le client
    if old.returned_at is not null then
      new.returned_at := old.returned_at;
    elsif new.returned_at is not null then
      new.returned_at := now();
      perform set_config('app.loan_sync', 'on', true);
      update public.listings set status = 'disponible' where id = new.listing_id and status = 'pretee';
      perform set_config('app.loan_sync', 'off', true);
    end if;
  end if;
  return new;
end;
$$;
create trigger loans_before_write before insert or update on public.loans
  for each row execute function private.loans_before_write();

-- Suppression (hors client) d'un prêt en cours : l'annonce redevient disponible.
create or replace function private.loans_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.returned_at is null then
    perform set_config('app.loan_sync', 'on', true);
    update public.listings set status = 'disponible' where id = old.listing_id and status = 'pretee';
    perform set_config('app.loan_sync', 'off', true);
  end if;
  return old;
end;
$$;
create trigger loans_after_delete after delete on public.loans
  for each row execute function private.loans_after_delete();

-- Garde-fou sur les changements de statut/type. Seuls les triggers de loans (et la purge d'un compte)
-- lèvent le garde-fou en posant le signal app.loan_sync = 'on' le temps de leur UPDATE ; les clients
-- PostgREST ne peuvent pas appeler set_config (seul le schéma public est exposé).
create or replace function private.listings_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.loan_sync', true), 'off') = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'pretee' or old.status = 'pretee' then
      raise exception 'Le statut « prêtée » est géré par l''enregistrement du prêt et de son retour'
        using errcode = '23514';
    end if;
    if new.status in ('disponible', 'reservee')
       and exists (select 1 from public.loans where listing_id = old.id and returned_at is null) then
      raise exception 'Un prêt est en cours sur cette annonce' using errcode = '23514';
    end if;
  end if;
  if new.kind is distinct from old.kind and exists (select 1 from public.loans where listing_id = old.id) then
    raise exception 'Le type d''une annonce ayant eu un prêt ne peut plus changer' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger listings_guard_status before update on public.listings
  for each row execute function private.listings_guard_status();

-- Suppression d'un compte : AVANT la suppression du profil (donc avant les actions référentielles
-- set null/cascade), on clôt les prêts ouverts sur ses annonces (le prêteur n'est plus là pour le
-- faire ; l'emprunteur voit son prêt terminé), puis on purge le contenu des annonces et leurs photos
-- (lignes ; les fichiers Storage sont supprimés par l'Edge Function delete-account).
-- Un trigger sur profiles couvre tous les chemins de suppression (Edge Function, dashboard, SQL).
create or replace function private.profiles_purge_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.loans set returned_at = now()
  where returned_at is null
    and listing_id in (select id from public.listings where owner_id = old.id);

  perform set_config('app.loan_sync', 'on', true);
  update public.listings set description = null, experience = null, status = 'archivee'
  where owner_id = old.id;
  perform set_config('app.loan_sync', 'off', true);

  delete from public.listing_photos
  where listing_id in (select id from public.listings where owner_id = old.id);
  return old;
end;
$$;
create trigger profiles_purge_listings before delete on public.profiles
  for each row execute function private.profiles_purge_listings();

-- --------------------------------------------------------- conversations
-- Demandeur supprimé : la conversation et ses messages restent pour le propriétaire.
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  requester_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint conversations_listing_requester_key unique (listing_id, requester_id)
);
create index conversations_requester_idx on public.conversations (requester_id, created_at);

-- -------------------------------------------------------------- messages
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at);

-- read_at : seulement NULL -> maintenant (pas de valeur forgée, pas de remise à NULL).
create or replace function private.messages_guard_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.read_at is not null then
    new.read_at := old.read_at;
  elsif new.read_at is not null then
    new.read_at := now();
  end if;
  return new;
end;
$$;
create trigger messages_guard_read_at before update on public.messages
  for each row execute function private.messages_guard_read_at();

-- --------------------------------------------------------------- reports
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason      text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at  timestamptz not null default now(),
  constraint reports_listing_reporter_key unique (listing_id, reporter_id)
);
create index reports_reporter_id_idx on public.reports (reporter_id);

-- ------------------------------------------------------------ anti-spam
-- Plafonds par utilisateur connecté (auth.uid()), appliqués avant insertion.
-- SQLSTATE PT429 : PostgREST répond HTTP 429 (Too Many Requests).
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
    raise exception 'Trop de messages envoyés en une minute, réessaie dans un instant' using errcode = 'PT429';
  end if;
  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Limite de 300 messages par jour atteinte' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
create trigger messages_limit before insert on public.messages
  for each row execute function private.limit_messages();

create or replace function private.limit_activities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null
     and (select count(*) from public.activities where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite de 10 nouvelles activités par jour atteinte' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
create trigger activities_limit before insert on public.activities
  for each row execute function private.limit_activities();

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
    raise exception 'Limite de 20 nouvelles conversations par jour atteinte' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
create trigger conversations_limit before insert on public.conversations
  for each row execute function private.limit_conversations();

-- Temps réel : diffusion des nouveaux messages (filtrée par la RLS).
alter publication supabase_realtime add table public.messages;
