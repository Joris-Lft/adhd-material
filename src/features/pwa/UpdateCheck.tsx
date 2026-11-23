import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { usePwaUpdate } from "@/features/pwa/pwa-update-context";
import { useOnline } from "@/hooks/useOnline";

const MESSAGES = {
  latest: "Tu as la dernière version.",
  downloading:
    "Une nouvelle version se télécharge : le bouton « Recharger » apparaîtra quand elle sera prête.",
  ready: "La nouvelle version se prépare, encore un instant.",
  failed: "La vérification a échoué. Vérifie ta connexion et réessaie.",
} as const;

const READY_MESSAGE = "Une nouvelle version est prête.";

type Result = keyof typeof MESSAGES;

async function checkForUpdate(registration: ServiceWorkerRegistration): Promise<Result> {
  try {
    await registration.update();
    if (registration.waiting) return "ready";
    if (registration.installing) return "downloading";
    return "latest";
  } catch {
    return "failed";
  }
}

/** « Vérifier les mises à jour » : cherche une nouvelle version et propose de la recharger. */
export function UpdateCheck() {
  const online = useOnline();
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Sans service worker (développement, navigateur sans support) il n'y a rien à vérifier : pas de bouton.
  // `ready` couvre le premier chargement (service worker enregistré après le montage) ; sans service
  // worker il ne se résout jamais, ce qui ne bloque rien.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    const found = (next: ServiceWorkerRegistration | undefined) => {
      if (active && next) setRegistration(next);
    };
    navigator.serviceWorker
      .getRegistration()
      .then(found)
      .catch(() => {});
    navigator.serviceWorker.ready?.then(found).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Le bouton est désactivé pendant la vérification : on lui rend le focus ensuite.
  useEffect(() => {
    if (!checking && result) button.current?.focus();
  }, [checking, result]);

  async function onClick() {
    if (!registration) return;
    if (!online) {
      setResult("failed");
      return;
    }
    setChecking(true);
    setResult(null);
    const next = await checkForUpdate(registration);
    setResult(next);
    setChecking(false);
  }

  if (!registration) return null;

  return (
    <div className="space-y-2">
      <LoadingButton
        ref={button}
        type="button"
        variant="outline"
        loading={checking}
        onClick={onClick}
      >
        <RefreshCw aria-hidden="true" />
        Vérifier les mises à jour
      </LoadingButton>
      <p role="status" className="text-sm">
        {needRefresh ? READY_MESSAGE : result ? MESSAGES[result] : null}
      </p>
      {needRefresh && (
        <Button type="button" onClick={() => void updateServiceWorker(true)}>
          Recharger
        </Button>
      )}
    </div>
  );
}
