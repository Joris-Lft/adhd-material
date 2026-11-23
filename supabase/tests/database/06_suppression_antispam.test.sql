begin;
\ir ../support/helpers.inc
select plan(39);
select tests.setup();

-- ======================= suppression de compte : conserver et anonymiser
-- bob (demandeur) discute sur L1 (alice), signale L2, alice est son interlocutrice
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '22222222-2222-2222-2222-222222222222', 'Bonjour'), (tests.conv(), '11111111-1111-1111-1111-111111111111', 'Salut');
insert into public.reports (listing_id, reporter_id, category, reason) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'autre', 'Contenu suspect');
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '22222222-2222-2222-2222-222222222222', 'Je peux l''emprunter ?');
select tests.act_as('11111111-1111-1111-1111-111111111111');
insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
select tests.act_admin();

delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is((select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'profil supprimé avec le compte');
select is((select count(*) from public.listings where owner_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'annonces du compte supprimé : supprimées (cascade)');
select is((select count(*) from public.conversations where listing_id = 'b0000000-0000-0000-0000-000000000001' and requester_id is null), 1::bigint, 'conversation conservée, demandeur anonymisé');
select is((select count(*) from public.messages where sender_id is null), 2::bigint, 'messages de l''ancien membre conservés, expéditeur anonymisé');
select is((select count(*) from public.messages where sender_id = '11111111-1111-1111-1111-111111111111'), 1::bigint, 'message de l''interlocutrice intact');
select is((select count(*) from public.reports where reporter_id is null), 1::bigint, 'signalement conservé, auteur anonymisé');
select results_eq($$select borrower_id is null, returned_at is null from public.loans$$, $$values (true, true)$$, 'prêt conservé, ouvert, emprunteur anonymisé');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'pretee', 'l''annonce reste « pretee » jusqu''à la clôture par le prêteur');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.messages), 3::bigint, 'alice lit toujours les conversations');

-- ======================= compte du propriétaire supprimé : annonce conservée, anonymisée, purgée
select tests.setup();
update public.listings set description = 'Mon matériel', experience = 'Trop dur' where owner_id = '11111111-1111-1111-1111-111111111111';
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '22222222-2222-2222-2222-222222222222', 'Bonjour'), (tests.conv(), '11111111-1111-1111-1111-111111111111', 'Salut');
insert into public.reports (listing_id, reporter_id, category, reason) values ('b0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'autre', 'Contenu suspect');
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '22222222-2222-2222-2222-222222222222', 'Je peux l''emprunter ?');
select tests.act_as('11111111-1111-1111-1111-111111111111');
insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
select tests.act_admin();

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'profil supprimé avec le compte');
select is((select count(*) from public.listings where owner_id is null and status = 'archivee'), 3::bigint, 'annonces conservées, anonymisées (owner_id null) et archivées');
select is((select count(*) from public.listings where description is not null or experience is not null), 0::bigint, 'description et retour d''expérience purgés');
select is((select count(*) from public.listing_photos where storage_path like '11111111-%'), 0::bigint, 'lignes listing_photos du compte supprimées');
select results_eq($$select returned_at is not null, borrower_id from public.loans$$, $$values (true, '22222222-2222-2222-2222-222222222222'::uuid)$$, 'prêt ouvert clôturé automatiquement, l''emprunteur est conservé');
select is((select count(*) from public.conversations), 2::bigint, 'conversations conservées');
select is((select count(*) from public.messages where sender_id is null), 1::bigint, 'message du membre supprimé conservé, expéditeur anonymisé');
select is((select count(*) from public.messages where sender_id = '22222222-2222-2222-2222-222222222222'), 2::bigint, 'messages de l''interlocuteur intacts');
select results_eq($$select listing_id, reporter_id from public.reports$$, $$values ('b0000000-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid)$$, 'le signalement survit à la suppression du compte signalé');
select throws_ok($$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000001'$$, '23514', null, 'une annonce sans propriétaire ne peut pas redevenir visible');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.conversations), 2::bigint, 'le demandeur lit encore ses conversations');
select is((select count(*) from public.messages), 3::bigint, 'le demandeur lit encore les messages');
select is((select count(*) from public.listings where owner_id is null), 0::bigint, 'annonces orphelines invisibles (le front affiche « Annonce supprimée »)');
select is((select count(*) from public.loans), 1::bigint, 'l''emprunteur lit encore son prêt, clos');
select is_empty($$update public.listings set description = 'pirate', status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$, 'personne ne peut modifier une annonce orpheline');
select throws_ok($$update public.listings set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'b0000000-0000-0000-0000-000000000001'$$, '42501', null, 'personne ne peut s''approprier une annonce orpheline');
select throws_ok($$insert into public.listing_photos (listing_id, storage_path, position) values ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222/x.jpg', 1)$$, '42501', null, 'pas de photo sur une annonce orpheline');
select is(tests.err($$select public.report_listing('b0000000-0000-0000-0000-000000000001', 'autre', 'Encore')$$), '23514/listing_unavailable', 'annonce orpheline invisible : pas de nouveau signalement');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000001')$$, '42501', null, 'impossible d''ouvrir une conversation sur une annonce orpheline');
select is((select count(*) from public.conversations), 0::bigint, 'un tiers ne lit toujours pas les conversations');
select tests.act_anon();
select is((select count(*) from public.search_listings(tests.city('75056'), 500) where owner_id is null or id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')), 0::bigint, 'anon : aucune annonce orpheline dans la recherche');

-- ======================= anti-spam
select tests.setup();
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.messages (conversation_id, body) select tests.conv(), 'm' || g from generate_series(1, 30) g$$, '30 messages par minute autorisés');
select throws_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'de trop')$$, 'PT429', 'Trop de messages envoyés en une minute, réessaie dans un instant', 'le 31e message de la minute est refusé');
select throws_ok($$insert into public.messages (conversation_id, body) select tests.conv(), 'm' || g from generate_series(1, 5) g$$, 'PT429', null, 'insertion en rafale refusée');

select tests.act_admin();
delete from public.messages;
insert into public.messages (conversation_id, sender_id, body, created_at)
  select tests.conv(), '22222222-2222-2222-2222-222222222222', 'ancien ' || g, now() - interval '2 hours' - (g || ' minutes')::interval from generate_series(1, 300) g;
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'trop pour aujourd''hui')$$, 'PT429', 'Limite de 300 messages par jour atteinte', '301e message de la journée refusé');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.start_conversation('b0000000-0000-0000-0000-000000000003')$$, 'le plafond est par utilisateur : alice peut encore agir');

select tests.act_admin();
insert into public.listings (owner_id, activity_id, kind, city_id)
  select '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056') from generate_series(1, 25);
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.start_conversation(id) from public.listings where owner_id = '11111111-1111-1111-1111-111111111111' and status = 'disponible' limit 20$$, '20 conversations par jour autorisées');
select throws_ok($$select public.start_conversation(id) from public.listings where owner_id = '11111111-1111-1111-1111-111111111111' and status = 'disponible' and id not in (select listing_id from public.conversations) limit 1$$, 'PT429', 'Limite de 20 nouvelles conversations par jour atteinte', '21e conversation refusée');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.activities (name) select 'Activité ' || chr(64 + g) from generate_series(1, 10) g$$, '10 activités par jour autorisées');
select throws_ok($$insert into public.activities (name) values ('Onzième')$$, 'PT429', 'Limite de 10 nouvelles activités par jour atteinte', '11e activité refusée');

select * from finish();
rollback;
