begin;
\ir ../support/helpers.inc
select plan(67);
select tests.setup();

-- ======================= droits
select tests.act_anon();
select throws_ok($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$, '42501', null, 'anon ne peut pas appeler report_listing');
select throws_ok($$select * from private.reports_overview$$, '42501', null, 'anon ne lit pas la vue private.reports_overview');
select is(has_function_privilege('anon', 'public.report_listing(uuid, text, text)', 'execute'), false, 'report_listing : pas d''EXECUTE pour anon');
select is(has_function_privilege('authenticated', 'public.report_listing(uuid, text, text)', 'execute'), true, 'report_listing : EXECUTE pour authenticated');
select is(has_any_column_privilege('authenticated', 'public.reports', 'insert'), false, 'authenticated n''a plus aucun grant INSERT (même par colonne) sur reports');
select is(has_any_column_privilege('anon', 'public.reports', 'insert'), false, 'anon n''a aucun grant INSERT (même par colonne) sur reports');
select is(has_table_privilege('authenticated', 'public.reports', 'select'), false, 'authenticated ne lit pas reports');
select is(has_table_privilege('anon', 'private.reports_overview', 'select') or has_table_privilege('authenticated', 'private.reports_overview', 'select'), false, 'reports_overview : aucun grant pour anon/authenticated');
select is(has_table_privilege('service_role', 'private.reports_overview', 'select, insert, update, delete'), false, 'reports_overview : aucun privilège pour service_role (lecture en postgres seulement)');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_insert'), 1::bigint, 'la policy reports_insert reste (défense en profondeur)');

-- authentifié sans identité (JWT sans sub)
select tests.act_admin();
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
set local role authenticated;
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$), '42501/auth_required', 'sans identité : auth_required');

-- ======================= signalement nominal
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$, 'carol signale L1 sans précisions');
select tests.act_admin();
select results_eq($$select reporter_id, category, reason from public.reports where listing_id = 'b0000000-0000-0000-0000-000000000001'$$,
  $$values ('33333333-3333-3333-3333-333333333333'::uuid, 'arnaque'::text, null::text)$$, 'signalement enregistré, auteur = appelante, précisions nulles');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$), '23505/already_reported', 'second signalement : already_reported');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'dangereux', 'Autre motif')$$), '23505/already_reported', 'même avec un autre motif : already_reported');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000003', 'autre', 'Description trompeuse')$$), 'no error', 'carol signale L3 (autre + précisions)');

-- ======================= erreurs
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'spam')$$), '22023/category_invalid', 'catégorie inconnue');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', null)$$), '22023/category_invalid', 'catégorie nulle');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'ARNAQUE')$$), '22023/category_invalid', 'catégorie sensible à la casse');
select is(tests.err($$select public.report_listing('99999999-9999-9999-9999-999999999999', 'arnaque')$$), '23514/listing_unavailable', 'annonce inexistante');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000004', 'arnaque')$$), '23514/listing_unavailable', 'annonce archivée d''autrui : même réponse que l''inexistante');
select is(tests.err($$select public.report_listing(null, 'arnaque')$$), '23514/listing_unavailable', 'identifiant nul : listing_unavailable');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'autre')$$), '23514/details_required', 'autre sans précisions');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'autre', '   ')$$), '23514/details_required', 'autre avec précisions vides');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'autre', U&'\200B\200B \202E')$$), '23514/details_required', 'autre avec précisions invisibles seulement');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque', 'ab')$$), '23514/details_too_short', 'précisions trop courtes');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque', repeat('a', 1001))$$), '23514/details_too_long', 'précisions > 1000 caractères');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque', repeat('a', 20001))$$), '23514/details_too_long', 'précisions énormes (garde-fou)');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque', repeat('a', 1000))$$), 'no error', 'précisions de 1000 caractères acceptées');

