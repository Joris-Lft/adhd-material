begin;
\ir ../support/helpers.inc
select plan(83);
select tests.setup();

-- ======================= RLS et privilèges
select is_empty($$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$, 'RLS activée sur toutes les tables public');

select cmp_ok((select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')), '>', 0::bigint, 'le contrôle des grants voit bien des privilèges');
select is_empty($$
  select grantee, table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and not (privilege_type = 'SELECT' and table_name in ('cities', 'listings', 'listing_photos', 'loans', 'conversations', 'messages'))
    and not (grantee = 'authenticated' and privilege_type = 'DELETE' and table_name = 'listing_photos')
$$, 'aucun INSERT/UPDATE/DELETE niveau table pour anon/authenticated (hors DELETE listing_photos)');
select is_empty($$
  select grantee, table_name from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and table_name in ('loans', 'conversations', 'messages', 'reports', 'profiles', 'activities')
$$, 'anon n''a aucun grant table sur les tables privées/à colonnes');
select is(array(
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') order by 1
), array['clean_text', 'normalize_place', 'normalize_text', 'search_activities', 'search_cities', 'search_listings', 'shares_conversation_with']::text[],
  'fonctions exécutables par anon : liste blanche');
select is(array(
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute') order by 1
), array['clean_text', 'conversation_has_both_parties', 'conversation_has_messages', 'create_listing', 'get_conversation', 'get_my_profile', 'get_unread_count', 'list_my_conversations', 'listing_photo_in_use', 'mark_conversation_read', 'my_conversations', 'normalize_place', 'normalize_text', 'report_listing', 'return_loan', 'search_activities', 'search_cities', 'search_listings', 'shares_conversation_with', 'start_conversation', 'start_loan']::text[],
  'fonctions exécutables par authenticated : liste blanche (aucune fonction de trigger)');

-- ======================= anon : lecture seule, profil public minimal
select tests.act_anon();
select is((select count(*) from public.listings), 3::bigint, 'anon lit les annonces non archivées');
select is((select count(*) from public.listing_photos), 3::bigint, 'anon lit les photos des annonces visibles seulement');
select cmp_ok((select count(*) from public.cities), '>', 30000::bigint, 'anon lit le référentiel des communes');
select is((select count(*) from public.activities), 2::bigint, 'anon lit les activités');
select is((select count(*) from public.profiles), 2::bigint, 'anon ne voit que les membres ayant une annonce visible (pas carol)');
select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice', 'anon lit le pseudo du donneur');
select throws_ok($$select city_id from public.profiles$$, '42501', null, 'anon ne lit pas profiles.city_id');
select throws_ok($$select display_name_confirmed from public.profiles$$, '42501', null, 'anon ne lit pas profiles.display_name_confirmed');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon : select * sur profiles refusé (colonnes non accordées)');
select throws_ok($$select created_by from public.activities$$, '42501', null, 'anon ne lit pas activities.created_by');
select throws_ok($$select email from auth.users$$, '42501', null, 'anon ne lit pas auth.users');
select throws_ok($$select * from public.get_my_profile()$$, '42501', null, 'anon ne peut pas appeler get_my_profile');
select throws_ok($$select private.generate_pseudo(4)$$, '42501', null, 'anon n''exécute aucune fonction interne du schéma private');
select throws_ok($$insert into public.listings (activity_id, kind, city_id) values ('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'))$$, '42501', null, 'anon ne peut pas publier');
select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon ne peut pas ouvrir de conversation');
select throws_ok($$insert into public.messages (conversation_id, body) values (gen_random_uuid(), 'x')$$, '42501', null, 'anon ne peut pas écrire');
select is(has_column_privilege('authenticated', 'public.conversations', 'listing_id', 'INSERT'), false, 'authenticated n''a plus de grant INSERT sur conversations (start_conversation est le seul chemin)');
select throws_ok($$insert into public.reports (listing_id, category, reason) values ('b0000000-0000-0000-0000-000000000001', 'autre', 'spam')$$, '42501', null, 'anon ne peut pas signaler (insert direct)');
select throws_ok($$insert into public.activities (name) values ('Tricot')$$, '42501', null, 'anon ne peut pas créer d''activité');
select throws_ok($$insert into public.cities (insee_code, name, location) values ('99999', 'X', 'SRID=4326;POINT(0 0)')$$, '42501', null, 'anon ne peut pas créer de ville');
select throws_ok($$select * from public.messages$$, '42501', null, 'anon ne lit pas les messages');

-- ======================= authenticated : profils
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.profiles), 3::bigint, 'carol voit alice, bob (annonces visibles) et elle-même');
select throws_ok($$select city_id from public.profiles$$, '42501', null, 'authenticated ne lit pas profiles.city_id directement');
select throws_ok($$insert into public.cities (insee_code, name, location) values ('99999', 'X', 'SRID=4326;POINT(0 0)')$$, '42501', null, 'aucune insertion client dans cities');
select throws_ok($$update public.cities set name = 'X'$$, '42501', null, 'aucune modification client de cities');
select throws_ok($$delete from public.cities$$, '42501', null, 'aucune suppression client de cities');

