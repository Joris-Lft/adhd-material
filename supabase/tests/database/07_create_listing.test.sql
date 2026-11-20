begin;
\ir ../support/helpers.inc
select plan(78);
select tests.setup();

-- Fichiers Storage simulés : insérés par postgres, owner et owner_id cohérents avec le dossier.
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p1.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p2.png',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p3.webp', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p4.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p5.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p6.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/p7.jpg',  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/m1.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/m2.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/clean.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/cap1.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/cap2.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '11111111-1111-1111-1111-111111111111/cap3.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('listing-photos', '22222222-2222-2222-2222-222222222222/b1.jpg',  '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

-- ======================= succès
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p1.jpg','11111111-1111-1111-1111-111111111111/p2.png','11111111-1111-1111-1111-111111111111/p3.webp'], '  Bel   matériel ', 'Facile')::text, true)$$, '3 photos : annonce créée');
select results_eq($$select status::text, owner_id, kind::text, description, experience from public.listings where id = current_setting('tests.l')::uuid$$,
  $$values ('disponible', '11111111-1111-1111-1111-111111111111'::uuid, 'don', 'Bel matériel', 'Facile')$$, 'annonce disponible, propriétaire = appelant, textes nettoyés');
select results_eq($$select storage_path, position::int from public.listing_photos where listing_id = current_setting('tests.l')::uuid order by position$$,
  $$values ('11111111-1111-1111-1111-111111111111/p1.jpg', 1), ('11111111-1111-1111-1111-111111111111/p2.png', 2), ('11111111-1111-1111-1111-111111111111/p3.webp', 3)$$, 'positions = rang dans le tableau');

-- ======================= description vide -> null
select lives_ok($$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'pret', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p4.jpg'], '   ', '')::text, true)$$, '1 photo, textes vides');
select results_eq($$select description is null, experience is null from public.listings where id = current_setting('tests.l')::uuid$$, $$values (true, true)$$, 'chaînes vides devenues null');

-- ======================= refus : anon, nombre de photos, chemins
select tests.act_anon();
select is(has_function_privilege('anon', 'public.create_listing(uuid, public.listing_kind, uuid, text[], text, text)', 'execute'), false, 'anon n''a pas EXECUTE sur create_listing');
select is(has_function_privilege('public', 'public.create_listing(uuid, public.listing_kind, uuid, text[], text, text)', 'execute'), false, 'public n''a pas EXECUTE sur create_listing');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$$, '42501', 'permission denied for function create_listing', 'anon : EXECUTE refusé (erreur du grant, pas de la fonction)');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array[]::text[])$$, '22023', 'Une annonce doit avoir de 1 à 3 photos', '0 photo refusée');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), null)$$, '22023', 'Une annonce doit avoir de 1 à 3 photos', 'tableau null refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p1.jpg','11111111-1111-1111-1111-111111111111/p2.png','11111111-1111-1111-1111-111111111111/p3.webp','11111111-1111-1111-1111-111111111111/p4.jpg'])$$, '22023', 'Une annonce doit avoir de 1 à 3 photos', '4 photos refusées');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg', null])$$, '22023', 'Chemin de photo manquant', 'chemin null refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg','11111111-1111-1111-1111-111111111111/p5.jpg'])$$, '22023', 'La même photo ne peut pas être ajoutée deux fois', 'doublon refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['22222222-2222-2222-2222-222222222222/b1.jpg'])$$, '22023', 'Chemin de photo non autorisé', 'chemin d''un autre utilisateur refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['p5.jpg'])$$, '22023', 'Chemin de photo non autorisé', 'chemin sans dossier refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.gif'])$$, '22023', 'Chemin de photo invalide', 'extension invalide refusée');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/../22222222-2222-2222-2222-222222222222/b1.jpg'])$$, '22023', 'Chemin de photo invalide', 'path traversal refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/absent.jpg'])$$, '23503', 'Une photo n''a pas été envoyée : réessaie l''envoi', 'fichier absent de Storage refusé');

-- ======================= atomicité : erreur sur la 2e photo
select tests.act_admin();
create temp table tests_before as
  select (select count(*) from public.listings) as l, (select count(*) from public.listing_photos) as p;
grant select on tests_before to public;
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg','11111111-1111-1111-1111-111111111111/absent.jpg'])$$, '23503', null, '2e photo absente de Storage : refus');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg','11111111-1111-1111-1111-111111111111/p1.jpg'])$$, '23505', 'Une de ces photos est déjà utilisée par une annonce', '2e photo déjà utilisée : refus à l''insert des photos, après celui de l''annonce');
select tests.act_admin();
select results_eq($$select (select count(*) from public.listings), (select count(*) from public.listing_photos)$$, $$select l, p from tests_before$$, 'les échecs ne laissent ni annonce ni photo');
select tests.act_as('11111111-1111-1111-1111-111111111111');

