// Miroir de clean_text / normalize_text (migration extensions) pour décider côté client si une saisie
// existe déjà ou peut être créée.
export const ACTIVITY_NAME_MIN = 2;
export const ACTIVITY_NAME_MAX = 60;

const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const EDGE_PUNCTUATION = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/** Caractères invisibles retirés, espaces Unicode et multiples réduits, trim. */
export function cleanActivityName(name: string): string {
  return name.replace(INVISIBLE, "").replace(UNICODE_SPACES, " ").replace(/\s+/g, " ").trim();
}

/** Clé de comparaison : sans casse, accents, ligatures ni ponctuation de bord. */
export function normalizeActivityName(name: string): string {
  return cleanActivityName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(EDGE_PUNCTUATION, "");
}

/** Nom acceptable par la base : 2 à 60 caractères nettoyés, et au moins 2 une fois normalisé. */
export function isCreatableActivityName(cleaned: string): boolean {
  const length = Array.from(cleaned).length;
  return (
    length >= ACTIVITY_NAME_MIN &&
    length <= ACTIVITY_NAME_MAX &&
    Array.from(normalizeActivityName(cleaned)).length >= ACTIVITY_NAME_MIN
  );
}
