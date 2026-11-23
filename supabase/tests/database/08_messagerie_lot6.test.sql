begin;
\ir ../support/helpers.inc
select plan(172);
select tests.setup();

-- ids de conversation mémorisés (relisibles sous n'importe quel rôle)
create function tests.cv(p_key text) returns uuid language sql stable as $$ select current_setting('tests.' || p_key)::uuid $$;
grant execute on function tests.cv(text) to public;

-- Fixtures : L1 alice don | L2 alice pret | L3 bob don | L4 alice archivée (cf. helpers.inc)
-- alice 1111.., bob 2222.., carol 3333..
discard plans;

-- ======================= droits : anon n'exécute aucune RPC du lot
select tests.act_anon();
select throws_ok($$select public.start_conversation('b0000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon : start_conversation refusée');
select throws_ok($$select * from public.list_my_conversations()$$, '42501', null, 'anon : list_my_conversations refusée');
select throws_ok($$select * from public.get_conversation(gen_random_uuid())$$, '42501', null, 'anon : get_conversation refusée');
select throws_ok($$select public.get_unread_count()$$, '42501', null, 'anon : get_unread_count refusée');
select throws_ok($$select public.mark_conversation_read(gen_random_uuid())$$, '42501', null, 'anon : mark_conversation_read refusée');
select throws_ok($$select public.start_loan(gen_random_uuid())$$, '42501', null, 'anon : start_loan refusée');
select throws_ok($$select public.return_loan(gen_random_uuid())$$, '42501', null, 'anon : return_loan refusée');
select throws_ok($$select * from private.my_conversations(null)$$, '42501', null, 'anon : le helper private.my_conversations est inaccessible');

-- connecté sans sub (jeton incomplet) : refus propre
select tests.act_as(null);
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000001')$$), '42501/auth_required', 'sans utilisateur : auth_required');
select is(tests.err($$select public.start_loan(gen_random_uuid())$$), '42501/auth_required', 'sans utilisateur : start_loan -> auth_required');
select is(tests.err($$select public.return_loan(gen_random_uuid())$$), '42501/auth_required', 'sans utilisateur : return_loan -> auth_required');
select is((select count(*) from private.my_conversations(null)), 0::bigint, 'sans utilisateur : aucune conversation');

-- ======================= start_conversation
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000001')$$), '23514/own_listing', 'ta propre annonce : own_listing');
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000004')$$), '23514/own_listing', 'ta propre annonce archivée : own_listing');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000004')$$), '23514/listing_unavailable', 'annonce archivée d''autrui : listing_unavailable');
select is(tests.err($$select public.start_conversation(gen_random_uuid())$$), '23514/listing_unavailable', 'annonce inexistante : même réponse (pas d''oracle)');
select is(tests.err($$select public.start_conversation(null)$$), '23514/listing_unavailable', 'annonce NULL : listing_unavailable');
select lives_ok($$select set_config('tests.c1', public.start_conversation('b0000000-0000-0000-0000-000000000001')::text, true)$$, 'bob ouvre une conversation sur L1');
select is(public.start_conversation('b0000000-0000-0000-0000-000000000001'), tests.cv('c1'), 'idempotent : même conversation au second appel');
select lives_ok($$select set_config('tests.c2', public.start_conversation('b0000000-0000-0000-0000-000000000002')::text, true)$$, 'bob ouvre une conversation sur L2 (prêt)');
select is((select count(*) from public.conversations), 2::bigint, 'pas de doublon créé');
select is((select requester_id from public.conversations where id = tests.cv('c1')), '22222222-2222-2222-2222-222222222222'::uuid, 'le demandeur est bien bob');

select throws_ok($$insert into public.conversations (listing_id) values ('b0000000-0000-0000-0000-000000000003')$$, '42501', null, 'insert direct sur conversations refusé (grant retiré)');

