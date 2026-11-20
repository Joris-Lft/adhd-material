-- Lot 5a : publication atomique d'une annonce, invariants photos garantis par la base, anti-spam.
-- Le front uploade d'abord les photos dans le bucket « listing-photos » ({uid}/{nom}.{ext}), puis appelle
-- create_listing() : annonce et photos sont insérées dans la même transaction.
-- Les invariants sont tenus par la base, quel que soit le chemin d'écriture (RPC, grants client sur
-- listing_photos, SQL) :
--   * chaque photo pointe vers un fichier Storage existant appartenant au propriétaire de l'annonce
--     (trigger listing_photos_check_file, BEFORE ; ignoré quand un autre utilisateur vise l'annonce, la
--     RLS refuse alors sans rien révéler) ;
--   * une annonce non archivée a au moins une photo, vérifié en fin de transaction
--     (constraint triggers différés sur listings et listing_photos, sous verrou de l'annonce) ;
--   * un fichier Storage référencé par une photo ne peut pas être supprimé par son propriétaire
--     (policy listing_photos_delete_own) ;
--   * description/experience sont nettoyées à la création et à la modification (trigger listings_clean_text) ;
--   * 20 annonces créées par jour et par utilisateur.
-- Clés d'erreur stables : SQLSTATE + hint (cf. create_listing).

-- Filet de sécurité : une annonce non archivée sans photo violerait le nouvel invariant au prochain
-- changement de statut. On les archive (le garde-fou de statut est suspendu le temps de la mise à jour).
do $$
declare
  v_count integer;
begin
  alter table public.listings disable trigger listings_guard_status;
  update public.listings l set status = 'archivee'
  where l.status <> 'archivee'
    and not exists (select 1 from public.listing_photos p where p.listing_id = l.id);
  get diagnostics v_count = row_count;
  alter table public.listings enable trigger listings_guard_status;
  raise notice 'create_listing : % annonce(s) sans photo archivée(s)', v_count;
end $$;

-- --------------------------------------------- caractères invisibles (clean_text)
-- Ajout à la classe retirée : U+061C, U+180E, U+2061-2064, U+E0000-E007F. Reste du comportement inchangé.
-- (create or replace ne recalcule pas les colonnes générées : elles sont recalculées en fin de migration.)
create or replace function public.clean_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(t,
        '['
        '\u00AD'          -- trait d''union conditionnel (soft hyphen)
        '\u061C'          -- marque de lettre arabe
        '\u180E'          -- séparateur voyelle mongol
        '\u200B-\u200D'    -- espaces de largeur nulle, ZWNJ, ZWJ
        '\u200E\u200F'     -- marques directionnelles LRM/RLM
        '\u202A-\u202E'    -- contrôles bidi (embedding/override)
        '\u2060-\u2064'    -- word joiner et opérateurs invisibles
        '\u2066-\u2069'    -- isolats bidi
        '\uFEFF'          -- BOM / espace insécable de largeur nulle
        '\U000E0000-\U000E007F'  -- caractères de tag
        ']', '', 'g'),
      '['
      '\u00A0'            -- espace insécable
      '\u1680'            -- espace ogham
      '\u2000-\u200A'      -- espaces typographiques (en, em, fine...)
      '\u202F'            -- espace fine insécable
      '\u205F'            -- espace mathématique moyenne
      '\u3000'            -- espace idéographique
      ']', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- ------------------------------------------------------------ anti-spam
-- 20 annonces créées par jour et par utilisateur connecté (SQLSTATE PT429 -> HTTP 429).
create or replace function private.limit_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null
     and (select count(*) from public.listings where owner_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Limite de 20 nouvelles annonces par jour atteinte'
      using errcode = 'PT429', hint = 'listing_rate_limit';
  end if;
  return new;
end;
$$;
create trigger listings_limit before insert on public.listings
  for each row execute function private.limit_listings();

-- Contraintes de longueur nommées explicitement (le mapping de create_listing s'appuie dessus).
alter table public.listings rename constraint listings_description_check to listings_description_length;
alter table public.listings rename constraint listings_experience_check to listings_experience_length;

-- ------------------------------------------------- nettoyage multiligne
-- Pour description/experience : conserve les retours à la ligne (clean_text les aplatit).
-- \r\n, \r, U+2028, U+2029 -> \n ; caractères invisibles/bidi/de contrôle retirés (sauf \n) ; espaces
-- horizontaux compactés ; chaque ligne trimée ; 2 lignes vides consécutives au plus ; trim global ;
-- vide -> null.
create or replace function private.clean_multiline_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(t, '\r\n?|[\u2028\u2029]', E'\n', 'g'),
                '['
                '\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF'  -- invisibles et bidi
                '\U000E0000-\U000E007F'                                                        -- caractères de tag
                '\x01-\x08\x0B\x0C\x0E-\x1F\x7F\u0080-\u009F'                                  -- contrôles (hors \t et \n)
              ']', '', 'g'),
            '[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]', ' ', 'g'),
          ' {2,}', ' ', 'g'),
        ' ?\n ?', E'\n', 'g'),
      '\n{4,}', E'\n\n\n', 'g'),
    E' \n'), '');
