import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { conversationKeys, invalidateInbox } from "@/hooks/conversation-keys";
import { listingKeys } from "@/hooks/listing-keys";
import { MessagingError, returnLoan, startLoan, type Conversation } from "@/services/conversations";

/** Le statut de l'annonce change avec le prêt : conversation, liste, annonces. */
function useRefreshAfterLoan(conversationId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) }),
      invalidateInbox(queryClient),
      queryClient.invalidateQueries({ queryKey: listingKeys.all }),
    ]);
}

/** Erreur sans clé du serveur (réseau, passerelle) : l'action a pu aboutir malgré tout. */
function isUncertain(error: unknown) {
  return !(error instanceof MessagingError && error.hint);
}

function currentLoanId(queryClient: QueryClient, conversationId: string) {
  return (
    queryClient.getQueryData<Conversation | null>(conversationKeys.detail(conversationId))
      ?.loanId ?? null
  );
}

export function useStartLoan(conversationId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterLoan(conversationId);
  return useMutation({
    mutationFn: (dueAt: string | null) => startLoan(conversationId, dueAt),
    onSuccess: () => {
      toast.success("Prêt enregistré");
      return refresh();
    },
    // L'état a pu changer côté serveur (déjà prêté, annonce retirée, prêt créé malgré une coupure réseau) :
    // on relit l'en-tête, et on le dit si le prêt existe bel et bien.
    onError: async (error) => {
      await refresh();
      if (isUncertain(error) && currentLoanId(queryClient, conversationId)) {
        toast.success("Le prêt est bien enregistré");
      }
    },
  });
}

export function useReturnLoan(conversationId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterLoan(conversationId);
  return useMutation({
    mutationFn: (loanId: string) => returnLoan(loanId),
    onSuccess: () => {
      toast.success("Matériel marqué comme rendu");
      return refresh();
    },
    onError: async (error) => {
      await refresh();
      // Rendu malgré l'erreur réseau : même confirmation que pour le prêt. Une erreur avec clé
      // (loan_not_found…) reste affichée telle quelle.
      if (isUncertain(error) && !currentLoanId(queryClient, conversationId)) {
        toast.success("Matériel marqué comme rendu");
      }
    },
  });
}