-- statuts : donnee refusée pour une NOUVELLE conversation ; reservee acceptée (pretee : cf. section prêts)
select tests.act_admin();
update public.listings set status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000003')$$), '23514/listing_unavailable', 'annonce donnée : aucune nouvelle conversation (listing_unavailable)');
select tests.act_admin();
update public.listings set status = 'reservee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select set_config('tests.c4', public.start_conversation('b0000000-0000-0000-0000-000000000003')::text, true)$$, 'annonce réservée : nouvelle conversation acceptée');
select tests.act_admin();
update public.listings set status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(public.start_conversation('b0000000-0000-0000-0000-000000000003'), tests.cv('c4'), 'annonce donnée : la conversation existante est tout de même renvoyée');
select tests.act_admin();
update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000003';
delete from public.conversations where id = tests.cv('c4');

-- une conversation existante reste accessible quand l'annonce n'est plus visible
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001'$$, 'alice archive L1');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(public.start_conversation('b0000000-0000-0000-0000-000000000001'), tests.cv('c1'), 'annonce archivée : la conversation existante est renvoyée');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$select public.start_conversation('b0000000-0000-0000-0000-000000000001')$$), '23514/listing_unavailable', 'sans conversation, l''annonce archivée reste indisponible');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000001'$$, 'alice republie L1');

-- ======================= messages : hints, texte
discard plans;
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), '  ')$$), '23514/body_empty', 'message vide : body_empty');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), U&'\200B\00A0 ')$$), '23514/body_empty', 'invisibles seuls : body_empty');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), repeat('a', 2001))$$), '23514/body_too_long', 'plus de 2000 caractères : body_too_long');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), repeat('a', 25000))$$), '23514/body_too_long', 'très gros message : body_too_long');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), repeat('a', 2000))$$, '2000 caractères acceptés');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), E'ligne 1\r\n\r\nligne' || U&'\200B' || ' 3')$$, 'message multiligne accepté');
select is((select body from public.messages where body like 'ligne%'), E'ligne 1\n\nligne 3', 'sauts de ligne conservés, invisibles retirés');
select lives_ok($$insert into public.messages (conversation_id, body, client_id) values (tests.cv('c1'), 'idempotent', 'c1000000-0000-0000-0000-000000000001')$$, 'envoi avec client_id accepté');
select is(tests.err($$insert into public.messages (conversation_id, body, client_id) values (tests.cv('c1'), 'idempotent', 'c1000000-0000-0000-0000-000000000001')$$), '23505/message_already_sent', 'nouvel essai avec le même client_id : message_already_sent');
select is((select count(*) from public.messages where body = 'idempotent'), 1::bigint, 'un seul message enregistré');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$insert into public.messages (conversation_id, body, client_id) values (tests.cv('c1'), 'autre expéditeur', 'c1000000-0000-0000-0000-000000000001')$$, 'le même client_id reste libre pour un autre expéditeur');
select tests.act_admin();
select throws_ok($$insert into public.messages (conversation_id, sender_id, body, client_id) values (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'course', 'c1000000-0000-0000-0000-000000000001')$$, '23505', null, 'l''index unique couvre la course entre deux envois');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'intrus')$$), '42501/', 'tiers : refus RLS sans hint (aucun détail sur la conversation)');

-- ======================= liste, en-tête, non-lus, lecture
select tests.act_admin();
delete from public.messages;
insert into public.messages (conversation_id, sender_id, body, created_at) values
  (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'Bonjour', now() - interval '3 hours'),
  (tests.cv('c1'), '11111111-1111-1111-1111-111111111111', 'Oui dispo', now() - interval '2 hours'),
  (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', E'Merci !\n\nSuper', now() - interval '1 hour');
discard plans;

select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$select conversation_id from public.list_my_conversations()$$, $$values (tests.cv('c1'))$$, 'alice (propriétaire) : la conversation c2 sans message est masquée');
select is((select count(*) from public.get_conversation(tests.cv('c2'))), 0::bigint, 'alice : get_conversation masque aussi la conversation vide');
select results_eq(
  $$select role, activity_name, listing_kind::text, listing_status::text, cover_photo_path, other_display_name, is_closed, last_message_excerpt, last_message_from_me, unread_count, loan_id from public.list_my_conversations() where conversation_id = tests.cv('c1')$$,
  $$values ('owner', 'Crochet', 'don', 'disponible', '11111111-1111-1111-1111-111111111111/a.jpg', 'Bob', false, 'Merci ! Super', false, 2, null::uuid)$$,
  'alice : ligne de la conversation c1');
