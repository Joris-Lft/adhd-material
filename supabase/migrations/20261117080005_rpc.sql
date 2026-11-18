-- RPC (security invoker sauf get_my_profile : la RLS et les grants par colonne s'appliquent).
-- Seuil de similarité trigramme 0.3 (défaut pg_trgm) : « crochette » -> « Crochet » = 0.64.

-- Suggestions d'activités proches orthographiquement. q : 2 à 100 caractères, sinon aucun résultat.
create or replace function public.search_activities(q text)
returns table (id uuid, name text, similarity real)
language sql
stable
set search_path = ''
set pg_trgm.similarity_threshold = '0.3'
as $$
  select a.id, a.name, extensions.similarity(a.name_normalized, public.normalize_text(q))
  from public.activities a
  where char_length(btrim(coalesce(q, ''))) between 2 and 100
    and char_length(public.normalize_text(q)) >= 2
    and a.name_normalized operator(extensions.%) public.normalize_text(q)
  order by 3 desc, a.name
  limit 10;
$$;

-- Autocomplétion de commune : nom (sans accents) en préfixe ou par trigramme, code postal en préfixe.
-- Tri : nom exact, préfixe de nom, code postal, trigramme ; puis similarité, population, nom.
create or replace function public.search_cities(q text)
returns table (id uuid, insee_code text, name text, postal_codes text[])
language sql
stable
set search_path = ''
set pg_trgm.similarity_threshold = '0.3'
as $$
  with p as (
    select public.normalize_place(q) as nq, btrim(q) as pq
    where char_length(btrim(coalesce(q, ''))) between 2 and 100
      and char_length(public.normalize_place(q)) >= 2
  ),
  -- un SELECT par critère (préfixe, trigramme via l'index GIN, code postal) plutôt qu'un OR
  -- qui empêcherait l'usage de l'index
  hits as (
    select c.id from public.cities c, p where starts_with(c.name_normalized, p.nq)
    union
    select c.id from public.cities c, p
      where char_length(p.nq) >= 3 and c.name_normalized operator(extensions.%) p.nq
    union
    select c.id from public.cities c, p
      where p.pq ~ '^[0-9]{2,5}$'
        and exists (select 1 from unnest(c.postal_codes) pc where starts_with(pc, p.pq))
  )
  select c.id, c.insee_code, c.name, c.postal_codes
  from hits h
  join public.cities c on c.id = h.id
  cross join p
  order by
    case
      when c.name_normalized = p.nq then 0
      when starts_with(c.name_normalized, p.nq) then 1
      when p.pq ~ '^[0-9]{2,5}$' then 2
      else 3
    end,
    extensions.similarity(c.name_normalized, p.nq) desc,
    c.population desc nulls last,
    c.name
  limit 10;
$$;

-- Annonces visibles (disponibles ou réservées) dans un rayon autour d'une ville, triées par distance.
-- p_radius_km : borné à [0, 1000] (NULL = 0, la commune seule) ; p_limit : borné à [1, 100] (défaut 50).
create or replace function public.search_listings(
  p_city_id uuid,
  p_radius_km double precision,
  p_activity_id uuid default null,
  p_kind public.listing_kind default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  owner_id uuid,
  owner_display_name text,
  activity_id uuid,
  activity_name text,
  kind public.listing_kind,
  status public.listing_status,
  city_id uuid,
  city_name text,
  postal_codes text[],
  description text,
  experience text,
  created_at timestamptz,
  distance_km double precision,
  cover_photo_path text
)
language sql
stable
set search_path = ''
as $$
  select
    l.id, l.owner_id, p.display_name, l.activity_id, a.name, l.kind, l.status,
    l.city_id, lc.name, lc.postal_codes, l.description, l.experience, l.created_at,
    extensions.st_distance(lc.location, c.location) / 1000.0,
    (select ph.storage_path from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1)
  from public.cities c
  join public.cities lc
    on extensions.st_dwithin(lc.location, c.location, least(greatest(coalesce(p_radius_km, 0), 0), 1000) * 1000.0)
  join public.listings l on l.city_id = lc.id
  join public.activities a on a.id = l.activity_id
  join public.profiles p on p.id = l.owner_id
  where c.id = p_city_id
    and l.status in ('disponible', 'reservee')
    and (p_activity_id is null or l.activity_id = p_activity_id)
    and (p_kind is null or l.kind = p_kind)
  order by extensions.st_distance(lc.location, c.location), l.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Profil complet de l'utilisateur courant (city_id et display_name_confirmed ne sont pas lisibles
-- directement : le grant par colonne les exclut). Aucun résultat si non connecté.
create or replace function public.get_my_profile()
returns table (id uuid, display_name text, display_name_confirmed boolean, city_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.display_name_confirmed, p.city_id
  from public.profiles p
  where p.id = (select auth.uid());
$$;

grant execute on function public.search_activities(text) to anon, authenticated;
grant execute on function public.search_cities(text) to anon, authenticated;
grant execute on function public.search_listings(uuid, double precision, uuid, public.listing_kind, integer, integer) to anon, authenticated;
grant execute on function public.get_my_profile() to authenticated;
