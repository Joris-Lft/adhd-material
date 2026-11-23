import { useEffect, useMemo } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { PwaUpdateContext } from "@/features/pwa/pwa-update-context";

/**
 * Seul point d'inscription du service worker. Propose la mise à jour via un toast (jamais de
 * rechargement automatique : formulaire en cours) et la partage avec le profil (bouton « Recharger »).
 */
export function PwaUpdatePrompt({ children }: { children: React.ReactNode }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast("Nouvelle version disponible", {
      duration: Infinity,
      action: { label: "Recharger", onClick: () => void updateServiceWorker(true) },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, updateServiceWorker]);

  const value = useMemo(
    () => ({ needRefresh, updateServiceWorker }),
    [needRefresh, updateServiceWorker],
  );
  return <PwaUpdateContext value={value}>{children}</PwaUpdateContext>;
}