select is(public.get_unread_count(), 2, 'alice : 2 non-lus au total');
select is((select count(*) from public.get_conversation(tests.cv('c1'))), 1::bigint, 'get_conversation : en-tête pour un participant');
select is((select unread_count from public.get_conversation(tests.cv('c1'))), 2, 'get_conversation : même donnée que la liste');

select tests.act_as('22222222-2222-2222-2222-222222222222');
select results_eq($$select conversation_id from public.list_my_conversations()$$, $$values (tests.cv('c2')), (tests.cv('c1'))$$, 'bob (demandeur) : voit sa conversation vide c2, triée par dernière activité');
select results_eq(
  $$select last_message_excerpt, last_message_at, last_message_from_me, unread_count from public.list_my_conversations() where conversation_id = tests.cv('c2')$$,
  $$values (null::text, null::timestamptz, null::boolean, 0)$$, 'bob : conversation sans message');
select results_eq(
  $$select role, other_display_name, last_message_from_me, unread_count from public.list_my_conversations() where conversation_id = tests.cv('c1')$$,
  $$values ('requester', 'Alice', true, 1)$$, 'bob : ligne côté demandeur');
select is(public.get_unread_count(), 1, 'bob : 1 non-lu');

select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.list_my_conversations()), 0::bigint, 'carol : aucune conversation');
select is((select count(*) from public.get_conversation(tests.cv('c1'))), 0::bigint, 'tiers : get_conversation ne renvoie rien');
select is((select count(*) from public.get_conversation(gen_random_uuid())), 0::bigint, 'conversation inconnue : rien non plus');
select is((select count(*) from public.get_conversation(null)), 0::bigint, 'NULL : rien');
select is(public.get_unread_count(), 0, 'carol : 0 non-lu');
select is(public.mark_conversation_read(tests.cv('c1')), 0, 'tiers : mark_conversation_read ne marque rien');
select is(public.mark_conversation_read(gen_random_uuid()), 0, 'conversation inconnue : 0, sans erreur');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(public.get_unread_count(), 2, 'les non-lus d''alice sont intacts après l''appel du tiers');
select is(public.mark_conversation_read(tests.cv('c1')), 2, 'alice marque 2 messages lus');
select is(public.mark_conversation_read(tests.cv('c1')), 0, 'idempotent : rien de plus à marquer');
select is(public.get_unread_count(), 0, 'alice : plus de non-lu');
select is((select count(*) from public.messages where sender_id = '11111111-1111-1111-1111-111111111111' and read_at is not null), 0::bigint, 'ses propres messages ne sont pas marqués lus');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(public.get_unread_count(), 1, 'bob : son non-lu est intact');
select is(public.mark_conversation_read(tests.cv('c1')), 1, 'bob marque le message d''alice');

-- annonce archivée : le demandeur garde l'en-tête, sans pouvoir lire l'annonce directement
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001'$$, 'alice archive L1');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select results_eq($$select listing_status::text, activity_name, cover_photo_path is not null from public.get_conversation(tests.cv('c1'))$$, $$values ('archivee', 'Crochet', true)$$, 'bob voit l''en-tête d''une annonce archivée');
select is((select count(*) from public.listings where id = 'b0000000-0000-0000-0000-000000000001'), 0::bigint, 'mais l''annonce archivée reste illisible en direct');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'Toujours là ?')$$, 'et on peut y écrire tant que les deux membres existent');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000001'$$, 'alice republie L1');

-- pagination (created_at, id) : départage des messages simultanés, page 2 par curseur
select tests.act_admin();
delete from public.messages;
insert into public.messages (conversation_id, sender_id, body, created_at)
  select tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'm' || g,
         case when g <= 3 then '2026-01-01 10:00:00+00' else '2026-01-01 11:00:00+00' end::timestamptz
  from generate_series(1, 5) g;
