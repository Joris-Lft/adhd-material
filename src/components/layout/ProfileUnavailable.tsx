import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { signOut } from "@/services/auth";

interface ProfileUnavailableProps {
  /** Aucune ligne de profil (compte supprimé) : réessayer n'y changera rien. */
  missing: boolean;
  onRetry: () => void;
  retrying?: boolean;
}

export function ProfileUnavailable({ missing, onRetry, retrying }: ProfileUnavailableProps) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      // On quitte la page protégée avant de purger la session, sinon RequireAuth redirigerait vers /connexion.
      await navigate("/", { replace: true });
      await signOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La déconnexion a échoué.");
      setSigningOut(false);
    }
  }

  return (
    <div role="alert" className="space-y-3">
      <p>
        {missing
          ? "On ne retrouve pas ton profil. Ton compte a peut-être été supprimé."
          : "On n'arrive pas à charger ton profil."}
      </p>
      {missing ? (
        <LoadingButton type="button" loading={signingOut} onClick={onSignOut}>
          Se déconnecter
        </LoadingButton>
      ) : (
        <Button type="button" onClick={onRetry} disabled={retrying}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