$$;

-- Appliqué à la création et à chaque modification : le CHECK <= 2000 porte donc sur le texte nettoyé.
create or replace function private.clean_listing_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.description := private.clean_multiline_text(new.description);
  new.experience := private.clean_multiline_text(new.experience);
  return new;
end;
$$;
create trigger listings_clean_text before insert or update of description, experience on public.listings
  for each row execute function private.clean_listing_text();

-- ------------------------------------------------- invariants photos
-- Chaque photo référence un fichier du bucket listing-photos appartenant au propriétaire de l'annonce.
-- Definer : lecture de storage.objects indépendante de la RLS. Un chemin qui ne respecte pas la regex est
-- laissé au CHECK de la table (même erreur qu'avant).
create or replace function private.check_listing_photo_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.storage_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$' then
    return new;
  end if;
  select owner_id into v_owner from public.listings where id = new.listing_id;
  -- Un autre utilisateur vise l'annonce : on ne dit rien du fichier, la RLS refuse (42501).
  if (select auth.uid()) is not null and (select auth.uid()) is distinct from v_owner then
    return new;
  end if;
  if v_owner is null or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'listing-photos' and o.name = new.storage_path and o.owner_id = v_owner::text) then
    raise exception 'Une photo n''a pas été envoyée : réessaie l''envoi'
      using errcode = '23503', hint = 'photo_missing';
  end if;
  return new;
end;
$$;
create trigger listing_photos_check_file before insert or update of storage_path, listing_id on public.listing_photos
  for each row execute function private.check_listing_photo_file();

-- Une annonce non archivée a au moins une photo, vérifié en fin de transaction (la RPC insère l'annonce
-- puis ses photos). Une annonce supprimée (cascade) n'est pas contrôlée ; l'archivage (suppression de
-- compte : archivage puis purge des photos) est autorisé sans photo.
create or replace function private.check_listing_has_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.listing_status;
begin
  if tg_table_name = 'listings' then
    v_id := new.id;
  else
    v_id := old.listing_id;
  end if;
  -- Verrou de l'annonce : deux suppressions concurrentes de photos se sérialisent, la seconde voit la première.
  select status into v_status from public.listings where id = v_id for no key update;
  if v_status is not null and v_status <> 'archivee'
     and not exists (select 1 from public.listing_photos p where p.listing_id = v_id) then
    raise exception 'Une annonce doit avoir au moins une photo'
      using errcode = '23514', hint = 'listing_photo_required';
  end if;
  return null;
end;
$$;
create constraint trigger listings_require_photo after insert or update of status on public.listings
  deferrable initially deferred
  for each row execute function private.check_listing_has_photo();
create constraint trigger listing_photos_require_photo after delete or update of listing_id on public.listing_photos
  deferrable initially deferred
  for each row execute function private.check_listing_has_photo();