select tests.act_as('11111111-1111-1111-1111-111111111111');
select set_config('tests.p1', array(select id from public.messages where conversation_id = tests.cv('c1') order by created_at desc, id desc limit 3)::text, true);
select set_config('tests.cur_at', (select created_at::text from public.messages where id = (current_setting('tests.p1')::uuid[])[3]), true);
select is(
  current_setting('tests.p1')::uuid[]
  || array(select id from public.messages
           where conversation_id = tests.cv('c1')
             and (created_at, id) < (current_setting('tests.cur_at')::timestamptz, (current_setting('tests.p1')::uuid[])[3])
           order by created_at desc, id desc limit 3),
  array(select id from public.messages where conversation_id = tests.cv('c1') order by created_at desc, id desc),
  'pagination par curseur (created_at, id) : pages jointives, sans doublon ni trou malgré les égalités');

-- ======================= prêts
discard plans;
select tests.act_admin();
delete from public.messages;
insert into public.messages (conversation_id, sender_id, body) values
  (tests.cv('c2'), '22222222-2222-2222-2222-222222222222', 'Je le veux bien'),
  (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'Et celui-ci ?');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$), '23514/no_conversation', 'insert direct sans conversation : no_conversation');
select is(tests.err($$select public.start_loan(tests.cv('c1'))$$), '23514/listing_not_loanable', 'prêt sur un don : listing_not_loanable');
select is(tests.err($$select public.start_loan(tests.cv('c2'), now() - interval '1 day')$$), '23514/due_date_invalid', 'date de retour passée : due_date_invalid');
select is(tests.err($$select public.start_loan(gen_random_uuid())$$), '42501/conversation_not_found', 'conversation inconnue : conversation_not_found');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.start_loan(tests.cv('c2'))$$), '42501/conversation_not_found', 'le demandeur ne démarre pas de prêt : conversation_not_found');
select is(tests.err($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')$$), '42501/listing_not_found', 'insert direct par un non-propriétaire : listing_not_found');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is(tests.err($$select public.start_loan(tests.cv('c2'))$$), '42501/conversation_not_found', 'un tiers : conversation_not_found');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select set_config('tests.loan', public.start_loan(tests.cv('c2'), now() + interval '7 days')::text, true)$$, 'alice démarre un prêt pour bob, avec date de retour');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'pretee', 'l''annonce passe à « pretee »');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select set_config('tests.c3', public.start_conversation('b0000000-0000-0000-0000-000000000002')::text, true)$$, 'annonce prêtée : nouvelle conversation acceptée');
select tests.act_admin();
insert into public.messages (conversation_id, sender_id, body) values (tests.cv('c3'), '33333333-3333-3333-3333-333333333333', 'Et pour moi ?');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($$select public.start_loan(tests.cv('c2'))$$), '23514/loan_already_open', 'second prêt : loan_already_open');
select is(tests.err($$select public.start_loan(tests.cv('c3'))$$), '23514/loan_already_open', 'prêt à une autre personne : loan_already_open');
select is(tests.err($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$), '23514/loan_already_open', 'insert direct : loan_already_open');
select is(tests.err($$update public.loans set due_at = '2000-01-01'$$), '23514/due_date_invalid', 'date de retour modifiée avant le début : due_date_invalid');
select lives_ok($$update public.loans set due_at = now() + interval '10 days'$$, 'la date de retour peut être repoussée');
select results_eq(
  $$select listing_status::text, loan_id is not null, loan_due_at is not null from public.get_conversation(tests.cv('c2'))$$,
  $$values ('pretee', true, true)$$, 'alice : l''en-tête indique le prêt ouvert');
select results_eq(
  $$select listing_status::text, loan_id from public.get_conversation(tests.cv('c3'))$$,
  $$values ('pretee', null::uuid)$$, 'alice : autre conversation de la même annonce, pas de prêt rattaché');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select results_eq(
  $$select listing_status::text, loan_id = tests.cv('loan') from public.get_conversation(tests.cv('c2'))$$,
  $$values ('pretee', true)$$, 'bob (emprunteur) voit son prêt dans l''en-tête');
select tests.act_as('33333333-3333-3333-3333-333333333333');
select results_eq(
  $$select listing_status::text, loan_id from public.get_conversation(tests.cv('c3'))$$,
  $$values ('pretee', null::uuid)$$, 'carol : annonce prêtée à quelqu''un d''autre, sans détail du prêt');
select is(tests.err($$select public.return_loan(tests.cv('loan'))$$), '42501/loan_not_found', 'un tiers ne clôture pas : loan_not_found');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.return_loan(tests.cv('loan'))$$), '42501/loan_not_found', 'l''emprunteur ne clôture pas : loan_not_found');
select is(tests.err($$select public.return_loan(gen_random_uuid())$$), '42501/loan_not_found', 'prêt inconnu : loan_not_found');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.return_loan(tests.cv('loan'))$$, 'alice marque le prêt rendu');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'disponible', 'l''annonce redevient disponible');
select is(tests.err($$select public.return_loan(tests.cv('loan'))$$), '23514/loan_already_returned', 'second retour : loan_already_returned');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$select public.return_loan(tests.cv('loan'))$$), '23514/loan_already_returned', 'l''emprunteur reçoit aussi loan_already_returned sur un prêt rendu');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$select listing_status::text, loan_id from public.get_conversation(tests.cv('c2'))$$, $$values ('disponible', null::uuid)$$, 'l''en-tête n''indique plus de prêt');
select lives_ok($$select public.start_loan(tests.cv('c2'))$$, 'un nouveau prêt est possible, sans date de retour');
select lives_ok($$select public.return_loan((select id from public.loans where returned_at is null))$$, 'et se clôture');
select lives_ok($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000002'$$, 'alice archive L2');
select is(tests.err($$select public.start_loan(tests.cv('c2'))$$), '23514/listing_not_available', 'annonce archivée : listing_not_available');
select tests.act_admin();
select is(tests.err($$update public.loans set borrower_id = '33333333-3333-3333-3333-333333333333'$$), '23514/loan_immutable_fields', 'borrower_id immuable : loan_immutable_fields');
select is(tests.err($$update public.loans set listing_id = 'b0000000-0000-0000-0000-000000000001'$$), '23514/loan_immutable_fields', 'listing_id immuable : loan_immutable_fields');

-- ======================= anti-spam : hints
select tests.act_admin();
select tests.setup();
discard plans;
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
select set_config('tests.c1', tests.conv()::text, true);
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.messages (conversation_id, body) select tests.cv('c1'), 'm' || g from generate_series(1, 30) g$$, '30 messages par minute');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'de trop')$$), 'PT429/message_rate_limit', 'le 31e : message_rate_limit');
select tests.act_admin();
delete from public.messages;
insert into public.messages (conversation_id, sender_id, body, created_at)
  select tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'ancien ' || g, now() - interval '2 hours' - (g || ' minutes')::interval from generate_series(1, 300) g;
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'trop pour aujourd''hui')$$), 'PT429/message_rate_limit', 'plafond journalier : message_rate_limit');

