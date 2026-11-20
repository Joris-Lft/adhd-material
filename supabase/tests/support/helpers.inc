-- Helpers communs des tests pgTAP, inclus par chaque test avec : \ir ../support/helpers.inc
-- (à l'intérieur de la transaction du test : tout est rollbacké). Ce fichier n'est pas un test.

create schema tests;
grant usage on schema tests to public;

-- Bascule de rôle : act_as(uuid) = utilisateur connecté, act_anon() = visiteur, act_admin() = postgres.
create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.act_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function tests.act_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.city(p_insee text) returns uuid language sql stable as $$
  select id from public.cities where insee_code = p_insee
$$;

-- Fixtures (en tant que postgres). Les communes viennent de la migration du référentiel.
--   utilisateurs : alice (1111..), bob (2222..), carol (3333..)
--   L1 alice don Paris | L2 alice pret Versailles | L3 bob don Lyon | L4 alice don Paris ARCHIVÉE
--   activités : Crochet (a..01), Aquarelle (a..02) ; une photo (+ fichier Storage) sur chaque annonce
create function tests.setup() returns void language plpgsql as $$
begin
  perform tests.act_admin();
  delete from public.reports;
  perform set_config('storage.allow_delete_query', 'true', true);  -- purge des fichiers du seed
  delete from storage.objects where bucket_id = 'listing-photos';
  delete from public.listings;
  delete from public.activities;
  delete from auth.users;
  -- vide la file des contraintes différées déclenchées par les suppressions ci-dessus (annonces recréées plus bas)
  set constraints listings_require_photo, listing_photos_require_photo immediate;
  set constraints listings_require_photo, listing_photos_require_photo deferred;

  insert into auth.users (id, email, aud, role) values
    ('11111111-1111-1111-1111-111111111111', 'alice@example.test', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'bob@example.test',   'authenticated', 'authenticated'),
    ('33333333-3333-3333-3333-333333333333', 'carol@example.test', 'authenticated', 'authenticated');
  update public.profiles set display_name = 'Alice' where id = '11111111-1111-1111-1111-111111111111';
  update public.profiles set display_name = 'Bob'   where id = '22222222-2222-2222-2222-222222222222';
  update public.profiles set display_name = 'Carol' where id = '33333333-3333-3333-3333-333333333333';

  insert into public.activities (id, name) values
    ('a0000000-0000-0000-0000-000000000001', 'Crochet'),
    ('a0000000-0000-0000-0000-000000000002', 'Aquarelle');

  -- Fichiers Storage réels (métadonnées) pour chaque photo : le trigger listing_photos_check_file les exige.
  insert into storage.objects (bucket_id, name, owner, owner_id) values
    ('listing-photos', '11111111-1111-1111-1111-111111111111/a.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
    ('listing-photos', '11111111-1111-1111-1111-111111111111/l2.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
    ('listing-photos', '11111111-1111-1111-1111-111111111111/z.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
    ('listing-photos', '22222222-2222-2222-2222-222222222222/l3.jpg', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

  insert into public.listings (id, owner_id, activity_id, kind, city_id) values
    ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don',  tests.city('75056')),
    ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'pret', tests.city('78646')),
    ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'don',  tests.city('69123')),
    ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don',  tests.city('75056'));
  update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000004';

  insert into public.listing_photos (listing_id, storage_path, position) values
    ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/a.jpg', 1),
    ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/l2.jpg', 1),
    ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222/l3.jpg', 1),
    ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111/z.jpg', 1);
end $$;

-- Exécute une instruction puis force la vérification des contraintes différées (constraint triggers) :
-- les tests ne committent jamais, il faut simuler la fin de transaction. Lève l'erreur de la contrainte.
create function tests.exec_checked(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  set constraints listings_require_photo, listing_photos_require_photo immediate;
  set constraints listings_require_photo, listing_photos_require_photo deferred;
end $$;

-- Exécute une instruction attendue en erreur et renvoie 'SQLSTATE/hint' (ou 'no error'). Avec
-- p_flush, vérifie aussi les contraintes différées. L'écriture partielle est annulée (sous-transaction).
create function tests.err(p_sql text, p_flush boolean default false) returns text language plpgsql as $$
declare v_state text; v_hint text;
begin
  execute p_sql;
  if p_flush then
    set constraints listings_require_photo, listing_photos_require_photo immediate;
    set constraints listings_require_photo, listing_photos_require_photo deferred;
  end if;
  return 'no error';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || '/' || coalesce(v_hint, '');
end $$;

-- Ouvre (en tant que postgres) une conversation requester -> annonce et renvoie son id.
create function tests.open_conversation(p_listing uuid, p_requester uuid) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform tests.act_admin();
  insert into public.conversations (listing_id, requester_id) values (p_listing, p_requester) returning id into v_id;
  perform set_config('tests.conv', v_id::text, true);  -- relisible via tests.conv()
  return v_id;
end $$;

create function tests.conv() returns uuid language sql stable as $$
  select current_setting('tests.conv')::uuid
$$;

grant execute on all functions in schema tests to public;