-- ======================= propriétaire, tiers, statuts
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$), '23514/own_listing', 'le propriétaire ne signale pas sa propre annonce');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000004', 'arnaque')$$), '23514/own_listing', 'idem pour son annonce archivée (il la voit)');
select throws_ok($$select * from public.reports$$, '42501', null, 'le propriétaire ne lit pas les signalements');
select throws_ok($$insert into public.reports (listing_id, category, reason) values ('b0000000-0000-0000-0000-000000000003', 'autre', 'direct')$$, '42501', null, 'insert direct refusé');
select throws_ok($$insert into public.reports (listing_id, reason) values ('b0000000-0000-0000-0000-000000000003', 'ancien chemin')$$, '42501', null, 'insert direct limité à (listing_id, reason) refusé : grant par colonne retiré');
select throws_ok($$update public.reports set reason = 'x'$$, '42501', null, 'aucune modification client des signalements');
select throws_ok($$delete from public.reports$$, '42501', null, 'aucune suppression client des signalements');

select tests.act_admin();
update public.listings set status = 'reservee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000003', 'inapproprie')$$), 'no error', 'annonce réservée : signalable');
select tests.act_admin();
update public.listings set status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'donnees_personnelles', 'Numéro de téléphone dans la photo')$$), 'no error', 'bob signale L1 (donnees_personnelles)');
select tests.act_admin();
update public.listings set status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000001';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'dangereux')$$), '23505/already_reported', 'annonce donnée toujours visible : déjà signalée par bob');
select tests.act_admin();
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333');
insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '33333333-3333-3333-3333-333333333333', 'Je peux l''emprunter ?');
select tests.act_as('11111111-1111-1111-1111-111111111111');
insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'dangereux')$$), 'no error', 'annonce prêtée : signalable');
select tests.act_admin();
update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000003', 'dangereux')$$), '23514/listing_unavailable', 'annonce archivée après un premier signalement : indisponible');

-- ======================= nettoyage du texte
select tests.act_admin();
delete from public.reports;
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'inapproprie', '  Photo' || U&'\200B' || E'   choquante\r\n\r\n\r\n\r\n\r\nvoir  ici' || U&'\202E' || ' ' || chr(7))$$, 'précisions avec invisibles, espaces et retours');
select tests.act_admin();
select is((select reason from public.reports where listing_id = 'b0000000-0000-0000-0000-000000000001'), E'Photo choquante\n\n\nvoir ici', 'texte nettoyé (invisibles retirés, espaces compactés, lignes vides plafonnées)');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque', '   ')$$, 'précisions blanches avec catégorie fermée : acceptées');
select tests.act_admin();
select is((select reason from public.reports where listing_id = 'b0000000-0000-0000-0000-000000000002'), null, 'précisions blanches enregistrées comme nulles');

-- ======================= contraintes de table (lignes existantes : categorie autre + texte)
insert into public.reports (listing_id, reporter_id, category) values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'arnaque');
select throws_ok($$insert into public.reports (listing_id, reporter_id, category) values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'dangereux')$$, '23505', null, 'unicité (annonce, auteur) tenue par la table même hors RPC');
select throws_ok($$insert into public.reports (listing_id, reporter_id, category, reason) values ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'spam', 'x yz')$$, '23514', null, 'CHECK : catégorie hors liste');
select throws_ok($$insert into public.reports (listing_id, reporter_id, category) values ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'autre')$$, '23514', null, 'CHECK : autre sans précisions');
select throws_ok($$insert into public.reports (listing_id, reporter_id, category, reason) values ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'arnaque', 'ab')$$, '23514', null, 'CHECK : précisions < 3 caractères');
select throws_ok($$insert into public.reports (listing_id, reporter_id, reason) values ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'sans catégorie')$$, '23502', null, 'category obligatoire');

-- ======================= reprise des signalements existants (expression de la migration, rejouée sur une copie)
select tests.act_admin();
create temp table reports_old (id int primary key, reason text, category text);
insert into reports_old (id, reason) values
  (1, '   ' || repeat('a', 1000)),
  (2, '     '),
  (3, 'ab'),
  (4, repeat('b', 1500)),
  (5, 'Contenu' || U&'\200B' || '   suspect');
update reports_old r
  set category = 'autre',
      reason = coalesce(
        (select c from (select left(private.clean_multiline_text(r.reason), 1000) as c) s where char_length(c) >= 3),
        'Signalement antérieur sans précision')
  where r.category is null;