select tests.act_admin();
insert into public.listings (owner_id, activity_id, kind, city_id)
  select '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056') from generate_series(1, 25);
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$select public.start_conversation(id) from public.listings where owner_id = '11111111-1111-1111-1111-111111111111' and status = 'disponible' limit 20$$, '20 conversations par jour');
select is(tests.err($$select public.start_conversation(id) from public.listings where owner_id = '11111111-1111-1111-1111-111111111111' and status = 'disponible' and id not in (select listing_id from public.conversations) limit 1$$), 'PT429/conversation_rate_limit', 'la 21e : conversation_rate_limit');
select is((select public.start_conversation(listing_id) from public.conversations limit 1) is not null, true, 'plafond atteint : une conversation existante reste récupérable');

-- ======================= conversations orphelines
select tests.act_admin();
select tests.setup();
discard plans;
select tests.open_conversation('b0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333');
select set_config('tests.c3', tests.conv()::text, true);
select tests.open_conversation('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
select set_config('tests.c1', tests.conv()::text, true);
insert into public.messages (conversation_id, sender_id, body) values
  (tests.cv('c3'), '33333333-3333-3333-3333-333333333333', 'Coucou'),
  (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'Hello');
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select results_eq($$select other_user_id, other_display_name, is_closed, unread_count from public.get_conversation(tests.cv('c3'))$$, $$values (null::uuid, null::text, true, 1)$$, 'demandeur supprimé : « Membre supprimé » (null), conversation fermée, non-lu conservé');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c3'), 'dans le vide')$$), '42501/conversation_closed', 'écriture refusée : conversation_closed');
select is(tests.err($$select public.start_loan(tests.cv('c3'))$$), '42501/conversation_closed', 'prêt impossible : conversation_closed');
select is(public.mark_conversation_read(tests.cv('c3')), 1, 'la lecture reste possible');
select tests.act_admin();
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select results_eq($$select other_display_name, listing_status::text, is_closed from public.get_conversation(tests.cv('c1'))$$, $$values (null::text, 'archivee', true)$$, 'propriétaire supprimé : annonce archivée, « Membre supprimé », fermée');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'dans le vide')$$), '42501/conversation_closed', 'propriétaire supprimé : conversation_closed');
select is(public.start_conversation('b0000000-0000-0000-0000-000000000001'), tests.cv('c1'), 'propriétaire supprimé : la conversation existante reste récupérable');

