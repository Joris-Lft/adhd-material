import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { PostLoginRedirect } from "@/features/auth/PostLoginRedirect";
import { useSession } from "@/features/auth/useSession";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { isEmailAuthEnabled } from "@/lib/features";
import { AuthMessageError, verifyTokenHash } from "@/services/auth";

export const CODE_WAIT_MS = 6000;

type Status = "pending" | "success" | "expired" | "network";

/** Lien de l'email : /auth/confirmation?token_hash=…&type=email (indépendant du code_verifier PKCE). */
export function AuthConfirmationPage() {
  useDocumentTitle("Confirmation");
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const hasValidParams = !!tokenHash && params.get("type") === "email";
  const { session } = useSession();
  // Lien PKCE du modèle par défaut (?code=) : supabase-js l'échange tout seul (detectSessionInUrl).
  const hasCode = !hasValidParams && params.has("code");
  const [codeTimedOut, setCodeTimedOut] = useState(false);
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("pending");

  const verify = useCallback((hash: string) => {
    setStatus("pending");
    verifyTokenHash(hash).then(
      () => setStatus("success"),
      (error) =>
        setStatus(error instanceof AuthMessageError && error.retryable ? "network" : "expired"),
    );
  }, []);

  useEffect(() => {
    // Le jeton est à usage unique : garde contre le double effet de StrictMode.
    if (!hasValidParams || started.current) return;
    started.current = true;
    // On conserve le state de l'historique (clés de react-router) en retirant juste le jeton de l'URL.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    verify(tokenHash);
  }, [hasValidParams, tokenHash, verify]);

  useEffect(() => {
    if (!hasCode) return;
    const timer = setTimeout(() => setCodeTimedOut(true), CODE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [hasCode]);

  if (hasCode) {
    if (session) return <PostLoginRedirect search="" />;
    if (!codeTimedOut) {
      return (
        <section>
          <h1 className="sr-only">Confirmation en cours</h1>
          <PageLoader label="On te connecte…" />
        </section>
      );
    }
  }

  // On attend que la session soit visible dans le contexte avant de rediriger.
  if (status === "success" && session) return <PostLoginRedirect search="" />;

  if (hasValidParams && (status === "pending" || status === "success")) {
    return (
      <section>
        <h1 className="sr-only">Confirmation en cours</h1>
        <PageLoader label="On te connecte…" />
      </section>
    );
  }

  if (hasValidParams && status === "network") {
    return (
      <section className="mx-auto max-w-sm space-y-4 py-8">
        <h1 className="text-2xl font-bold">Pas de connexion pour l'instant</h1>
        <p className="text-muted-foreground">Ton lien est toujours valable. Vérifie ton réseau.</p>
        <Button onClick={() => verify(tokenHash)}>Réessayer</Button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-2xl font-bold">Ce lien ne fonctionne plus</h1>
      <p className="text-muted-foreground">
        {isEmailAuthEnabled()
          ? "Il a peut-être expiré ou déjà servi. Demande un nouveau code, ça prend 10 secondes."
          : "Il a peut-être expiré ou déjà servi. Reconnecte-toi avec Google, ça prend 10 secondes."}
      </p>
      <Button asChild>
        <Link to="/connexion">
          {isEmailAuthEnabled() ? "Recevoir un nouveau code" : "Me reconnecter"}
        </Link>
      </Button>
    </section>
  );
}
