const STORAGE_KEY = "adhd-material:suivant";
// Courte durée de vie : la page mémorisée doit survivre à l'ouverture du lien de l'email
// dans un autre onglet (localStorage), sans rester indéfiniment.
const TTL_MS = 15 * 60 * 1000;
const BASE = "http://localhost";
// Pages d'authentification : y renvoyer l'utilisateur après connexion créerait une boucle.
const FORBIDDEN_PREFIXES = ["/connexion", "/bienvenue", "/auth/"];

function hasDotSegment(pathname: string): boolean {
  return pathname.split("/").some((segment) => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return true; // encodage invalide : on refuse
    }
    return decoded === "." || decoded === "..";
  });
}

/** Renvoie un chemin interne sûr (chemin + query + hash), ou null. Refuse URL absolues, `//`, `\` et segments `.`/`..`. */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  // Les segments `.`/`..` sont cherchés dans le chemin brut : URL() les normaliserait et les ferait disparaître.
  if (url.origin !== BASE || hasDotSegment(raw.split(/[?#]/)[0] ?? raw)) return null;
  if (
    FORBIDDEN_PREFIXES.some(
      (p) => url.pathname === p.replace(/\/$/, "") || url.pathname.startsWith(p),
    )
  ) {
    return null;
  }
  const result = url.pathname + url.search + url.hash;
  // Validation de la sortie : jamais `//` ni `/\` en tête (URL relative au protocole).
  if (!result.startsWith("/") || result.startsWith("//") || result.startsWith("/\\")) return null;
  return result;
}

export function rememberNextPath(path: string): void {
  const safe = sanitizeNextPath(path);
  try {
    if (safe) localStorage.setItem(STORAGE_KEY, JSON.stringify({ path: safe, at: Date.now() }));
  } catch {
    // stockage indisponible : on se rabat sur ?suivant=.
  }
}

export function clearNextPath(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire
  }
}

function readStoredPath(): string | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const { path, at } = (parsed ?? {}) as { path?: unknown; at?: unknown };
    if (typeof path !== "string" || typeof at !== "number" || Date.now() - at > TTL_MS) return null;
    return sanitizeNextPath(path);
  } catch {
    return null;
  }
}

/** Page à rejoindre après connexion : `?suivant=` d'abord, puis stockage (15 min), sinon l'accueil. */
export function resolveNextPath(search: string): string {
  return sanitizeNextPath(new URLSearchParams(search).get("suivant")) ?? readStoredPath() ?? "/";
}

export function buildLoginUrl(path: string): string {
  const safe = sanitizeNextPath(path);
  return safe ? `/connexion?suivant=${encodeURIComponent(safe)}` : "/connexion";
}

export function buildWelcomeUrl(path: string): string {
  const safe = sanitizeNextPath(path);
  return safe ? `/bienvenue?suivant=${encodeURIComponent(safe)}` : "/bienvenue";
}
