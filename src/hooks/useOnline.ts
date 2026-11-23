import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Faux quand le navigateur se sait hors connexion (l'inverse ne garantit pas que le serveur répond). */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
