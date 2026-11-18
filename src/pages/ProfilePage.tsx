import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageLoader } from "@/components/layout/PageLoader";
import { ProfileUnavailable } from "@/components/layout/ProfileUnavailable";
import { LoadingButton } from "@/components/ui/loading-button";
import { DeleteAccountSection } from "@/features/profile/DeleteAccountSection";
import { DisplayNameForm } from "@/features/profile/DisplayNameForm";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMyProfile } from "@/hooks/useMyProfile";
import { AuthMessageError, signOut } from "@/services/auth";

export function ProfilePage() {
  useDocumentTitle("Mon profil");
  const { data: profile, isPending, isError, refetch, isFetching } = useMyProfile();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      // On quitte la page protégée avant de purger la session, sinon RequireAuth redirigerait vers /connexion.
      await navigate("/", { replace: true });
      await signOut();
    } catch (error) {
      toast.error(error instanceof AuthMessageError ? error.message : "La déconnexion a échoué.");
      setSigningOut(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm space-y-8">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      {isPending && <PageLoader />}
      {!isPending && !profile && (
        <ProfileUnavailable missing={!isError} onRetry={() => refetch()} retrying={isFetching} />
      )}
      {profile && (
        <DisplayNameForm
          // Le pseudo enregistré redevient la valeur de départ après une sauvegarde.
          key={profile.display_name}
          initialValue={profile.display_name}
          submitLabel="Enregistrer"
          requireChange
          onSaved={() => toast.success("Pseudo enregistré")}
        />
      )}
      <LoadingButton type="button" variant="outline" loading={signingOut} onClick={onSignOut}>
        Se déconnecter
      </LoadingButton>
      <DeleteAccountSection />
    </section>
  );
}
