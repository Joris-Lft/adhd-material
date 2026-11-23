import { useCallback } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { listingKeys } from "@/hooks/listing-keys";
import { updateListingStatus, type ListingStatus } from "@/services/listings";

/** Au-delà, le focus n'est plus rendu : la personne a eu le temps d'aller ailleurs. */
const FOCUS_TTL_MS = 5000;

interface PendingFocus {
  id: string;
  /** Statut d'avant l'action : le focus n'est rendu qu'une fois le nouveau statut affiché. */
  from: ListingStatus;
  /** Page d'où l'action est partie : après une navigation, on ne vole pas le focus. */
  path: string;
  at: number;
}

// Une attente de focus par QueryClient (pas d'état partagé entre applications ou tests).
const pendingFocus = new WeakMap<QueryClient, PendingFocus>();

export function resetActionFocus(queryClient: QueryClient) {
  pendingFocus.delete(queryClient);
}

/** Retourne une fonction « le focus est-il attendu sur les actions de cette annonce ? » (valable une seule fois). */
export function useTakeActionFocus() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  return useCallback(
    (listingId: string, status: ListingStatus) => {
      const pending = pendingFocus.get(queryClient);
      if (!pending) return false;
      if (Date.now() - pending.at > FOCUS_TTL_MS || pending.path !== pathname) {
        pendingFocus.delete(queryClient);
        return false;
      }
      if (pending.id !== listingId || pending.from === status) return false;
      pendingFocus.delete(queryClient);
      return true;
    },
    [queryClient, pathname],
  );
}

interface StatusChange {
  id: string;
  /** Statut actuel (avant l'action). */
  from: ListingStatus;
  status: ListingStatus;
  successMessage: string;
}

/** Changement de statut ; invalide listes, fiche et « Mes annonces » avant de rendre la main. */
export function useUpdateListingStatus() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: ({ id, status }: StatusChange) => updateListingStatus(id, status),
    onMutate: ({ id, from }) => {
      pendingFocus.set(queryClient, { id, from, path: pathname, at: Date.now() });
    },
    // Callbacks du hook (et non de `mutate`) : ils survivent au démontage de la carte déplacée.
    onSuccess: (_data, { successMessage }) => {
      toast.success(successMessage);
      return queryClient.invalidateQueries({ queryKey: listingKeys.all });
    },
    onError: () => resetActionFocus(queryClient),
  });
}
