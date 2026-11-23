import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { conversationKeys, invalidateInbox } from "@/hooks/conversation-keys";
import { markConversationRead } from "@/services/conversations";

/**
 * Marque la conversation comme lue à l'ouverture, puis à chaque nouveau message reçu,
 * mais seulement quand l'onglet est visible (sinon dès qu'il le redevient).
 * `latestIncomingId` : dernier message de l'autre personne (null s'il n'y en a pas).
 */
export function useMarkRead(
  conversationId: string,
  enabled: boolean,
  latestIncomingId: string | null,
) {
  const queryClient = useQueryClient();
  const markedKey = useRef<string | null>(null);
  const pendingKey = useRef<string | null>(null);

  const mark = useCallback(
    (key: string) => {
      if (markedKey.current === key) return;
      markedKey.current = key;
      pendingKey.current = null;
      markConversationRead(conversationId).then(
        () => {
          void invalidateInbox(queryClient);
          void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
        },
        () => {
          // Échec : réessai au prochain déclencheur (nouveau message, retour d'onglet).
          // (pas si une clé plus récente a été marquée entre-temps : on ne revient pas en arrière).
          if (markedKey.current === key) {
            markedKey.current = null;
            pendingKey.current = key;
          }
        },
      );
    },
    [conversationId, queryClient],
  );

  const key = `${conversationId}:${latestIncomingId ?? ""}`;
  useEffect(() => {
    if (!enabled) return;
    if (document.visibilityState === "visible") mark(key);
    else pendingKey.current = key;
  }, [enabled, key, mark]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingKey.current) mark(pendingKey.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, mark]);
}
