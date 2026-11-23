import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { conversationKeys, invalidateInbox } from "@/hooks/conversation-keys";
import { listingKeys } from "@/hooks/listing-keys";
import { useBroadcastChannel, type ResyncInfo } from "@/hooks/useBroadcastChannel";
import { useOnTabVisible } from "@/hooks/useOnTabVisible";

const RECENT_SYNC_MS = 5000;
const INBOX_EVENTS = ["inbox_changed"] as const;

/**
 * Un seul abonnement `user:<uid>` pour toute l'app : rafraîchit la liste, la pastille de non-lus
 * et l'en-tête de la conversation concernée (le fil relève de `conversation:<id>`).
 * Coupé à la déconnexion (plus de session).
 */
export function InboxRealtime() {
  const userId = useSession().session?.user.id;
  const queryClient = useQueryClient();

  const onEvent = useCallback(
    (_event: string, payload: Record<string, unknown>) => {
      void invalidateInbox(queryClient);
      if (typeof payload.conversation_id === "string") {
        void queryClient.invalidateQueries({
          queryKey: conversationKeys.detail(payload.conversation_id),
        });
      }
      // Un prêt change le statut de l'annonce.
      if (payload.reason === "loan") {
        void queryClient.invalidateQueries({ queryKey: listingKeys.all });
      }
    },
    [queryClient],
  );

  // Dernière relecture de rattrapage : évite de doubler une reconnexion par un retour d'onglet.
  const lastSync = useRef(0);
  const onResync = useCallback(
    (_info: ResyncInfo) => {
      // Liste et badge sont légers : toujours relus. Une lecture lancée avant l'abonnement mais
      // terminée après peut dater d'avant des événements manqués, donc pas de test sur l'âge.
      lastSync.current = Date.now();
      void invalidateInbox(queryClient);
    },
    [queryClient],
  );
  useOnTabVisible(() => {
    if (Date.now() - lastSync.current < RECENT_SYNC_MS) return;
    lastSync.current = Date.now();
    void invalidateInbox(queryClient);
  }, !!userId);

  useBroadcastChannel(userId ? `user:${userId}` : null, INBOX_EVENTS, onEvent, onResync);
  return null;
}
