begin;
\ir ../support/helpers.inc
select plan(61);
select tests.setup();

-- ======================= photos : 1 à 3 par annonce, chemin {uid}/{nom}.{ext}
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/b.jpg', 2), ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/c.webp', 3)$$, '3 photos autorisées');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/d.jpg', 4)$$, '23514', null, 'position 4 refusée (limite de 3 photos)');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111/e.jpg', 1)$$, '23505', null, 'position déjà prise refusée');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/a.jpg', 1)$$, '23505', null, 'storage_path unique');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/../22222222-2222-2222-2222-222222222222/x.jpg', 1)$$, '23514', null, 'path traversal refusé');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/sous/x.jpg', 1)$$, '23514', null, 'sous-dossier refusé');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/x.gif', 1)$$, '23514', null, 'extension non image refusée');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222/x.jpg', 1)$$, '42501', null, 'chemin dans le dossier d''un autre refusé');
select lives_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111/ok_1-2.png', 1)$$, 'chemin valide');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222/x.jpg', 1)$$, '42501', null, 'bob ne peut pas ajouter de photo à l''annonce d''alice');
select is_empty($$delete from public.listing_photos returning 1$$, 'bob ne supprime pas les photos d''alice');
select is_empty($$update public.listing_photos set position = 3 returning 1$$, 'bob ne modifie pas les photos d''alice');
select is((select count(*) from public.listing_photos), 4::bigint, 'bob voit les photos des annonces visibles (pas celles de l''archivée)');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.listing_photos), 5::bigint, 'alice voit aussi la photo de son annonce archivée');
select results_eq($$delete from public.listing_photos where listing_id = 'b0000000-0000-0000-0000-000000000001' returning 1$$, $$values (1),(1),(1)$$, 'alice supprime les photos de son annonce');

-- ======================= prêts
select tests.act_admin();
select throws_ok($$update public.listings set status = 'pretee' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'même postgres ne pose pas « pretee » sans le signal des triggers loans');
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111')$$, '42501', 'Annonce introuvable ou non autorisée', 'bob ne peut pas prêter l''annonce d''alice : message neutre');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111')$$, '42501', 'Annonce introuvable ou non autorisée', 'idem sur un don : aucun détail sur l''annonce');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111')$$, '42501', 'Annonce introuvable ou non autorisée', 'idem sur une annonce inexistante');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222')$$, '23514', null, 'pas de prêt sur un don');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$, '23514', 'Aucune conversation avec cet utilisateur sur cette annonce', 'le prêt exige une conversation avec l''emprunteur');
select throws_ok($$update public.listings set status = 'pretee' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'statut « pretee » impossible sans prêt');
select lives_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')$$, 'alice prête son matériel à bob');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'pretee', 'l''annonce passe à « pretee »');
select is(current_setting('app.loan_sync', true), 'off', 'le signal app.loan_sync est remis à off après le prêt');
select throws_ok($$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'impossible de remettre « disponible » pendant le prêt');
select throws_ok($$update public.listings set status = 'reservee' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'impossible de « réserver » pendant le prêt');
select throws_ok($$update public.listings set kind = 'don' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'kind immuable une fois un prêt enregistré');
select throws_ok($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'impossible d''archiver pendant un prêt : on clôture d''abord');
select tests.act_admin();
select set_config('app.loan_sync', 'on', true);  -- état incohérent forcé (admin) : archivée avec prêt ouvert
update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000002';
select set_config('app.loan_sync', 'off', true);
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000002'$$, '23514', null, 'archivée -> disponible refusé tant qu''un prêt est ouvert');
select tests.act_admin();
select set_config('app.loan_sync', 'on', true);  -- levée explicite du garde-fou (réservée aux triggers loans)
update public.listings set status = 'pretee' where id = 'b0000000-0000-0000-0000-000000000002';
select set_config('app.loan_sync', 'off', true);
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')$$, '23514', null, 'pas de second prêt en cours');
select throws_ok($$update public.loans set borrower_id = '33333333-3333-3333-3333-333333333333'$$, '42501', null, 'borrower_id non modifiable');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.loans), 1::bigint, 'l''emprunteur lit son prêt');
select is_empty($$update public.loans set returned_at = now() returning 1$$, 'l''emprunteur ne clôture pas le prêt');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.loans), 0::bigint, 'un tiers ne lit pas les prêts');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$update public.loans set returned_at = now() + interval '10 years' returning returned_at <= now()$$, $$values (true)$$, 'returned_at forcé à now() par le serveur');
select results_eq($$update public.loans set returned_at = '2000-01-01' returning returned_at > '2001-01-01'$$, $$values (true)$$, 'returned_at posé une seule fois');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'disponible', 'retour : l''annonce redevient disponible');

