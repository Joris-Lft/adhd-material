-- Lot 7 : signalement d'annonce par RPC + verrouillage des photos publiées dans Storage.
-- Clés d'erreur : SQLSTATE + hint stable ; le front ne compare jamais les messages (cf. create_listing).

-- Ne pas attendre indéfiniment un verrou sur reports/storage.objects (limité à cette transaction).
select set_config('lock_timeout', '5s', true);

-- ------------------------------------------------------------------ reports
-- category : motif choisi dans une liste fermée. reason : précisions facultatives (obligatoires pour 'autre').
-- Les signalements existants n'avaient qu'un texte libre : ils passent en catégorie 'autre'. Leur texte est
-- nettoyé et tronqué à 1000 caractères (l'ancien CHECK mesurait btrim(reason)) ; s'il est vide ou de moins de
-- 3 caractères une fois nettoyé, il est remplacé par un texte par défaut (« autre » exige des précisions).
alter table public.reports add column category text;
update public.reports r
  set category = 'autre',
      reason = coalesce(
        (select c from (select left(private.clean_multiline_text(r.reason), 1000) as c) s where char_length(c) >= 3),
        'Signalement antérieur sans précision')
  where r.category is null;
alter table public.reports alter column category set not null;
alter table public.reports alter column reason drop not null;
alter table public.reports drop constraint reports_reason_check;
alter table public.reports
  add constraint reports_category_check check (category in ('arnaque', 'inapproprie', 'dangereux', 'donnees_personnelles', 'autre')),
  add constraint reports_reason_check check (reason is null or char_length(reason) between 3 and 1000),
  add constraint reports_autre_needs_reason check (category <> 'autre' or reason is not null);

-- ------------------------------------------------------------ report_listing
-- Seul chemin d'écriture (le grant INSERT client est retiré plus bas). SECURITY DEFINER : l'état de l'annonce
-- est lu sans dépendre de la RLS et rien n'est révélé (inexistante, archivée d'autrui ou orpheline : même
-- réponse listing_unavailable). Donnée, réservée et prêtée restent signalables tant qu'elles sont visibles.
--   42501  auth_required
--   22023  category_invalid
--   23514  listing_unavailable, own_listing, details_required (catégorie 'autre'), details_too_short (< 3),
--          details_too_long (> 1000)
--   23505  already_reported (un signalement par annonce et par utilisateur)
--   PT429  report_rate_limit (10 signalements par 24 h)
-- Pas de masquage automatique après N signalements : le traitement se fait dans le dashboard (vue private.reports_overview).
create or replace function public.report_listing(p_listing_id uuid, p_category text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_status public.listing_status;
  v_details text;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour signaler une annonce' using errcode = '42501', hint = 'auth_required';
  end if;
  if p_category is null or p_category not in ('arnaque', 'inapproprie', 'dangereux', 'donnees_personnelles', 'autre') then
    raise exception 'Motif de signalement inconnu' using errcode = '22023', hint = 'category_invalid';
  end if;

  select l.owner_id, l.status into v_owner, v_status from public.listings l where l.id = p_listing_id;
  if not found or (v_owner is distinct from v_uid and (v_owner is null or v_status = 'archivee')) then
    raise exception 'Annonce indisponible' using errcode = '23514', hint = 'listing_unavailable';
  end if;
  if v_owner = v_uid then
    raise exception 'C''est ta propre annonce' using errcode = '23514', hint = 'own_listing';
  end if;

  -- garde-fou avant tout traitement regex
  if octet_length(p_details) > 10000 then
    raise exception 'Les précisions sont limitées à 1000 caractères' using errcode = '23514', hint = 'details_too_long';
  end if;
  v_details := private.clean_multiline_text(p_details);
  if v_details is null then
    if p_category = 'autre' then
      raise exception 'Précise ce qui pose problème' using errcode = '23514', hint = 'details_required';
    end if;
  elsif char_length(v_details) > 1000 then
    raise exception 'Les précisions sont limitées à 1000 caractères' using errcode = '23514', hint = 'details_too_long';
  elsif char_length(v_details) < 3 then
    raise exception 'Les précisions sont trop courtes' using errcode = '23514', hint = 'details_too_short';
  end if;

  -- sérialise les signalements d'un même utilisateur : le plafond et l'unicité tiennent en concurrence
  perform pg_advisory_xact_lock(hashtextextended('report_listing:' || v_uid::text, 0));
  if exists (select 1 from public.reports r where r.listing_id = p_listing_id and r.reporter_id = v_uid) then
    raise exception 'Tu as déjà signalé cette annonce' using errcode = '23505', hint = 'already_reported';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite de 10 signalements par jour atteinte' using errcode = 'PT429', hint = 'report_rate_limit';
  end if;

  insert into public.reports (listing_id, reporter_id, category, reason)
    values (p_listing_id, v_uid, p_category, v_details);
end;
$$;

revoke execute on function public.report_listing(uuid, text, text) from public, anon;
grant execute on function public.report_listing(uuid, text, text) to authenticated;

-- La RPC devient le seul chemin d'écriture ; la policy reports_insert reste en défense en profondeur.
revoke insert on public.reports from authenticated;

-- ------------------------------------------------- traitement (dashboard)
comment on table public.reports is
  'Signalements d''annonces, traités à la main dans le dashboard (aucune lecture client, écriture via report_listing). '
  'id ; listing_id : annonce signalée (cascade) ; reporter_id : auteur, null si son compte a été supprimé ; '
  'category : arnaque | inapproprie | dangereux | donnees_personnelles | autre ; '
  'reason : précisions facultatives (obligatoires pour autre), 3 à 1000 caractères ; created_at. '
  'Un signalement par (annonce, auteur). Aucun masquage automatique : voir la vue private.reports_overview.';

-- Vue de tri pour le dashboard : signalements avec annonce et nombre de signalements par annonce. Dans le
-- schéma private (non exposé par l'API) ; lecture réservée à postgres (SQL editor) (revoke explicite : les
-- privilèges par défaut de Supabase accorderaient sinon l'accès). Dans le SQL editor du dashboard :
--   select * from private.reports_overview order by created_at desc limit 100;
create view private.reports_overview with (security_invoker = true) as
select
  r.id as report_id,
  r.created_at,
  r.category,
  r.reason,
  r.reporter_id,
  r.listing_id,
  l.status as listing_status,
  l.kind as listing_kind,
  l.owner_id as listing_owner_id,
  a.name as activity_name,
  count(*) over (partition by r.listing_id) as listing_report_count
from public.reports r
join public.listings l on l.id = r.listing_id
left join public.activities a on a.id = l.activity_id;
revoke all on private.reports_overview from public, anon, authenticated, service_role;
comment on view private.reports_overview is
  'Dashboard uniquement (postgres, SQL editor) : signalements avec le nombre de signalements par annonce. Trier par created_at desc.';

-- --------------------------------------------------- Storage : photos publiées
-- Un fichier référencé par listing_photos ne peut plus être modifié, déplacé ni écrasé (upsert = insert on
-- conflict do update, soumis à cette policy) par son propriétaire : pas de photo fantôme ni de remplacement
-- d'image après signalement. Pour changer une photo : en uploader une nouvelle, puis modifier l'annonce.
drop policy "listing_photos_update_own" on storage.objects;
create policy "listing_photos_update_own" on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and starts_with(name, (select auth.uid())::text || '/')
    and not (select private.listing_photo_in_use(name))
  )
  with check (
    bucket_id = 'listing-photos'
    and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$')
    and not (select private.listing_photo_in_use(name))
  );
