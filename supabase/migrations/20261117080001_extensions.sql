-- Extensions, schéma privé, privilèges par défaut et utilitaires de normalisation.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Moindre privilège : les futurs objets du schéma public n'accordent rien à anon/authenticated
-- (Supabase accorde ALL par défaut). Chaque table/fonction exposée doit être accordée explicitement.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- (PUBLIC reçoit EXECUTE par défaut sur les fonctions : seul un REVOKE global l'enlève, un REVOKE
-- limité à un schéma ne retire rien à ce défaut implicite.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Schéma non exposé par l'API : fonctions de trigger internes et helper de policy.
-- Aucune fonction n'y est exécutable par défaut ; seule shares_conversation_with() est accordée (cf. migration rls).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Nettoyage d'un texte saisi : caractères invisibles/bidi retirés, espaces Unicode ramenés à
-- l'espace ASCII, espaces compactés, trim.
create or replace function public.clean_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(t,
        '['
        '\u00AD'          -- trait d''union conditionnel (soft hyphen)
        '\u200B-\u200D'    -- espaces de largeur nulle, ZWNJ, ZWJ
        '\u200E\u200F'     -- marques directionnelles LRM/RLM
        '\u202A-\u202E'    -- contrôles bidi (embedding/override)
        '\u2060'          -- word joiner
        '\u2066-\u2069'    -- isolats bidi
        '\uFEFF'          -- BOM / espace insécable de largeur nulle
        ']', '', 'g'),
      '['
      '\u00A0'            -- espace insécable
      '\u1680'            -- espace ogham
      '\u2000-\u200A'      -- espaces typographiques (en, em, fine...)
      '\u202F'            -- espace fine insécable
      '\u205F'            -- espace mathématique moyenne
      '\u3000'            -- espace idéographique
      ']', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- Clé de dédoublonnage : nettoyage + unaccent + minuscules, sans ponctuation/espace de début ou de fin.
-- unaccent() n'est pas IMMUTABLE : le dictionnaire explicite permet de l'utiliser dans une colonne générée.
create or replace function public.normalize_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, public.clean_text(t))),
    '^[[:punct:][:space:]]+|[[:punct:][:space:]]+$', '', 'g');
$$;

-- Variante pour les noms de lieux : tirets et apostrophes deviennent des espaces
-- (« Saint-Étienne » = « saint etienne »).
create or replace function public.normalize_place(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(public.normalize_text(t), '[-''’]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

grant execute on function public.clean_text(text), public.normalize_text(text), public.normalize_place(text)
  to anon, authenticated;

-- Trigger générique de mise à jour de updated_at.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