-- ======================= prêt supprimé / emprunteur supprimé
select tests.act_admin();
update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000002';
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$, 'nouveau prêt à carol');
select tests.act_admin();
select lives_ok($$delete from public.loans where borrower_id = '33333333-3333-3333-3333-333333333333'$$, 'suppression administrative d''un prêt en cours');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'disponible', 'l''annonce redevient disponible');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$, 'prêt à carol (bis)');
select tests.act_admin();
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select results_eq($$select borrower_id is null, returned_at is null from public.loans where listing_id = 'b0000000-0000-0000-0000-000000000002' and returned_at is null$$, $$values (true, true)$$, 'emprunteur supprimé : prêt conservé, ouvert, anonymisé');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$update public.loans set returned_at = now() where returned_at is null returning 1$$, $$values (1)$$, 'le prêteur clôture le prêt orphelin');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'disponible', 'annonce de nouveau disponible');

-- ======================= Storage : bucket et policies
select tests.act_admin();
select results_eq($$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'listing-photos'$$,
  $$values (true, 5242880::bigint, array['image/jpeg','image/png','image/webp']::text[])$$, 'bucket public, 5 Mo, MIME image');
insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/crochet.jpg', '11111111-1111-1111-1111-111111111111');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/t.jpg', '11111111-1111-1111-1111-111111111111')$$, 'upload dans son préfixe');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '22222222-2222-2222-2222-222222222222/t.jpg', '11111111-1111-1111-1111-111111111111')$$, '42501', null, 'upload dans le préfixe d''un autre refusé');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/../22222222-2222-2222-2222-222222222222/t.jpg', '11111111-1111-1111-1111-111111111111')$$, '42501', null, 'path traversal refusé');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/x/t.jpg', '11111111-1111-1111-1111-111111111111')$$, '42501', null, 'sous-dossier refusé');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/t.html', '11111111-1111-1111-1111-111111111111')$$, '42501', null, 'extension non image refusée');
select throws_ok($$update storage.objects set name = '22222222-2222-2222-2222-222222222222/vol.jpg' where name = '11111111-1111-1111-1111-111111111111/t.jpg'$$, '42501', null, 'déplacer son fichier vers le dossier d''un autre refusé');
select is((select count(*) from storage.objects where bucket_id = 'listing-photos'), 2::bigint, 'alice voit ses fichiers');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from storage.objects where bucket_id = 'listing-photos'), 0::bigint, 'bob ne voit pas les fichiers d''alice');
select is_empty($$update storage.objects set name = '22222222-2222-2222-2222-222222222222/vol.jpg' where name = '11111111-1111-1111-1111-111111111111/crochet.jpg' returning 1$$, 'bob ne déplace pas le fichier d''alice');
select is_empty($$update storage.objects set metadata = '{}' where name = '11111111-1111-1111-1111-111111111111/crochet.jpg' returning 1$$, 'bob n''écrase pas le fichier d''alice');
select set_config('storage.allow_delete_query', 'true', true);
select is_empty($$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/crochet.jpg' returning 1$$, 'bob ne supprime pas le fichier d''alice');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/crochet.jpg', '22222222-2222-2222-2222-222222222222')$$, '42501', null, 'bob ne peut pas écrire dans le dossier d''alice');
select tests.act_anon();
select is((select count(*) from storage.objects), 0::bigint, 'anon n''énumère aucun fichier');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('listing-photos', '11111111-1111-1111-1111-111111111111/anon.jpg')$$, '42501', null, 'anon ne peut pas uploader');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select set_config('storage.allow_delete_query', 'true', true);
select results_eq($$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/t.jpg' returning 1$$, $$values (1)$$, 'alice supprime son fichier');

select * from finish();
rollback;
