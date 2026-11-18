import { FunctionsHttpError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearDeleteIntent } from "@/lib/delete-intent";
import { clearNextPath } from "@/lib/next-path";
import { mapAuthError, mapVerifyError, SIGN_OUT_FAILED } from "@/lib/messages";

export class AuthMessageError extends Error {
  /** Erreur réseau : la même requête peut être rejouée. */
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}
export class ReauthRequiredError extends Error {}

const fail = (error: Parameters<typeof mapAuthError>[0], verify = false) =>
  new AuthMessageError(
    verify ? mapVerifyError(error) : mapAuthError(error),
    isAuthRetryableFetchError(error),
  );

export function authCallbackUrl(path: "/auth/confirmation" | "/auth/callback"): string {
  return `${window.location.origin}${path}`;
}

export async function sendEmailCode(email: string, shouldCreateUser = true): Promise<void> {
  // Le modèle d'email concatène `?token_hash=…` à emailRedirectTo : jamais de query string ici.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authCallbackUrl("/auth/confirmation"), shouldCreateUser },
  });
  if (error) throw fail(error);
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw fail(error, true);
}

export async function verifyTokenHash(tokenHash: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) throw fail(error, true);
}

export async function signInWithGoogle(queryParams?: Record<string, string>): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authCallbackUrl("/auth/callback"), ...(queryParams && { queryParams }) },
  });
  if (error) throw fail(error);
}

/** Déconnexion de cet appareil uniquement (n'invalide pas les autres sessions, fonctionne hors ligne). */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  clearNextPath();
  clearDeleteIntent();
  if (error) throw new AuthMessageError(SIGN_OUT_FAILED);
}

/** Supprime le compte. Lève ReauthRequiredError si l'authentification a plus de 10 minutes. */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean }>("delete-account", {
    method: "POST",
  });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context.status === 401) {
      const body: unknown = await error.context.json().catch(() => null);
      if ((body as { error?: string } | null)?.error === "reauth_required") {
        throw new ReauthRequiredError();
      }
    }
    throw error;
  }
  if (!data?.deleted) throw new Error("delete-account: réponse inattendue");
}
