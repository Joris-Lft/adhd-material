import { useEffect, useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { AuthMessageError, signInWithGoogle } from "@/services/auth";

interface GoogleButtonProps {
  label?: string;
  /** Appelé juste avant la redirection vers Google (ex. mémoriser la page de retour). */
  beforeRedirect?: () => void;
  queryParams?: Record<string, string>;
}

export function GoogleButton({
  label = "Continuer avec Google",
  beforeRedirect,
  queryParams,
}: GoogleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Retour arrière depuis Google (cache bfcache) : la page revient avec son spinner figé.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      beforeRedirect?.();
      await signInWithGoogle(queryParams); // redirige vers Google : le spinner reste jusqu'au départ de la page
    } catch (e) {
      setError(e instanceof AuthMessageError ? e.message : "Connexion Google impossible.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <LoadingButton
        type="button"
        variant="outline"
        className="w-full"
        loading={loading}
        onClick={onClick}
      >
        {label}
      </LoadingButton>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
