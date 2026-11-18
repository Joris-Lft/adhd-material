// Intention de suppression de compte : enregistrée avant d'envoyer un code ou de partir chez Google,
// pour ne reprendre la confirmation qu'au retour du MÊME utilisateur (jamais sur un simple paramètre d'URL).
// localStorage (et non sessionStorage) : le lien de l'email peut s'ouvrir dans un autre onglet.
const STORAGE_KEY = "adhd-material:suppression";
const TTL_MS = 10 * 60 * 1000;

export function rememberDeleteIntent(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, at: Date.now() }));
  } catch {
    // stockage indisponible : la ré-authentification inline reste possible.
  }
}

export function clearDeleteIntent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire
  }
}

/** Vrai si une intention récente existe pour cet utilisateur. */
export function hasDeleteIntent(userId: string | undefined, nowMs: number = Date.now()): boolean {
  if (!userId) return false;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const { userId: storedId, at } = (parsed ?? {}) as { userId?: unknown; at?: unknown };
    return storedId === userId && typeof at === "number" && nowMs - at <= TTL_MS;
  } catch {
    return false;
  }
}
