-- Bucket public « listing-photos » : lecture publique par URL, écriture dans {auth.uid()}/{nom}.{ext}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pas de policy SELECT pour anon : un bucket public se lit par URL sans policy,
-- ce qui évite le listing/l'énumération des fichiers.
-- Le chemin complet est contraint (pas de « .. », pas de sous-dossier, extension image).
create policy "listing_photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and starts_with(name, (select auth.uid())::text || '/'));
create policy "listing_photos_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$')
  );
create policy "listing_photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'listing-photos' and starts_with(name, (select auth.uid())::text || '/'))
  with check (
    bucket_id = 'listing-photos'
    and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$')
  );
create policy "listing_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and starts_with(name, (select auth.uid())::text || '/'));
