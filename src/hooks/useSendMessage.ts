import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationKeys } from "@/hooks/conversation-keys";
import { insertMessage, refreshLatestMessages } from "@/hooks/refresh-messages";
import { MessagingError, sendMessage } from "@/services/conversations";

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, clientId }: { body: string; clientId: string }) =>
      sendMessage(conversationId, body, clientId),
    onSuccess: (message) => {
      // Message déjà enregistré par un envoi précédent (23505) : on relit la première page.
      if (message) insertMessage(queryClient, conversationId, message);
      else void refreshLatestMessages(queryClient, conversationId);
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list });
    },
    onError: (error) => {
      // Conversation fermée entre-temps (autre compte supprimé) : l'en-tête doit le refléter.
      if (error instanceof MessagingError && error.hint === "conversation_closed") {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
      }
    },
  });
}
