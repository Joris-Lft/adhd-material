import { Navigate } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { useMyProfile } from "@/hooks/useMyProfile";
import { buildWelcomeUrl, resolveNextPath } from "@/lib/next-path";

/** Après connexion : /bienvenue d'abord si le pseudo n'est pas confirmé, sinon la page demandée. */
export function PostLoginRedirect({ search }: { search: string }) {
  const { data: profile, isPending } = useMyProfile();
  if (isPending) return <PageLoader />;
  const next = resolveNextPath(search);
  if (profile && !profile.display_name_confirmed) {
    return <Navigate to={buildWelcomeUrl(next)} replace />;
  }
  return <Navigate to={next} replace />;
}
