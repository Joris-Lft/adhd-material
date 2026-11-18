/** Délai côté serveur (Edge Function delete-account) : authentification de moins de 10 minutes. */
export const REAUTH_WINDOW_SECONDS = 600;
/** Marge pour ne pas faire saisir une confirmation qui échouerait à l'envoi. */
const SAFETY_MARGIN_SECONDS = 60;

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Dernière authentification (secondes) d'après le claim `amr[].timestamp`, ou null. */
export function lastAuthTimestamp(token: string | null | undefined): number | null {
  const amr = decodeJwtPayload(token)?.amr;
  if (!Array.isArray(amr)) return null;
  const stamps = amr
    .map((entry) => (entry as { timestamp?: unknown } | null)?.timestamp)
    .filter((t): t is number => typeof t === "number");
  return stamps.length > 0 ? Math.max(...stamps) : null;
}

/** Vrai si l'authentification est absente, illisible ou trop ancienne pour supprimer le compte. */
export function needsReauth(token: string | null | undefined, nowMs: number = Date.now()): boolean {
  const last = lastAuthTimestamp(token);
  if (last === null) return true;
  return nowMs / 1000 - last > REAUTH_WINDOW_SECONDS - SAFETY_MARGIN_SECONDS;
}
