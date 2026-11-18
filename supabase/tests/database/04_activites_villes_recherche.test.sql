begin;
\ir ../support/helpers.inc
select plan(56);
select tests.setup();

select tests.act_as('22222222-2222-2222-2222-222222222222');
-- ======================= dédoublonnage des activités ('Crochet' existe déjà)
select throws_ok($$insert into public.activities (name) values ('crochet')$$, '23505', null, '« crochet » en conflit');
select throws_ok($$insert into public.activities (name) values ('Crôchet')$$, '23505', null, '« Crôchet » en conflit');
select throws_ok($$insert into public.activities (name) values ('  CROCHET ')$$, '23505', null, 'majuscules/espaces en conflit');
select throws_ok($$insert into public.activities (name) values ('Crochet!')$$, '23505', null, 'ponctuation finale ignorée');
select throws_ok($$insert into public.activities (name) values ('Cro' || chr(8203) || 'chet')$$, '23505', null, 'caractère invisible ignoré');
select lives_ok($$insert into public.activities (name) values ('Œnologie')$$, 'nouvelle activité acceptée');
select throws_ok($$insert into public.activities (name) values ('Oenologie')$$, '23505', null, '« Oenologie » en conflit avec « Œnologie »');
select results_eq($$insert into public.activities (name) values ('Tri' || chr(8203) || 'cot ') returning name$$, $$values ('Tricot'::text)$$, 'nom nettoyé (caractère invisible, espace final)');
select tests.act_admin();
select is((select created_by from public.activities where name = 'Tricot'), '22222222-2222-2222-2222-222222222222'::uuid, 'created_by = auth.uid()');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$insert into public.activities (name) values ('!!')$$, '23514', null, 'nom réduit à rien une fois normalisé refusé');
select throws_ok($$insert into public.activities (name) values (repeat('a', 61))$$, '23514', null, 'nom trop long refusé');
select throws_ok($$update public.activities set name = 'Pirate'$$, '42501', null, 'activité non modifiable côté client');
select throws_ok($$delete from public.activities$$, '42501', null, 'activité non supprimable côté client');

-- ======================= search_activities
select results_eq($$select name from public.search_activities('crochette')$$, $$values ('Crochet'::text)$$, 'search_activities(''crochette'') trouve « Crochet »');
select results_eq($$select name from public.search_activities('CRÔCHET')$$, $$values ('Crochet'::text)$$, 'insensible casse/accents');
select is_empty($$select * from public.search_activities('guitare')$$, 'aucun faux positif sur un terme sans rapport');
select is_empty($$select * from public.search_activities('c')$$, 'requête trop courte ignorée');
select is_empty($$select * from public.search_activities(repeat('a', 200000))$$, 'requête de 200 000 caractères : vide, sans calcul');
select is_empty($$select * from public.search_activities(repeat('crochet', 15))$$, 'requête de plus de 100 caractères ignorée');
select is_empty($$select * from public.search_activities(null)$$, 'requête NULL : vide');
select tests.act_anon();
select results_eq($$select name from public.search_activities('crochette')$$, $$values ('Crochet'::text)$$, 'anon peut appeler search_activities');
select throws_ok($$select created_by from public.activities$$, '42501', null, 'created_by non exposé');

-- ======================= search_cities (référentiel complet importé)
select cmp_ok((select count(*) from public.cities), '>', 34000::bigint, 'référentiel complet des communes importé');
select is((select count(*) from public.cities where insee_code in ('2A004', '2B033', '97411', '97611', '75056')), 5::bigint, 'Corse, DOM et Mayotte présents');
select is((select name from public.search_cities('lyon') limit 1), 'Lyon', 'nom exact en tête');
select is((select name from public.search_cities('marseill') limit 1), 'Marseille', 'préfixe, la plus peuplée d''abord');
select is((select name from public.search_cities('LYÓN') limit 1), 'Lyon', 'insensible casse/accents');
select is((select name from public.search_cities('saint-etienne') limit 1), 'Saint-Étienne', 'tirets/accents normalisés');
select is((select name from public.search_cities('saint etienne') limit 1), 'Saint-Étienne', 'espace = tiret');
select is((select name from public.search_cities('Lyonn') limit 1), 'Lyon', 'faute de frappe : trigramme');
select is((select name from public.search_cities('69001') limit 1), 'Lyon', 'code postal en préfixe');
select is((select name from public.search_cities('750') limit 1), 'Paris', 'préfixe de code postal');
select cmp_ok((select count(*) from public.search_cities('sa')), '=', 10::bigint, 'limite de 10 résultats');
select is_empty($$select * from public.search_cities('x')$$, 'requête trop courte');
select is_empty($$select * from public.search_cities(repeat('a', 101))$$, 'requête de plus de 100 caractères ignorée');
select is_empty($$select * from public.search_cities(null)$$, 'requête NULL');
select is_empty($$select * from public.search_cities('%%')$$, 'les jokers LIKE ne sont pas interprétés');

