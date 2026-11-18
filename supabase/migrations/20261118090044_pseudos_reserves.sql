-- Pseudos : les mots réservés sont désormais recherchés en contenu (mot entier, forme normalisée :
-- « Admin ADHD », « L'équipe », « adhd_material » sont refusés ; « Cadmium » ou « Supportive » non),
-- et tout pseudo choisi dont la forme normalisée commence par « membre » (avec ou sans séparateur)
-- est refusé : ce préfixe est réservé aux pseudos générés (INSERT du trigger d'inscription).
-- Les contrôles ne s'appliquent que si le pseudo change (un pseudo devenu interdit n'empêche pas
-- d'enregistrer le reste du profil). « _ » et chiffres comptent comme séparateurs (Admin_ADHD, Admin2) ;
-- le leetspeak (adm1n) n'est pas détecté : le signalement couvre ce cas.
-- Même erreur qu'avant : 23514 « Ce pseudo n'est pas disponible ».
create or replace function private.clean_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_norm text;
  v_words text;
begin
  new.display_name := public.clean_text(new.display_name);
  if tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name then
    return new;
  end if;
  v_norm := public.normalize_text(new.display_name);
  -- \m / \M : début / fin de mot ; « _ » et chiffres (mots pour \m) deviennent des espaces
  v_words := regexp_replace(v_norm, '[_0-9]', ' ', 'g');
  if v_words ~ ('\m(admin(istrat(eur|rice|ion))?s?|moderat(eur|rice|ion)s?|modo|support|equipes?|staff'
                || '|adhd[^a-z]*material|systemes?|system|anonyme)\M') then
    raise exception 'Ce pseudo n''est pas disponible' using errcode = '23514';
  end if;
  if v_norm ~ '^membre' and tg_op = 'UPDATE' then
    raise exception 'Ce pseudo n''est pas disponible' using errcode = '23514';
  end if;
  return new;
end;
$$;