select tests.act_admin();
update public.listings set status = 'archivee' where owner_id = '11111111-1111-1111-1111-111111111111';
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.profiles), 2::bigint, 'alice n''a plus d''annonce visible : son profil disparaît pour carol');
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice', 'bob voit alice (conversation partagée) même sans annonce visible');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'Bob', 'alice voit son demandeur');
select tests.act_admin();
update public.listings set status = 'disponible' where owner_id = '11111111-1111-1111-1111-111111111111' and id <> 'b0000000-0000-0000-0000-000000000004';

-- ======================= mon profil
update public.profiles set city_id = tests.city('75056') where id = '11111111-1111-1111-1111-111111111111';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$select display_name, display_name_confirmed, city_id = tests.city('75056') from public.get_my_profile()$$,
  $$values ('Alice'::text, false, true)$$, 'get_my_profile renvoie mon profil complet');
select is((select count(*) from public.get_my_profile()), 1::bigint, 'get_my_profile ne renvoie que ma ligne');
select results_eq($$update public.profiles set display_name_confirmed = true, city_id = tests.city('69123') where id = '11111111-1111-1111-1111-111111111111' returning 1$$, $$values (1)$$, 'alice modifie son profil');
select throws_ok($$update public.profiles set id = gen_random_uuid() where id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'profiles.id non modifiable');
select results_eq($$update public.profiles set display_name = '  Mon   pseudo' || chr(8203) || '  ' where id = '11111111-1111-1111-1111-111111111111' returning display_name$$, $$values ('Mon pseudo'::text)$$, 'pseudo nettoyé (espaces, caractères invisibles)');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select is_empty($$update public.profiles set display_name = 'Pirate' where id = '11111111-1111-1111-1111-111111111111' returning 1$$, 'bob ne modifie pas le profil d''alice');
select throws_ok($$update public.profiles set display_name = 'MON PSEUDO' where id = '22222222-2222-2222-2222-222222222222'$$, '23505', null, 'pseudo pris (casse)');
select throws_ok($$update public.profiles set display_name = 'Mön pséudo' where id = '22222222-2222-2222-2222-222222222222'$$, '23505', null, 'pseudo pris (accents)');
select throws_ok($$update public.profiles set display_name = 'Mon' || chr(8203) || ' pseudo!' where id = '22222222-2222-2222-2222-222222222222'$$, '23505', null, 'pseudo pris (caractère invisible, ponctuation finale)');
select throws_ok($$update public.profiles set display_name = 'Ab' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', null, 'pseudo trop court');
select throws_ok($$update public.profiles set display_name = repeat('a', 31) where id = '22222222-2222-2222-2222-222222222222'$$, '23514', null, 'pseudo trop long');

select throws_ok($$update public.profiles set display_name = 'Admin' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Admin');
select throws_ok($$update public.profiles set display_name = 'ADMINISTRATEUR' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : ADMINISTRATEUR');
select throws_ok($$update public.profiles set display_name = 'Modération' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Modération');
select throws_ok($$update public.profiles set display_name = 'moderation' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : moderation');
select throws_ok($$update public.profiles set display_name = 'MODERATEUR' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : MODERATEUR');
select throws_ok($$update public.profiles set display_name = 'Support' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Support');
select throws_ok($$update public.profiles set display_name = 'Équipe' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Équipe');
select throws_ok($$update public.profiles set display_name = 'equipe' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : equipe');
select throws_ok($$update public.profiles set display_name = 'STAFF' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : STAFF');
select throws_ok($$update public.profiles set display_name = 'ADHD Material' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : ADHD Material');
select throws_ok($$update public.profiles set display_name = 'adhd-material' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : adhd-material');
select throws_ok($$update public.profiles set display_name = 'System' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : System');
select throws_ok($$update public.profiles set display_name = 'Système' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Système');
select throws_ok($$update public.profiles set display_name = 'Anonyme' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Anonyme');
select throws_ok($$update public.profiles set display_name = 'Membre supprimé' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Membre supprimé');
select throws_ok($$update public.profiles set display_name = 'Membre-ABCD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : Membre-ABCD');
select throws_ok($$update public.profiles set display_name = 'membre-zzzz' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'pseudo réservé ou motif membre- refusé : membre-zzzz');
select throws_ok($$update public.profiles set display_name = 'membre ABCD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'préfixe membre refusé : membre ABCD');
select throws_ok($$update public.profiles set display_name = 'Membre_ABCD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'préfixe membre refusé : Membre_ABCD');
select throws_ok($$update public.profiles set display_name = 'MembreABCD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'préfixe membre refusé : MembreABCD');
select throws_ok($$update public.profiles set display_name = 'Admin ADHD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : Admin ADHD');
select throws_ok($$update public.profiles set display_name = 'L''équipe ADHD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : L''équipe ADHD');
select throws_ok($$update public.profiles set display_name = 'Le Support' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : Le Support');
select throws_ok($$update public.profiles set display_name = 'adhd_material fan' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : adhd_material fan');
select throws_ok($$update public.profiles set display_name = 'Système Pro' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : Système Pro');
select throws_ok($$update public.profiles set display_name = 'Moderateur Paul' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé en contenu refusé : Moderateur Paul');
select lives_ok($$update public.profiles set display_name = 'Memo Solide' where id = '22222222-2222-2222-2222-222222222222'$$, 'un pseudo contenant « mem » reste accepté');
select lives_ok($$update public.profiles set display_name = 'Cadmium Pierre' where id = '22222222-2222-2222-2222-222222222222'$$, 'pas de faux positif grossier (Cadmium contient admin)');
select throws_ok($$update public.profiles set display_name = 'Admin_ADHD' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé refusé malgré « _ » ou chiffres : Admin_ADHD');
select throws_ok($$update public.profiles set display_name = 'Admin2' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé refusé malgré « _ » ou chiffres : Admin2');
select throws_ok($$update public.profiles set display_name = 'Le_staff' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé refusé malgré « _ » ou chiffres : Le_staff');
select throws_ok($$update public.profiles set display_name = 'Modo' where id = '22222222-2222-2222-2222-222222222222'$$, '23514', 'Ce pseudo n''est pas disponible', 'mot réservé refusé malgré « _ » ou chiffres : Modo');
select lives_ok($$update public.profiles set display_name = 'Membrane' where id = '22222222-2222-2222-2222-222222222222'$$, 'Membrane (pas le préfixe membre) accepté');
select tests.act_admin();
set local session_replication_role = replica;
update public.profiles set display_name = 'Admin_Bob' where id = '22222222-2222-2222-2222-222222222222';
set local session_replication_role = origin;
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$update public.profiles set city_id = tests.city('69123') where id = '22222222-2222-2222-2222-222222222222'$$, 'pseudo devenu réservé : mise à jour du profil sans changer le pseudo acceptée');
select lives_ok($$update public.profiles set display_name = 'Bob', display_name_confirmed = true where id = '22222222-2222-2222-2222-222222222222'$$, 'le pseudo actuel peut être ré-enregistré');

-- ======================= profil créé à l'inscription : pseudo neutre
select tests.act_admin();
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'jean.dupont@example.test', 'authenticated', 'authenticated', '{"full_name":"Marie Curie","name":"Marie"}');
select matches((select display_name from public.profiles where id = '44444444-4444-4444-4444-444444444444'), '^Membre-[A-HJ-NP-Z2-9]{4}$', 'pseudo neutre Membre-XXXX (ni email, ni métadonnées)');
select is((select display_name_confirmed from public.profiles where id = '44444444-4444-4444-4444-444444444444'), false, 'pseudo non confirmé par défaut');

select * from finish();
rollback;
