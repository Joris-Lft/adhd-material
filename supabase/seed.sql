-- Données de dev local uniquement (aucune donnée réelle). Mot de passe des comptes : "password123".

-- Les communes viennent de la migration cities_referentiel (aucune insertion ici).

insert into public.activities (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Crochet'),
  ('a0000000-0000-0000-0000-000000000002', 'Aquarelle'),
  ('a0000000-0000-0000-0000-000000000003', 'Guitare'),
  ('a0000000-0000-0000-0000-000000000004', 'Poterie');

-- Deux utilisateurs ; les profils (pseudo neutre « Membre-XXXX ») sont créés par le trigger on_auth_user_created.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Alice"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob@example.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u
where u.email in ('alice@example.test', 'bob@example.test');

update public.profiles set display_name = 'Alice', city_id = (select id from public.cities where insee_code = '75056') where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Bob', city_id = (select id from public.cities where insee_code = '69123') where id = '22222222-2222-2222-2222-222222222222';

insert into public.listings (id, owner_id, activity_id, kind, city_id, description, experience) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don',
   (select id from public.cities where insee_code = '75056'), 'Crochets, laine et patrons débutant.', 'Arrêté après 3 semaines : trop de comptage de mailles.'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'pret',
   (select id from public.cities where insee_code = '78646'), 'Boîte d''aquarelle et pinceaux.', null),
  ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', 'don',
   (select id from public.cities where insee_code = '69123'), 'Guitare classique 3/4 avec housse.', null);

insert into public.listing_photos (listing_id, storage_path, position) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/crochet-1.jpg', 1),
  ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222/guitare-1.jpg', 1);

-- Les lignes listing_photos ci-dessus référencent des chemins Storage qui n'existent PAS en local
-- (aucun fichier uploadé) : les images seront cassées tant qu'on n'uploade pas de vraies photos
-- dans le bucket listing-photos (chemin {uid}/{nom}.jpg).

-- Bob écrit à Alice au sujet du crochet.
insert into public.conversations (id, listing_id, requester_id) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values
  ('d0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bonjour, le matériel de crochet est-il toujours disponible ?');