-- ======================= confidentialité : le propriétaire ne voit rien tant que le demandeur n'a pas écrit
select tests.act_admin();
select tests.setup();
discard plans;
select tests.act_as('33333333-3333-3333-3333-333333333333');
select set_config('tests.c1', public.start_conversation('b0000000-0000-0000-0000-000000000001')::text, true);
select set_config('tests.c2', public.start_conversation('b0000000-0000-0000-0000-000000000002')::text, true);
select tests.act_admin();
select realtime.send('{}'::jsonb, 'message_created', 'conversation:' || tests.cv('c1'));
delete from realtime.messages;
select realtime.send('{}'::jsonb, 'message_created', 'conversation:' || tests.cv('c1'));

select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.conversations), 0::bigint, 'alice ne lit pas la conversation vide (select direct)');
select is((select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 0::bigint, 'ni le profil de carol');
select is((select count(*) from public.list_my_conversations()), 0::bigint, 'ni via list_my_conversations');
select is((select count(*) from public.get_conversation(tests.cv('c1'))), 0::bigint, 'ni via get_conversation');
select is(private.shares_conversation_with('33333333-3333-3333-3333-333333333333'), false, 'shares_conversation_with : false côté propriétaire');
select is(tests.err($$select public.start_loan(tests.cv('c2'))$$), '42501/conversation_not_found', 'start_loan : conversation_not_found tant que carol n''a rien écrit');
select is(tests.err($$insert into public.loans (listing_id, borrower_id) values ('b0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333')$$), '23514/no_conversation', 'insert direct sur loans vers un demandeur silencieux : no_conversation (pas d''oracle)');
select is(tests.err($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'Je commence')$$), '42501/', 'le propriétaire ne peut pas écrire le premier message');
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 0::bigint, 'ni s''abonner au topic de la conversation (policy realtime)');

select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.conversations), 2::bigint, 'carol (demandeur) voit ses conversations vides');
select tests.act_admin();
delete from realtime.messages;
select tests.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'Bonjour'), (tests.cv('c2'), 'Bonjour aussi')$$, 'carol écrit le premier message');
select tests.act_admin();
select is((select count(*) from realtime.messages where event = 'inbox_changed' and topic = 'user:11111111-1111-1111-1111-111111111111' and payload ->> 'reason' = 'message'), 2::bigint, 'le premier message déclenche inbox_changed vers le propriétaire');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.conversations), 2::bigint, 'alice voit les conversations après le premier message');
select is((select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 'Carol', 'et le profil de carol');
select is((select count(*) from public.list_my_conversations()), 2::bigint, 'list_my_conversations les liste');
select is(private.shares_conversation_with('33333333-3333-3333-3333-333333333333'), true, 'shares_conversation_with : true');
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 1::bigint, 'alice peut écouter le topic de la conversation');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'Bonjour Carol')$$, 'alice répond');
select lives_ok($$select public.start_loan(tests.cv('c2'))$$, 'start_loan possible après le premier message');

-- ======================= prêt ouvert d'un compte supprimé
select tests.act_admin();
select tests.setup();
discard plans;
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
select set_config('tests.c2', tests.conv()::text, true);
insert into public.messages (conversation_id, sender_id, body) values (tests.cv('c2'), '22222222-2222-2222-2222-222222222222', 'Bonjour');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select set_config('tests.loan', public.start_loan(tests.cv('c2'))::text, true);
select tests.act_admin();
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$select other_display_name, is_closed, listing_status::text, loan_id = tests.cv('loan') from public.get_conversation(tests.cv('c2'))$$, $$values (null::text, true, 'pretee', true)$$, 'emprunteur supprimé : le propriétaire voit le prêt ouvert de la conversation');
select lives_ok($$select public.return_loan(tests.cv('loan'))$$, 'et peut le clôturer');
select is((select status::text from public.listings where id = 'b0000000-0000-0000-0000-000000000002'), 'disponible', 'l''annonce redevient disponible');