select is_empty($$select id from reports_old where category is distinct from 'autre' or char_length(reason) not between 3 and 1000$$, 'reprise : catégorie autre, texte de 3 à 1000 caractères pour toutes les lignes');
select results_eq($$select id, reason from reports_old order by id$$,
  $$values (1, repeat('a', 1000)), (2, 'Signalement antérieur sans précision'), (3, 'Signalement antérieur sans précision'), (4, repeat('b', 1000)), (5, 'Contenu suspect')$$,
  'reprise : texte nettoyé et tronqué, repli par défaut pour les textes vides ou trop courts');

-- ======================= anti-spam : 10 signalements par 24 h
delete from public.reports;
insert into public.listings (id, owner_id, activity_id, kind, city_id, status)
  select ('c0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '11111111-1111-1111-1111-111111111111',
         'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), 'archivee'
  from generate_series(1, 10) n;
insert into public.reports (listing_id, reporter_id, category)
  select id, '22222222-2222-2222-2222-222222222222', 'arnaque' from public.listings where id::text like 'c0000000-%' and id <> 'c0000000-0000-0000-0000-000000000010';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$), 'no error', '10e signalement accepté (9 déjà faits)');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque')$$), 'PT429/report_rate_limit', '11e signalement en 24 h : report_rate_limit');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'arnaque')$$), '23505/already_reported', 'un doublon reste already_reported au-delà du plafond');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque')$$), 'no error', 'le plafond est par utilisateur');
select tests.act_admin();
update public.reports set created_at = now() - interval '25 hours' where reporter_id = '22222222-2222-2222-2222-222222222222' and category = 'arnaque' and listing_id::text like 'c0000000-%';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000002', 'arnaque')$$), 'no error', 'fenêtre glissante : les signalements de plus de 24 h ne comptent plus');

-- ======================= vue de traitement
select tests.act_admin();
select results_eq($$select listing_id, listing_report_count from private.reports_overview where listing_id = 'b0000000-0000-0000-0000-000000000002' order by created_at$$,
  $$values ('b0000000-0000-0000-0000-000000000002'::uuid, 2::bigint), ('b0000000-0000-0000-0000-000000000002'::uuid, 2::bigint)$$, 'la vue compte les signalements par annonce (postgres)');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok($$select * from private.reports_overview$$, '42501', null, 'authenticated ne lit pas reports_overview');

-- ======================= dette Storage : photos publiées verrouillées
select tests.act_admin();
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('listing-photos', '11111111-1111-1111-1111-111111111111/libre.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is_empty($$update storage.objects set name = '11111111-1111-1111-1111-111111111111/renomme.jpg' where name = '11111111-1111-1111-1111-111111111111/a.jpg' returning 1$$, 'renommer/déplacer une photo publiée : refusé');
select is_empty($$update storage.objects set metadata = '{"x":1}' where name = '11111111-1111-1111-1111-111111111111/a.jpg' returning 1$$, 'modifier les métadonnées d''une photo publiée : refusé');
select throws_ok($$insert into storage.objects (bucket_id, name, owner, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/a.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111') on conflict (bucket_id, name collate "C") where archived_at is null do update set metadata = '{"x":1}'$$, '42501', null, 'upsert sur une photo publiée : refusé');
select is_empty($$update storage.objects set name = '11111111-1111-1111-1111-111111111111/z2.jpg' where name = '11111111-1111-1111-1111-111111111111/z.jpg' returning 1$$, 'même une photo d''annonce archivée reste verrouillée');
select lives_ok($$insert into storage.objects (bucket_id, name, owner, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/libre.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111') on conflict (bucket_id, name collate "C") where archived_at is null do update set metadata = '{"y":1}'$$, 'upsert sur un fichier libre : accepté');
select results_eq($$update storage.objects set metadata = '{"x":1}' where name = '11111111-1111-1111-1111-111111111111/libre.jpg' returning 1$$, $$values (1)$$, 'un fichier non référencé reste modifiable (upload en cours)');
select results_eq($$update storage.objects set name = '11111111-1111-1111-1111-111111111111/libre2.jpg' where name = '11111111-1111-1111-1111-111111111111/libre.jpg' returning 1$$, $$values (1)$$, 'un fichier non référencé reste déplaçable dans son dossier');
select throws_ok($$update storage.objects set name = '22222222-2222-2222-2222-222222222222/vol.jpg' where name = '11111111-1111-1111-1111-111111111111/libre2.jpg'$$, '42501', null, 'et toujours pas vers le dossier d''un autre');

select * from finish();
rollback;
