import { useEffect } from "react";
import { Outlet, useLocation, Navigate } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { ProfileUnavailable } from "@/components/layout/ProfileUnavailable";
import { PostLoginRedirect } from "@/features/auth/PostLoginRedirect";
import { useSession } from "@/features/auth/useSession";
import { useMyProfile } from "@/hooks/useMyProfile";
import { buildLoginUrl, buildWelcomeUrl, clearNextPath, rememberNextPath } from "@/lib/next-path";

/** Routes protégées : sans session, renvoie vers /connexion en mémorisant la page demandée. */
export function RequireAuth() {
  const { session, loading } = useSession();
  const location = useLocation();
  const authenticated = !!session;
  const requested = location.pathname + location.search + location.hash;

  useEffect(() => {
    if (loading) return;
    // Visiteur : on garde la page demandée (survit à un lien d'email ouvert dans un autre onglet).
    // Connecté : arrivé sur une page protégée, la page mémorisée est « consommée ».
    if (authenticated) clearNextPath();
    else rememberNextPath(requested);
  }, [loading, authenticated, requested]);

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to={buildLoginUrl(requested)} replace />;
  return <Outlet />;
}

/** Onboarding : tant que le pseudo n'est pas confirmé, renvoie vers /bienvenue. */
export function RequireOnboarded() {
  const location = useLocation();
  const { data: profile, isPending, isError, refetch, isFetching } = useMyProfile();
  if (isPending) return <PageLoader />;
  // Un refetch en échec garde les données précédentes : on n'affiche l'erreur que sans profil.
  if (!profile) {
    return (
      <section className="space-y-4 py-12">
        <h1 className="text-2xl font-bold">Un petit souci</h1>
        <ProfileUnavailable missing={!isError} onRetry={() => refetch()} retrying={isFetching} />
      </section>
    );
  }
  if (!profile.display_name_confirmed) {
    return (
      <Navigate to={buildWelcomeUrl(location.pathname + location.search + location.hash)} replace />
    );
  }
  return <Outlet />;
}

/** /connexion : un utilisateur déjà connecté est renvoyé vers sa page demandée (ou /bienvenue). */
export function GuestOnly() {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (session) return <PostLoginRedirect search={location.search} />;
  return <Outlet />;
}
