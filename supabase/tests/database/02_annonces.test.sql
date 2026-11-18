begin;
\ir ../support/helpers.inc
select plan(13);
select tests.setup();

select tests.act_as('22222222-2222-2222-2222-222222222222');
select is_empty($$update public.listings set description = 'pirate' where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$, 'bob ne modifie pas l''annonce d''alice');
select throws_ok($$delete from public.listings where id = 'b0000000-0000-0000-0000-000000000001'$$, '42501', null, 'aucune suppression d''annonce côté client (on archive)');
select throws_ok($$insert into public.listings (owner_id, activity_id, kind, city_id) values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'))$$, '42501', null, 'bob ne publie pas au nom d''alice');
select throws_ok($$insert into public.listings (activity_id, kind, city_id, status) values ('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), 'donnee')$$, '42501', null, 'status non fournissable à la création');
select results_eq($$insert into public.listings (activity_id, kind, city_id) values ('a0000000-0000-0000-0000-000000000002', 'pret', tests.city('75056')) returning owner_id, status::text$$, $$values ('22222222-2222-2222-2222-222222222222'::uuid, 'disponible'::text)$$, 'owner_id = auth.uid() et statut disponible par défaut');
select is((select count(*) from public.listings where id = 'b0000000-0000-0000-0000-000000000004'), 0::bigint, 'annonce archivée invisible des tiers');

select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$update public.listings set description = 'ok' where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$, $$values (1)$$, 'alice modifie son annonce');
select throws_ok($$update public.listings set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'b0000000-0000-0000-0000-000000000001'$$, '42501', null, 'owner_id non modifiable');
select throws_ok($$update public.listings set kind = 'pret', status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000001'$$, '23514', null, 'incohérence kind/status refusée');
select throws_ok($$update public.listings set status = 'pretee' where id = 'b0000000-0000-0000-0000-000000000001'$$, '23514', null, 'statut « pretee » non posable à la main');
select throws_ok($$update public.listings set description = repeat('a', 2001) where id = 'b0000000-0000-0000-0000-000000000001'$$, '23514', null, 'description bornée');
select is((select count(*) from public.listings where id = 'b0000000-0000-0000-0000-000000000004'), 1::bigint, 'alice voit sa propre annonce archivée');
select results_eq($$update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001' returning status::text$$, $$values ('archivee'::text)$$, 'alice archive son annonce');

select * from finish();
rollback;