-- ======================= search_listings (L1 Paris, L2 Versailles ~17 km, L3 Lyon ~390 km, L4 archivée)
select tests.act_anon();
select results_eq($$select id from public.search_listings(tests.city('75056'), 5)$$, $$values ('b0000000-0000-0000-0000-000000000001'::uuid)$$, 'rayon 5 km : Paris seulement (archivée exclue)');
select results_eq($$select id from public.search_listings(tests.city('75056'), 30)$$, $$values ('b0000000-0000-0000-0000-000000000001'::uuid), ('b0000000-0000-0000-0000-000000000002'::uuid)$$, 'rayon 30 km : + Versailles, triées par distance');
select is((select count(*) from public.search_listings(tests.city('75056'), 500)), 3::bigint, 'rayon 500 km : inclut Lyon');
select is((select count(*) from public.search_listings(tests.city('75056'), 1e9)), 3::bigint, 'rayon énorme borné à 1000 km');
select results_eq($$select id from public.search_listings(tests.city('75056'), null)$$, $$values ('b0000000-0000-0000-0000-000000000001'::uuid)$$, 'rayon NULL = commune seule');
select results_eq($$select id from public.search_listings(tests.city('75056'), -50)$$, $$values ('b0000000-0000-0000-0000-000000000001'::uuid)$$, 'rayon négatif = commune seule');
select results_eq($$select id from public.search_listings(tests.city('75056'), 500, null, 'pret')$$, $$values ('b0000000-0000-0000-0000-000000000002'::uuid)$$, 'filtre kind');
select is((select count(*) from public.search_listings(tests.city('75056'), 500, 'a0000000-0000-0000-0000-000000000002')), 1::bigint, 'filtre activité');
select is_empty($$select * from public.search_listings(gen_random_uuid(), 500)$$, 'ville inconnue : vide');
select cmp_ok((select distance_km from public.search_listings(tests.city('75056'), 30) where id = 'b0000000-0000-0000-0000-000000000002'), '>', 10::double precision, 'distance Versailles > 10 km');
select cmp_ok((select distance_km from public.search_listings(tests.city('75056'), 30) where id = 'b0000000-0000-0000-0000-000000000002'), '<', 25::double precision, 'distance Versailles < 25 km');
select tests.act_admin();
update public.listings set status = 'reservee' where id = 'b0000000-0000-0000-0000-000000000001';
update public.listings set status = 'donnee' where id = 'b0000000-0000-0000-0000-000000000003';
select tests.act_anon();
select is((select count(*) from public.search_listings(tests.city('75056'), 500)), 2::bigint, 'réservée incluse, donnée exclue');
select tests.act_admin();
update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000001';
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.search_listings(tests.city('75056'), 5)), 0::bigint, 'rayon 5 km : rien (L1 archivée, L2 à 17 km)');

select tests.act_admin();
insert into public.listings (owner_id, activity_id, kind, city_id)
  select '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056') from generate_series(1, 120);
select tests.act_anon();
select is((select count(*) from public.search_listings(tests.city('75056'), 5, null, null, 1000)), 100::bigint, 'p_limit plafonné à 100');
select is((select count(*) from public.search_listings(tests.city('75056'), 5)), 50::bigint, 'limite par défaut : 50');
select is((select count(*) from public.search_listings(tests.city('75056'), 5, null, null, null)), 50::bigint, 'p_limit NULL : défaut');
select is((select count(*) from public.search_listings(tests.city('75056'), 5, null, null, 0)), 1::bigint, 'p_limit 0 : borné à 1');
select is((select count(*) from public.search_listings(tests.city('75056'), 5, null, null, 100, 100)), 20::bigint, 'pagination par offset');
select is((select count(*) from public.search_listings(tests.city('75056'), 5, null, null, 100, -5)), 100::bigint, 'offset négatif borné à 0');

select * from finish();
rollback;