-- ----------------------------------------------------------- create_listing
-- Publication exclusivement via cette RPC : le grant INSERT client sur listings est retiré (cf. plus bas).
-- SECURITY DEFINER : la RLS ne s'applique plus, la fonction vérifie donc tout elle-même (connexion,
-- propriétaire = auth.uid() posé explicitement, statut « disponible », activité et ville). Les fichiers
-- Storage sont contrôlés par le trigger listing_photos_check_file. auth.uid() reste lisible (claims JWT) :
-- les triggers voient l'appelant. Ordre : validations pures, puis lectures en base, puis écritures.
-- Erreurs : SQLSTATE + hint stable (le front se base sur le hint).
--   42501  auth_required
--   22023  kind_required, photos_count, photo_path_missing, photo_duplicate, photo_path_forbidden,
--          photo_path_invalid, text_too_long
--   23503  photo_missing, activity_not_found, city_not_found
--   23505  photo_in_use
--   23514  listing_photo_required (en fin de transaction, ne peut survenir via la RPC)
--   PT429  listing_rate_limit
create or replace function public.create_listing(
  p_activity_id uuid,
  p_kind public.listing_kind,
  p_city_id uuid,
  p_photo_paths text[],
  p_description text default null,
  p_experience text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
  v_count int;
  v_constraint text;
  v_listing_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise pour publier une annonce' using errcode = '42501', hint = 'auth_required';
  end if;
  if p_kind is null then
    raise exception 'Le type d''annonce est obligatoire' using errcode = '22023', hint = 'kind_required';
  end if;

  v_count := coalesce(cardinality(p_photo_paths), 0);
  if v_count not between 1 and 3 then
    raise exception 'Une annonce doit avoir de 1 à 3 photos' using errcode = '22023', hint = 'photos_count';
  end if;
  if array_position(p_photo_paths, null) is not null then
    raise exception 'Chemin de photo manquant' using errcode = '22023', hint = 'photo_path_missing';
  end if;
  if (select count(distinct p) from unnest(p_photo_paths) p) <> v_count then
    raise exception 'La même photo ne peut pas être ajoutée deux fois' using errcode = '22023', hint = 'photo_duplicate';
  end if;

  foreach v_path in array p_photo_paths loop
    if not starts_with(v_path, v_uid::text || '/') then
      raise exception 'Chemin de photo non autorisé' using errcode = '22023', hint = 'photo_path_forbidden';
    end if;
    if v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}\.(jpe?g|png|webp)$' then
      raise exception 'Chemin de photo invalide' using errcode = '22023', hint = 'photo_path_invalid';
    end if;
  end loop;

  -- Garde-fou avant tout traitement regex ; la limite de 2000 caractères après nettoyage est tenue par le CHECK.
  if octet_length(p_description) > 20000 or octet_length(p_experience) > 20000 then
    raise exception 'La description et l''expérience sont limitées à 2000 caractères'
      using errcode = '22023', hint = 'text_too_long';
  end if;

  if not exists (select 1 from public.activities where id = p_activity_id) then
    raise exception 'Activité introuvable' using errcode = '23503', hint = 'activity_not_found';
  end if;
  if not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'Ville introuvable' using errcode = '23503', hint = 'city_not_found';
  end if;

  begin
    insert into public.listings (owner_id, activity_id, kind, status, city_id, description, experience)
    values (v_uid, p_activity_id, p_kind, 'disponible', p_city_id, p_description, p_experience)
    returning id into v_listing_id;
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint in ('listings_description_length', 'listings_experience_length') then
      raise exception 'La description et l''expérience sont limitées à 2000 caractères'
        using errcode = '22023', hint = 'text_too_long';
    end if;
    raise;
  end;

  begin
    insert into public.listing_photos (listing_id, storage_path, position)
    select v_listing_id, t.path, t.rank::smallint
    from unnest(p_photo_paths) with ordinality as t(path, rank);
  exception when unique_violation then
    raise exception 'Une de ces photos est déjà utilisée par une annonce' using errcode = '23505', hint = 'photo_in_use';
  end;

  return v_listing_id;
end;
$$;

-- Plus d'insertion directe côté client (révoque aussi les grants par colonne). La policy listings_insert
-- est conservée : inoffensive, défense en profondeur. Grants de listing_photos inchangés (les invariants
-- photos sont tenus par les triggers ci-dessus).
revoke insert on public.listings from authenticated;

revoke execute on function public.create_listing(uuid, public.listing_kind, uuid, text[], text, text) from public, anon;
grant execute on function public.create_listing(uuid, public.listing_kind, uuid, text[], text, text) to authenticated;

-- Un fichier référencé par une photo ne peut pas être supprimé (sans effet côté API Storage). Helper
-- definer : indépendant de la RLS de listing_photos (annonce archivée, propriétaire différent...).
-- L'Edge Function delete-account (service_role, bypass RLS) n'est pas concernée.
create or replace function private.listing_photo_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.listing_photos p where p.storage_path = p_name);
$$;
revoke execute on function private.listing_photo_in_use(text) from public;
grant execute on function private.listing_photo_in_use(text) to authenticated;

drop policy "listing_photos_delete_own" on storage.objects;
create policy "listing_photos_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and starts_with(name, (select auth.uid())::text || '/')
    and not (select private.listing_photo_in_use(name))
  );

-- clean_text a changé (nouveaux invisibles) : on recalcule les colonnes générées dont la valeur diffère,
-- et seulement elles. Une collision d'unicité fait échouer la migration avec un message explicite.
do $$
begin
  update public.profiles set display_name = display_name
    where display_name_normalized is distinct from public.normalize_text(display_name);
  update public.activities set name = name
    where name_normalized is distinct from public.normalize_text(name);
  update public.cities set name = name
    where name_normalized is distinct from public.normalize_place(name);
exception when unique_violation then
  raise exception 'Recalcul des colonnes normalisées impossible : collision d''unicité (%). Corriger les doublons puis relancer.', sqlerrm;
end $$;
