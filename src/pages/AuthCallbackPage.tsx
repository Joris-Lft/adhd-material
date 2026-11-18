import { Link, useLocation } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { PostLoginRedirect } from "@/features/auth/PostLoginRedirect";
import { useSession } from "@/features/auth/useSession";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/** Retour de Google : supabase-js échange le ?code= (PKCE) pendant l'initialisation de la session. */
export function AuthCallbackPage() {
  useDocumentTitle("Connexion en cours");
  const { search } = useLocation();
  const { session, loading } = useSession();
  const failed = new URLSearchParams(search).has("error");

  if (!failed && loading) {
    return (
      <section>
        <h1 className="sr-only">Connexion en cours</h1>
        <PageLoader label="Connexion en cours…" />
      </section>
    );
  }
  if (!failed && session) return <PostLoginRedirect search="" />;

  const cancelled = new URLSearchParams(search).get("error") === "access_denied";
  return (
    <section className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-2xl font-bold">
        {cancelled ? "Connexion annulée" : "La connexion n'a pas abouti"}
      </h1>
      <p className="text-muted-foreground">
        {cancelled
          ? "Pas de souci, tu peux réessayer quand tu veux."
          : "Ce n'est pas ta faute. Réessaie, ou choisis la connexion par email."}
      </p>
      <Button asChild>
        <Link to="/connexion">Retour à la connexion</Link>
      </Button>
    </section>
  );
}
