import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

/** Bandeau hors connexion. La zone `status` reste montée : le texte qui y apparaît est annoncé. */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status" data-slot="offline-banner">
      {!online && (
        <p className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-center text-sm">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          Tu es hors connexion : les annonces et messages ne se mettent plus à jour. Ça reprendra
          tout seul au retour du réseau.
        </p>
      )}
    </div>
  );
}
