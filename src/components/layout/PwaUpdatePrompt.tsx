import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/** Propose la mise à jour via un toast : jamais de rechargement automatique (formulaire en cours). */
export function PwaUpdatePrompt() {
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

  return null;
}
