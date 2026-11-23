import { createContext, useContext } from "react";

export interface PwaUpdate {
  /** Une nouvelle version est installée et attend le rechargement. */
  needRefresh: boolean;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
}

/** Une seule inscription du service worker (PwaUpdatePrompt) : les autres composants la lisent ici. */
export const PwaUpdateContext = createContext<PwaUpdate>({
  needRefresh: false,
  updateServiceWorker: async () => {},
});

export const usePwaUpdate = () => useContext(PwaUpdateContext);