select tests.act_admin();
select tests.setup();
discard plans;
select tests.open_conversation('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
select set_config('tests.c2', tests.conv()::text, true);
insert into public.messages (conversation_id, sender_id, body) values (tests.cv('c2'), '22222222-2222-2222-2222-222222222222', 'Bonjour');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select set_config('tests.loan', public.start_loan(tests.cv('c2'))::text, true);
select tests.act_admin();
delete from realtime.messages;
select lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'propriétaire supprimé avec un prêt ouvert : la suppression réussit');
select results_eq($$select payload ->> 'returned' from realtime.messages where event = 'loan_changed' and topic = 'conversation:' || tests.cv('c2')$$, $$values ('true')$$, 'et loan_changed (clos) est diffusé à l''emprunteur');
select is((select returned_at is not null from public.loans where id = tests.cv('loan')), true, 'le prêt est clos par la purge');

-- ======================= temps réel (Broadcast privé)
select tests.act_admin();
select tests.setup();
discard plans;
select is_empty($$select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages'$$, 'messages n''est plus dans la publication postgres_changes');
select results_eq($$select count(*)::int, bool_and(prosecdef) from pg_proc where pronamespace = 'private'::regnamespace
           and proname in ('validate_message', 'messages_broadcast_insert', 'messages_broadcast_read', 'loans_broadcast')$$,
  $$values (4, true)$$, 'les 4 fonctions de trigger du lot 6 existent et sont security definer');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select set_config('tests.c1', public.start_conversation('b0000000-0000-0000-0000-000000000001')::text, true);
select set_config('tests.c2', public.start_conversation('b0000000-0000-0000-0000-000000000002')::text, true);
select tests.act_admin();
insert into public.messages (conversation_id, sender_id, body) values (tests.cv('c2'), '22222222-2222-2222-2222-222222222222', 'Pour le prêt');
delete from realtime.messages;

-- nouveau message
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$insert into public.messages (conversation_id, body) values (tests.cv('c1'), 'Secret : mon adresse')$$, 'bob écrit à alice');
select tests.act_admin();
select is((select count(*) from realtime.messages where event = 'message_created' and topic = 'conversation:' || tests.cv('c1') and private), 1::bigint, 'message_created publié sur le canal privé de la conversation');
select is((select count(*) from realtime.messages where event = 'inbox_changed' and topic = 'user:11111111-1111-1111-1111-111111111111' and payload ->> 'reason' = 'message'), 1::bigint, 'inbox_changed publié pour le destinataire (alice)');
select is((select count(*) from realtime.messages where topic like 'user:2222%'), 0::bigint, 'rien pour l''expéditeur');
select is((select count(*) from realtime.messages where payload::text like '%Secret%' or payload ? 'body'), 0::bigint, 'le corps du message n''est jamais diffusé ni stocké dans realtime.messages');
select is((select payload ->> 'message_id' from realtime.messages where event = 'message_created'), (select id::text from public.messages where body like 'Secret%'), 'le payload contient l''identifiant du message');

-- lecture : un événement par conversation, quel que soit le nombre de messages
delete from realtime.messages;
insert into public.messages (conversation_id, sender_id, body) values
  (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'deux'), (tests.cv('c1'), '22222222-2222-2222-2222-222222222222', 'trois');
