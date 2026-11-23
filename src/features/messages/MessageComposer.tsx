import { useRef, useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { Textarea } from "@/components/ui/textarea";
import { useSendMessage } from "@/hooks/useSendMessage";
import { GENERIC_ERROR } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { randomId } from "@/lib/random-id";
import { MESSAGE_MAX_LENGTH, MessagingError } from "@/services/conversations";

/** Le compteur n'apparaît que près de la limite : pas de chiffre inutile le reste du temps. */
const COUNTER_FROM = 1800;

export function MessageComposer({
  conversationId,
  otherName,
}: {
  conversationId: string;
  otherName: string;
}) {
  const send = useSendMessage(conversationId);
  const [text, setText] = useState("");
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Garde contre un double envoi (Ctrl+Entrée répété) avant que React n'ait désactivé le bouton.
  const sending = useRef(false);
  // Identifiant du message composé : conservé pour « Réessayer » (pas de doublon si le premier envoi est
  // finalement passé), renouvelé dès que le texte envoyé diffère de celui du dernier essai, et après un succès.
  const draft = useRef<{ body: string; clientId: string } | null>(null);

  const body = text.trim();
  // Le serveur compte des caractères (points de code), pas des unités UTF-16.
  const length = [...body].length;
  const tooLong = length > MESSAGE_MAX_LENGTH;
  const showCounter = [...text].length >= COUNTER_FROM;

  function submit() {
    if (!body || tooLong || sending.current) return;
    sending.current = true;
    setError(null);
    if (draft.current?.body !== body) draft.current = { body, clientId: randomId() };
    const sentText = text;
    send.mutate(
      { body, clientId: draft.current.clientId },
      {
        onSuccess: () => {
          draft.current = null;
          // Texte retapé pendant l'envoi : on ne l'efface pas.
          setText((current) => (current === sentText ? "" : current));
          textarea.current?.focus();
        },
        onError: (failure) => {
          const known = failure instanceof MessagingError;
          setError({
            message: known ? failure.message : GENERIC_ERROR,
            retryable: !known || failure.hint !== "conversation_closed",
          });
          // Le bouton était désactivé pendant l'envoi : le focus revient au texte, conservé.
          textarea.current?.focus();
        },
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <label htmlFor="message-body" className="sr-only">
        Ton message à {otherName}
      </label>
      <Textarea
        id="message-body"
        ref={textarea}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Entrée = nouvelle ligne (clavier mobile) ; Ctrl/Cmd + Entrée envoie.
          if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Écris ton message…"
        aria-invalid={tooLong || undefined}
        aria-describedby={showCounter ? "message-counter" : undefined}
        className="max-h-40 min-h-12 field-sizing-content"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm">
          {showCounter && (
            <p
              id="message-counter"
              className={cn(tooLong ? "font-medium text-destructive" : "text-muted-foreground")}
            >
              {length} / {MESSAGE_MAX_LENGTH} caractères
              {tooLong && " : raccourcis ton message"}
            </p>
          )}
          {error && (
            <>
              <p role="alert" className="text-destructive">
                {error.message}
              </p>
              {error.retryable && (
                <button
                  type="button"
                  onClick={submit}
                  disabled={send.isPending}
                  className="min-h-11 font-medium text-destructive underline underline-offset-4"
                >
                  Réessayer
                </button>
              )}
            </>
          )}
        </div>
        <LoadingButton
          type="submit"
          loading={send.isPending}
          disabled={!body || tooLong}
          className="shrink-0"
        >
          Envoyer
        </LoadingButton>
      </div>
    </form>
  );
}
