-- RLS sur toutes les tables + privilèges minimaux (grants au niveau colonne).
-- Toute la sécurité de l'app repose sur ce fichier : le front parle directement à PostgREST.

alter table public.cities         enable row level security;
alter table public.profiles       enable row level security;
alter table public.activities     enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_photos enable row level security;
alter table public.loans          enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.reports        enable row level security;

revoke all on table public.cities, public.profiles, public.activities, public.listings,
  public.listing_photos, public.loans, public.conversations, public.messages, public.reports
  from anon, authenticated;

-- Lecture
grant select on public.cities, public.listings, public.listing_photos to anon, authenticated;
-- Profil public minimal : (id, display_name) uniquement. city_id et display_name_confirmed
-- ne sont lisibles que par soi-même via get_my_profile().
grant select (id, display_name) on public.profiles to anon, authenticated;
-- created_by n'est pas exposé.
grant select (id, name, name_normalized, created_at) on public.activities to anon, authenticated;
grant select on public.loans, public.conversations, public.messages to authenticated;

-- Écriture (colonnes strictement nécessaires ; owner_id/sender_id/... viennent du défaut auth.uid())
grant update (display_name, city_id, display_name_confirmed) on public.profiles to authenticated;
grant insert (name) on public.activities to authenticated;
grant insert (activity_id, kind, city_id, description, experience) on public.listings to authenticated;
grant update (activity_id, kind, status, city_id, description, experience) on public.listings to authenticated;
grant insert (listing_id, storage_path, position), update (storage_path, position), delete
  on public.listing_photos to authenticated;
grant insert (listing_id, borrower_id, due_at), update (due_at, returned_at) on public.loans to authenticated;
grant insert (listing_id) on public.conversations to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant insert (listing_id, reason) on public.reports to authenticated;

-- cities : lecture publique, aucune écriture client (référentiel géré par migration).
create policy cities_select on public.cities for select to anon, authenticated using (true);

-- activities : lecture publique ; création libre par les connectés (dédoublonnage par contrainte unique).
create policy activities_select on public.activities for select to anon, authenticated using (true);
create policy activities_insert on public.activities for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Helper : le membre partage-t-il (ou a-t-il partagé) une conversation avec l'utilisateur courant ?
-- security definer : évite la dépendance à la visibilité des annonces archivées.
-- Exécutable par anon (renvoie toujours false sans utilisateur) pour pouvoir figurer dans une
-- policy unique ; c'est la seule fonction du schéma private accordée.
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
       or (l.owner_id = (select auth.uid()) and c.requester_id = p_profile_id)
  );
$$;
revoke execute on function private.shares_conversation_with(uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.shares_conversation_with(uuid) to anon, authenticated;

-- profiles : visible si c'est moi, ou si le membre a une annonce visible (donneur), ou en conversation avec moi.
-- Pas de policy insert (trigger security definer) ni delete (cascade depuis auth.users).
create policy profiles_select on public.profiles for select to anon, authenticated
  using (
    id = (select auth.uid())
    or exists (select 1 from public.listings l where l.owner_id = profiles.id and l.status <> 'archivee')
    or ((select auth.uid()) is not null and private.shares_conversation_with(id))
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- listings : lecture publique sauf archivées (visibles de leur propriétaire). Pas de suppression
-- côté client : on archive.
create policy listings_select on public.listings for select to anon, authenticated
  using (status <> 'archivee' or owner_id = (select auth.uid()));
create policy listings_insert on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'disponible');
create policy listings_update on public.listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- listing_photos : visibles si l'annonce l'est (la RLS de listings s'applique dans la sous-requête).
-- Le chemin doit commencer par « {uid}/ » (le format exact est imposé par un CHECK).
create policy listing_photos_select on public.listing_photos for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
create policy listing_photos_insert on public.listing_photos for insert to authenticated
  with check (
    starts_with(storage_path, (select auth.uid())::text || '/')
    and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  );
create policy listing_photos_update on public.listing_photos for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (starts_with(storage_path, (select auth.uid())::text || '/'));
create policy listing_photos_delete on public.listing_photos for delete to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

-- loans : gérés par le propriétaire de l'annonce, lisibles aussi par l'emprunteur.
-- Règles métier (conversation préalable, statuts, returned_at) : trigger loans_before_write.
create policy loans_select on public.loans for select to authenticated
  using (
    borrower_id = (select auth.uid())
    or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  );
create policy loans_insert on public.loans for insert to authenticated
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy loans_update on public.loans for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

-- conversations : participants = demandeur + propriétaire de l'annonce.
-- Ouverture : connecté, annonce visible (donc non archivée), et pas sa propre annonce.
create policy conversations_select on public.conversations for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  );
create policy conversations_insert on public.conversations for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id <> (select auth.uid()))
  );

-- messages : la sous-requête sur conversations hérite de sa RLS (participants uniquement).
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  );
-- Seul le destinataire (participant non expéditeur) peut marquer comme lu.
create policy messages_update_read on public.messages for update to authenticated
  using (sender_id is distinct from (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id))
  with check (sender_id is distinct from (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id));

-- reports : insertion seule, aucune lecture côté client (pas de grant select, pas de policy select).
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.listings l where l.id = listing_id)
  );
