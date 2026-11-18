import { Navigate, useLocation, useNavigate } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { ProfileUnavailable } from "@/components/layout/ProfileUnavailable";
import { DisplayNameForm } from "@/features/profile/DisplayNameForm";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMyProfile } from "@/hooks/useMyProfile";
import { clearNextPath, resolveNextPath } from "@/lib/next-path";

export function WelcomePage() {
  useDocumentTitle("Bienvenue");
  const navigate = useNavigate();
  const { search } = useLocation();
  const { data: profile, isPending, isError, refetch, isFetching } = useMyProfile();

  if (profile?.display_name_confirmed) return <Navigate to={resolveNextPath(search)} replace />;

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">Bienvenue !</h1>
      {isPending && <PageLoader />}
      {!isPending && !profile && (
        <ProfileUnavailable missing={!isError} onRetry={() => refetch()} retrying={isFetching} />
      )}
      {profile && (
        <>
          <p className="text-muted-foreground">
            Tu peux garder <strong className="text-foreground">{profile.display_name}</strong> ou en
            choisir un autre. On ne montre jamais ton vrai nom aux autres membres.
          </p>
          <DisplayNameForm
            initialValue={profile.display_name}
            submitLabel="C'est parti"
            onSaved={() => {
              const target = resolveNextPath(search);
              clearNextPath();
              navigate(target, { replace: true });
            }}
          />
        </>
      )}
    </section>
  );
}
