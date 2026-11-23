import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message } from "@/services/conversations";
import { formatMessageTime } from "./format";

interface MessageListProps {
  messages: Message[];
  myId: string;
  otherName: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderFailed: boolean;
  onLoadOlder: () => void;
  /** Texte affiché quand le fil est vide. */
  emptyText: string;
}

/** Fil de messages, dans l'ordre de lecture ; la pagination se fait par le haut. */
export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(function MessageList(
  { messages, myId, otherName, hasOlder, loadingOlder, olderFailed, onLoadOlder, emptyText },
  ref,
) {
  // « Lu » n'apparaît que sous mon dernier message lu par l'autre personne.
  let lastReadIndex = -1;
  messages.forEach((message, index) => {
    if (message.senderId === myId && message.readAt) lastReadIndex = index;
  });

  return (
    <div ref={ref} tabIndex={-1} className="space-y-4 outline-none">
      {hasOlder && (
        <div className="flex flex-col items-center gap-2">
          {/* aria-disabled (et non disabled) : le bouton garde le focus pendant le chargement. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => !loadingOlder && onLoadOlder()}
            aria-disabled={loadingOlder || undefined}
            className="aria-disabled:opacity-50"
          >
            {loadingOlder && <Loader2 className="animate-spin" aria-hidden="true" />}
            Messages plus anciens
          </Button>
          {olderFailed && (
            <p role="alert" className="text-sm text-destructive">
              Les messages plus anciens n'ont pas pu être chargés. Réessaie dans un instant.
            </p>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ol aria-label="Messages" className="space-y-3">
          {messages.map((message, index) => {
            const mine = message.senderId === myId;
            return (
              <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                  )}
                >
                  <span className="sr-only">{mine ? "Toi" : otherName} : </span>
                  <p className="break-words whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-1 text-xs">
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                    {index === lastReadIndex && <span> · Lu</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
});
