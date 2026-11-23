import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { useStartConversation } from "@/hooks/useStartConversation";
import { GENERIC_ERROR } from "@/lib/messages";
import { MessagingError } from "@/services/conversations";

/** « Contacter <pseudo> » : ouvre la conversation avec l'auteur de l'annonce (réutilise celle qui existe). */
export function ContactButton({
  listingId,
  ownerName,
}: {
  listingId: string;
  ownerName: string | null;
}) {
  const start = useStartConversation();
  const button = useRef<HTMLButtonElement>(null);
  // Le bouton est désactivé pendant l'envoi : en cas d'échec, le focus lui est rendu.
  const failed = start.isError;
  useEffect(() => {
    if (failed) button.current?.focus();
  }, [failed]);
  return (
    <div className="space-y-2">
      <LoadingButton
        ref={button}
        type="button"
        loading={start.isPending}
        onClick={() => start.mutate(listingId)}
      >
        <MessageCircle aria-hidden="true" />
        {ownerName ? `Contacter ${ownerName}` : "Contacter"}
      </LoadingButton>
      {start.isError && (
        <p role="alert" className="text-sm text-destructive">
          {start.error instanceof MessagingError ? start.error.message : GENERIC_ERROR}
        </p>
      )}
    </div>
  );
}