-- ======================= activité / ville inexistantes, valeurs invalides
select throws_ok($$select public.create_listing(gen_random_uuid(), 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$$, '23503', 'Activité introuvable', 'activité inexistante');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', gen_random_uuid(), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$$, '23503', 'Ville introuvable', 'ville inexistante');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', null, tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$$, '22023', 'Le type d''annonce est obligatoire', 'type null refusé');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'], repeat('a', 2001))$$, '22023', 'La description et l''expérience sont limitées à 2000 caractères', 'description trop longue refusée');

-- ======================= usurpation d'owner_id
select throws_ok($$insert into public.listings (owner_id, activity_id, kind, city_id) values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'))$$, '42501', null, 'insert direct avec le owner_id d''un autre refusé (aucun grant INSERT sur listings)');
select tests.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('69123'), array['22222222-2222-2222-2222-222222222222/b1.jpg'])::text, true)$$, 'bob publie');
select is((select owner_id from public.listings where id = current_setting('tests.l')::uuid), '22222222-2222-2222-2222-222222222222'::uuid, 'propriétaire = bob, l''appelant');

-- ======================= publication uniquement via la RPC, fonction definer durcie
select throws_ok($$insert into public.listings (activity_id, kind, city_id) values ('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'))$$, '42501', null, 'insert direct sans owner_id refusé aussi');
select tests.act_admin();
select is(has_any_column_privilege('authenticated', 'public.listings', 'insert') or has_any_column_privilege('anon', 'public.listings', 'insert'), false, 'authenticated et anon n''ont plus aucun privilège INSERT (table ou colonne) sur listings');
select results_eq($$select prosecdef, 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.create_listing(uuid, public.listing_kind, uuid, text[], text, text)'::regprocedure$$, $$values (true, true)$$, 'create_listing : security definer, search_path vide');
-- fichier au bon préfixe mais appartenant à bob : refusé
insert into storage.objects (bucket_id, name, owner, owner_id) values ('listing-photos', '11111111-1111-1111-1111-111111111111/x1.jpg', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/x1.jpg'])$$, '23503', 'Une photo n''a pas été envoyée : réessaie l''envoi', 'fichier du bon dossier mais d''un autre owner_id refusé');

-- ======================= nettoyage multiligne
select tests.act_admin();
select is(private.clean_multiline_text(E'a\r\nb\rc'), E'a\nb\nc', '\r\n et \r normalisés en \n');
select is(private.clean_multiline_text(E'  a   b  \n  c\t\td \n'), E'a b\nc d', 'espaces compactés, lignes trimées');
select is(private.clean_multiline_text(E'a\n\n\n\n\n\nb'), E'a\n\n\nb', '2 lignes vides consécutives au plus');
select is(private.clean_multiline_text(E'a \n \n b'), E'a\n\nb', 'ligne d''espaces = ligne vide, lignes trimées');
select is(private.clean_multiline_text(E'a\u200Bb\u0001c\u202Ed\u00A0e'), 'abcd e', 'invisibles et contrôles retirés, espace insécable ramené à l''espace');
select is(private.clean_multiline_text(E'  \n \n '), null, 'chaîne de blancs -> null');
select is(private.clean_multiline_text(null), null, 'null -> null');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'], E'Ligne 1\r\n\r\n  Ligne 2  ', E'\n')::text, true)$$, 'publication avec description multiligne');
select results_eq($$select description, experience from public.listings where id = current_setting('tests.l')::uuid$$, $$values (E'Ligne 1\n\nLigne 2', null::text)$$, 'retours à la ligne conservés, expérience vide -> null');

-- ======================= clés d'erreur stables (SQLSTATE/hint)
select tests.act_as(null);
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '42501/auth_required', 'connexion requise : auth_required');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', null, tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '22023/kind_required', 'type null');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array[]::text[])$e$), '22023/photos_count', '0 photo');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg', null])$e$), '22023/photo_path_missing', 'chemin null');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg','11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '22023/photo_duplicate', 'doublon');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['22222222-2222-2222-2222-222222222222/b1.jpg'])$e$), '22023/photo_path_forbidden', 'dossier dun autre');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.gif'])$e$), '22023/photo_path_invalid', 'extension invalide');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.JPG'])$e$), '22023/photo_path_invalid', 'extension en majuscules refusée');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'], repeat('a', 2001))$e$), '22023/text_too_long', 'description > 2000 après nettoyage (CHECK mappé)');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'], null, repeat('a', 2001))$e$), '22023/text_too_long', 'experience > 2000 après nettoyage (CHECK mappé)');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'], repeat(' ', 20001))$e$), '22023/text_too_long', 'garde-fou de longueur brute (> 20000 octets)');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/ghost.jpg'])$e$), '23503/photo_missing', 'fichier absent de Storage');
select is(tests.err($e$select public.create_listing(gen_random_uuid(), 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '23503/activity_not_found', 'activité inexistante');
select is(tests.err($e$select public.create_listing(null, 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '23503/activity_not_found', 'activité null');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', gen_random_uuid(), array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '23503/city_not_found', 'ville inexistante');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', null, array['11111111-1111-1111-1111-111111111111/p5.jpg'])$e$), '23503/city_not_found', 'ville null');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/p5.jpg','11111111-1111-1111-1111-111111111111/p1.jpg'])$e$), '23505/photo_in_use', 'photo déjà utilisée');
select tests.act_admin();
insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
insert into storage.objects (bucket_id, name, owner, owner_id) values ('other-bucket', '11111111-1111-1111-1111-111111111111/other.jpg', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/other.jpg'])$e$), '23503/photo_missing', 'même nom de fichier dans un autre bucket refusé');

-- ======================= texte : nettoyage, longueur brute vs nettoyée, U+2028, modification
select lives_ok($$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/clean.jpg'], 'a' || repeat(' ', 3000) || 'b', null)::text, true)$$, 'texte brut > 2000 caractères mais <= 2000 après nettoyage : accepté');
select is((select description from public.listings where id = current_setting('tests.l')::uuid), 'a b', 'texte compacté');
select tests.act_admin();
select is(private.clean_multiline_text(E'a\u2028b\u2029c'), E'a\nb\nc', 'U+2028 et U+2029 deviennent \n');
select is(private.clean_multiline_text(E'a\u061Cb\u180Ec\u2061d\U000E0041e'), 'abcde', 'clean_multiline_text retire U+061C, U+180E, U+2061, tags');
select is(public.clean_text(E'a\u061Cb\u180Ec\u2061d\U000E0041e  f'), 'abcde f', 'clean_text retire aussi les nouveaux invisibles');
select tests.act_as('11111111-1111-1111-1111-111111111111');
select results_eq($$update public.listings set description = E'  x\u202E\u200By\r\n\r\n\r\n\r\n\r\nz  ', experience = E'\u2028' where id = 'b0000000-0000-0000-0000-000000000001' returning description, experience$$, $$values (E'xy\n\n\nz', null::text)$$, 'UPDATE de description/experience : nettoyé par trigger (bidi, ZWSP, CRLF)');


-- ======================= invariants photos garantis par la base
select lives_ok($$select tests.exec_checked($q$select set_config('tests.l', public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/m1.jpg', '11111111-1111-1111-1111-111111111111/m2.jpg'])::text, true)$q$)$$, 'RPC : annonce puis photos, contraintes différées vérifiées à la fin');
select lives_ok($$select tests.exec_checked($q$delete from public.listing_photos where listing_id = current_setting('tests.l')::uuid and position = 1$q$)$$, 'supprimer une photo quand il en reste une autre : accepté');

select is(tests.err($e$delete from public.listing_photos where listing_id = current_setting('tests.l')::uuid$e$, true), '23514/listing_photo_required', 'supprimer la dernière photo dune annonce disponible : refusé');
select is(tests.err($e$insert into public.listing_photos (listing_id, storage_path, position) values (current_setting('tests.l')::uuid, '11111111-1111-1111-1111-111111111111/ghost.jpg', 3)$e$), '23503/photo_missing', 'ajouter une photo avec un chemin fantôme : refusé');
select is(tests.err($e$update public.listing_photos set storage_path = '11111111-1111-1111-1111-111111111111/ghost.jpg' where listing_id = current_setting('tests.l')::uuid$e$), '23503/photo_missing', 'UPDATE de storage_path vers un fantôme : refusé');
select tests.act_admin();
delete from public.listing_photos where listing_id = 'b0000000-0000-0000-0000-000000000002';
update public.listings set status = 'archivee' where id = 'b0000000-0000-0000-0000-000000000002';

select is(tests.err($e$update public.listings set status = 'disponible' where id = 'b0000000-0000-0000-0000-000000000002'$e$, true), '23514/listing_photo_required', 'annonce sans photo : archivee -> disponible refusé');
select lives_ok($$select tests.exec_checked($q$delete from public.listings where id = 'b0000000-0000-0000-0000-000000000003'$q$)$$, 'suppression d''une annonce par cascade : photos supprimées sans contrôle');


-- ======================= plafond de 20 annonces par jour (PT429)
select tests.act_admin();
insert into public.listings (owner_id, activity_id, kind, city_id)
  select '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056')
  from generate_series(1, 18 - (select count(*) from public.listings where owner_id = '11111111-1111-1111-1111-111111111111' and created_at > now() - interval '1 day'));
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/cap1.jpg'])$$, 'la 19e annonce du jour passe');
select lives_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/cap2.jpg'])$$, 'la 20e annonce du jour passe');
select throws_ok($$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/cap3.jpg'])$$, 'PT429', 'Limite de 20 nouvelles annonces par jour atteinte', 'la 21e annonce du jour est refusée');
select is(tests.err($e$select public.create_listing('a0000000-0000-0000-0000-000000000001', 'don', tests.city('75056'), array['11111111-1111-1111-1111-111111111111/cap3.jpg'])$e$), 'PT429/listing_rate_limit', 'plafond : hint listing_rate_limit');
select tests.act_admin();
select lives_ok($$select tests.exec_checked($q$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$q$)$$, 'suppression de compte (archivage, purge des photos) : contraintes différées satisfaites');
select is((select count(*) from public.listings where owner_id is null and status <> 'archivee'), 0::bigint, 'aucune annonce orpheline non archivée');

select * from finish();
rollback;