delete from realtime.messages;
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(public.mark_conversation_read(tests.cv('c1')), 3, 'alice lit 3 messages');
select tests.act_admin();
select results_eq($$select (payload ->> 'count')::int, payload ->> 'reader_id' from realtime.messages where event = 'messages_read' and topic = 'conversation:' || tests.cv('c1')$$, $$values (3, '11111111-1111-1111-1111-111111111111')$$, 'un seul messages_read pour 3 messages');
select is((select count(*) from realtime.messages where event = 'inbox_changed' and topic = 'user:11111111-1111-1111-1111-111111111111' and payload ->> 'reason' = 'read'), 1::bigint, 'inbox_changed pour le lecteur (ses autres appareils)');
delete from realtime.messages;
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(public.mark_conversation_read(tests.cv('c1')), 0, 'rien à marquer');
select tests.act_admin();
select is((select count(*) from realtime.messages), 0::bigint, 'rien de diffusé quand rien n''a changé');

-- prêt
select tests.act_as('11111111-1111-1111-1111-111111111111');
select set_config('tests.loan', public.start_loan(tests.cv('c2'))::text, true);
select tests.act_admin();
select results_eq($$select payload ->> 'returned', payload ->> 'loan_id' from realtime.messages where event = 'loan_changed' and topic = 'conversation:' || tests.cv('c2')$$, $$values ('false', tests.cv('loan')::text)$$, 'loan_changed (prêt démarré) sur la conversation');
select is((select count(*) from realtime.messages where event = 'inbox_changed' and payload ->> 'reason' = 'loan'), 2::bigint, 'inbox_changed pour le prêteur et l''emprunteur');
delete from realtime.messages;
select tests.act_as('11111111-1111-1111-1111-111111111111');
select public.return_loan(tests.cv('loan'));
select tests.act_admin();
select is((select payload ->> 'returned' from realtime.messages where event = 'loan_changed'), 'true', 'loan_changed (rendu)');
delete from realtime.messages;
update public.loans set due_at = due_at;
select is((select count(*) from realtime.messages), 0::bigint, 'mise à jour à vide d''un prêt : rien de diffusé');

-- policies realtime.messages : simulation du contrôle d'accès du serveur Realtime (realtime.topic())
delete from realtime.messages;
select realtime.send('{"x":1}'::jsonb, 'message_created', 'conversation:' || tests.cv('c1'));
select realtime.send('{"x":2}'::jsonb, 'inbox_changed', 'user:22222222-2222-2222-2222-222222222222');
select realtime.send('{"x":4}'::jsonb, 'inbox_changed', 'user:11111111-1111-1111-1111-111111111111');
select realtime.send('{"x":3}'::jsonb, 'inbox_changed', 'conversation:not-a-uuid');
discard plans;

select tests.act_as('22222222-2222-2222-2222-222222222222');  -- bob : participant de c1, son user topic
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 1::bigint, 'policy : un participant (demandeur) lit le topic de sa conversation');
select set_config('realtime.topic', 'user:22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from realtime.messages), 1::bigint, 'policy : sur son propre topic user, sans filtre, on ne voit que ses lignes (pas user:alice ni les autres conversations)');
select set_config('realtime.topic', 'user:11111111-1111-1111-1111-111111111111', true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : pas le topic user d''un autre');
select set_config('realtime.topic', 'conversation:not-a-uuid', true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : topic mal formé refusé sans erreur de cast');
select throws_ok($$insert into realtime.messages (topic, extension, payload, event, private) values ('conversation:' || tests.cv('c1'), 'broadcast', '{}', 'message_created', true)$$, '42501', null, 'policy : un client ne peut rien diffuser');

select tests.act_as('11111111-1111-1111-1111-111111111111');  -- alice : propriétaire
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 1::bigint, 'policy : le propriétaire lit aussi le topic de la conversation');
select set_config('realtime.topic', 'user:22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : alice ne lit pas le topic user de bob');

select tests.act_as('33333333-3333-3333-3333-333333333333');  -- carol : tiers
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : un tiers ne lit pas la conversation');
select set_config('realtime.topic', 'user:22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : un tiers ne lit pas un topic user');

select tests.act_anon();
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 0::bigint, 'policy : anon ne lit rien');

-- une conversation dont l'annonce est archivée reste écoutable par ses participants
select tests.act_admin();
update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001';
select tests.act_as('22222222-2222-2222-2222-222222222222');
select set_config('realtime.topic', 'conversation:' || tests.cv('c1'), true);
select is((select count(*) from realtime.messages), 1::bigint, 'policy : annonce archivée, le demandeur écoute toujours sa conversation');

select * from finish();
rollback;
