import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { conversationKeys } from "@/hooks/conversation-keys";
import { refreshLatestMessages } from "@/hooks/refresh-messages";
import { useBroadcastChannel, type ResyncInfo } from "@/hooks/useBroadcastChannel";
import { useOnTabVisible } from "@/hooks/useOnTabVisible";

const RECENT_SYNC_MS = 5000;
const CONVERSATION_EVENTS = ["message_created", "messages_read", "loan_changed"] as const;

/**
 * Canal `conversation:<id>`. À n'activer qu'une fois la conversation visible pour moi (get_conversation
 * renvoie une ligne) : avant le premier message du demandeur, le serveur refuse l'abonnement à l'auteur.
 * Chaque événement ne relit que ce qu'il change ; liste, badge et statut d'annonce relèvent de `user:<uid>`.
 */
export function useConversationRealtime(conversationId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const myId = useSession().session?.user.id;

  const onEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (event === "message_created" && payload.sender_id !== myId) {
        void refreshLatestMessages(queryClient, conversationId);
      } else if (event === "messages_read" && payload.reader_id !== myId) {
        // Seul `read_at` de mes messages change.
        void refreshLatestMessages(queryClient, conversationId);
      } else if (event === "loan_changed") {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
      }
    },
    [queryClient, conversationId, myId],
  );

  // Dernière relecture de rattrapage : évite de doubler une reconnexion par un retour d'onglet.
  const lastSync = useRef(0);
  const resync = useCallback(
    (headerSince: number | null) => {
      lastSync.current = Date.now();
      // Le fil est toujours relu (une requête légère) : une lecture terminée après le début de l'abonnement
      // peut dater d'avant des messages manqués. L'en-tête garde l'optimisation sur l'âge des données.
      void refreshLatestMessages(queryClient, conversationId);
      void queryClient.invalidateQueries({
        queryKey: conversationKeys.detail(conversationId),
        predicate: (query) => headerSince === null || query.state.dataUpdatedAt < headerSince,
      });
    },
    [queryClient, conversationId],
  );

  const onResync = useCallback(
    ({ reconnect, startedAt }: ResyncInfo) => resync(reconnect ? null : startedAt),
    [resync],
  );
  useOnTabVisible(() => {
    if (Date.now() - lastSync.current < RECENT_SYNC_MS) return;
    resync(null);
  }, enabled);

  useBroadcastChannel(
    enabled ? `conversation:${conversationId}` : null,
    CONVERSATION_EVENTS,
    onEvent,
    onResync,
  );
}
