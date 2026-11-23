import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { invalidateInbox } from "@/hooks/conversation-keys";
import { startConversation } from "@/services/conversations";

/** Ouvre (ou retrouve) la conversation avec l'auteur d'une annonce, puis y emmène. */
export function useStartConversation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (listingId: string) => startConversation(listingId),
    onSuccess: (conversationId) => {
      void invalidateInbox(queryClient);
      void navigate(`/messages/${conversationId}`);
    },
  });
}
