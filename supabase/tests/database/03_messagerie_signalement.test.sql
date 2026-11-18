begin;
\ir ../support/helpers.inc
select plan(37);
select tests.setup();

select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

-- ======================= conversations
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000001')$$, '42501', null, 'impossible de converser sur sa propre annonce');
select is((select count(*) from public.conversations), 1::bigint, 'le propriétaire voit la conversation');

select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.conversations), 0::bigint, 'un tiers ne lit pas la conversation');
select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000004')$$, '42501', null, 'pas de conversation sur une annonce archivée');
select lives_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000001')$$, 'carol ouvre sa propre conversation sur L1');
select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000001')$$, '23505', null, 'une seule conversation par (annonce, demandeur)');
select throws_ok($$insert into public.conversations (listing_id, requester_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')$$, '42501', null, 'requester_id usurpé refusé');

-- ======================= messages
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'Bonjour')$$, 'bob écrit');
select throws_ok($$insert into public.messages (conversation_id, sender_id, body) values (tests.conv(), '11111111-1111-1111-1111-111111111111', 'usurpation')$$, '42501', null, 'sender_id usurpé refusé');
select throws_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), '   ')$$, '23514', null, 'message vide refusé');
select throws_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), repeat('a', 2001))$$, '23514', null, 'message trop long refusé');
select is_empty($$update public.messages set read_at = now() returning 1$$, 'l''expéditeur ne marque pas son propre message lu');

select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.messages), 0::bigint, 'un tiers ne lit pas les messages');
select throws_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'intrus')$$, '42501', null, 'un tiers ne peut pas écrire dans la conversation');
select is_empty($$update public.messages set read_at = now() returning 1$$, 'un tiers ne marque pas un message lu');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.messages), 1::bigint, 'le propriétaire lit les messages reçus');
select results_eq($$update public.messages set read_at = '2000-01-01' returning read_at > now() - interval '1 minute'$$, $$values (true)$$, 'le destinataire marque lu ; read_at forcé à now()');
select results_eq($$update public.messages set read_at = null returning read_at is not null$$, $$values (true)$$, 'read_at ne repasse pas à NULL');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'Oui !')$$, 'alice répond');

-- conversation conservée quand l'annonce est archivée
select results_eq($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$, $$values (1)$$, 'alice archive l''annonce');
select is((select count(*) from public.messages), 2::bigint, 'conversation toujours lisible par le propriétaire');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.messages), 2::bigint, 'conversation toujours lisible par le demandeur');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.conv(), 'Merci')$$, 'et on peut encore y écrire');

-- ======================= reports
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.reports (listing_id, reason) values ('b0000000-0000-0000-0000-000000000002', 'Contenu suspect')$$, 'bob signale une annonce');
select throws_ok($$insert into public.reports (listing_id, reason) values ('b0000000-0000-0000-0000-000000000002', 'Encore')$$, '23505', null, 'un seul signalement par (annonce, utilisateur)');
select throws_ok($$insert into public.reports (listing_id, reason) values ('b0000000-0000-0000-0000-000000000001', 'Contenu suspect')$$, '42501', null, 'pas de signalement d''une annonce invisible (archivée)');
select throws_ok($$insert into public.reports (listing_id, reporter_id, reason) values ('b0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'usurpation')$$, '42501', null, 'reporter_id usurpé refusé');
select throws_ok($$select * from public.reports$$, '42501', null, 'reports non lisibles par bob');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$select count(*) from public.reports$$, '42501', null, 'reports non lisibles par le propriétaire de l''annonce signalée');
select tests.act_anon();
select throws_ok($$select count(*) from public.reports$$, '42501', null, 'reports non lisibles par anon');

-- helper autonome : participant -> true, non-participant -> false
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(private.conversation_has_both_parties(tests.conv()), true, 'helper : un participant obtient true');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(private.conversation_has_both_parties(tests.conv()), false, 'helper : un non-participant obtient false');

-- ======================= conversations orphelines : lecture oui, écriture non
-- (demandeur supprimé : conversation carol -> annonce de bob ; propriétaire supprimé : conversation bob -> annonce d'alice)
select tests.open_conversation('b0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333');
select set_config('tests.conv_requester', tests.conv()::text, true);
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.messages (conversation_id, body) values (current_setting('tests.conv_requester')::uuid, 'Avant suppression')$$, 'bob (propriétaire) écrit tant que le demandeur existe');
select tests.act_admin();
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.messages (conversation_id, body) values (current_setting('tests.conv_requester')::uuid, 'Dans le vide')$$, '42501', null, 'écriture refusée si la conversation n''a plus de demandeur');
select is((select count(*) from public.messages where conversation_id = current_setting('tests.conv_requester')::uuid), 1::bigint, 'mais la conversation reste lisible');

select tests.act_admin();
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.messages (conversation_id, body) select id, 'Dans le vide' from public.conversations where listing_id = 'b0000000-0000-0000-0000-000000000001'$$, '42501', null, 'écriture refusée si l''annonce n''a plus de propriétaire');
select is((select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.listing_id = 'b0000000-0000-0000-0000-000000000001'), 3::bigint, 'mais les messages restent lisibles par le demandeur');

select * from finish();
rollback;
