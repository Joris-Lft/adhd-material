import { useRef } from "react";
import { Link, useParams } from "react-router";
import { ArrowDown, ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/useSession";
import { StatusBadge } from "@/features/listings/ListingBadges";
import { DELETED_MEMBER } from "@/features/messages/format";
import { LoanPanel } from "@/features/messages/LoanPanel";
import { MessageComposer } from "@/features/messages/MessageComposer";
import { MessageList } from "@/features/messages/MessageList";
import { useConversation } from "@/hooks/useConversations";
import { useConversationRealtime } from "@/hooks/useConversationRealtime";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMarkRead } from "@/hooks/useMarkRead";
import { useMessages } from "@/hooks/useMessages";
import { useThreadScroll } from "@/hooks/useThreadScroll";
import { isUuid } from "@/lib/listing-filters";
import { GENERIC_ERROR } from "@/lib/messages";
import type { Conversation } from "@/services/conversations";

function BackToMessages() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link to="/messages">
        <ArrowLeft aria-hidden="true" />
        Tous les messages
      </Link>
    </Button>
  );
}

function Gone() {
  return (
    <section className="space-y-4 py-8">
      <h1 className="text-2xl font-bold">Cette conversation est introuvable</h1>
      <p className="text-muted-foreground">
        Elle n'existe pas, ou tu n'y as pas accès. Si quelqu'un t'a contacté, la conversation
        apparaîtra ici dès son premier message.
      </p>
      <Button asChild>
        <Link to="/messages">Voir mes messages</Link>
      </Button>
    </section>
  );
}

function ConversationView({ conversation }: { conversation: Conversation }) {
  const myId = useSession().session?.user.id ?? "";
  const { id } = conversation;
  const otherName = conversation.otherName ?? DELETED_MEMBER;

  const thread = useMessages(id, true);
  useConversationRealtime(id, true);

  const messages = thread.messages;
  const latestIncomingId =
    [...(messages ?? [])].reverse().find((message) => message.senderId !== myId)?.id ?? null;
  useMarkRead(id, messages !== null, latestIncomingId);

  const listRef = useRef<HTMLDivElement>(null);
  const { hasNewBelow, announcement, prepareOlder, jumpToBottom } = useThreadScroll(
    messages,
    myId,
    otherName,
  );

  async function loadOlder() {
    prepareOlder();
    const result = await thread.fetchNextPage();
    // Le bouton disparaît quand il n'y a plus d'anciens messages : le focus reste dans le fil.
    if (!result.hasNextPage) listRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <BackToMessages />
        <h1 className="text-2xl font-bold">{otherName}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            to={`/annonces/${conversation.listingId}`}
            className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
          >
            {conversation.activityName}
          </Link>
          <StatusBadge status={conversation.listingStatus} />
        </p>
      </header>

      <LoanPanel conversation={conversation} />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {messages === null ? (
        thread.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-destructive">
              {GENERIC_ERROR}
            </p>
            <Button type="button" variant="outline" onClick={() => thread.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <PageLoader />
        )
      ) : (
        <MessageList
          ref={listRef}
          messages={messages}
          myId={myId}
          otherName={otherName}
          hasOlder={thread.hasNextPage}
          loadingOlder={thread.isFetchingNextPage}
          olderFailed={thread.isFetchNextPageError}
          onLoadOlder={() => void loadOlder()}
          emptyText={
            conversation.role === "requester"
              ? `Écris ton premier message à ${otherName}.`
              : "Aucun message pour l'instant."
          }
        />
      )}

      <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {hasNewBelow && (
          <Button
            type="button"
            size="sm"
            onClick={jumpToBottom}
            className="absolute -top-14 left-1/2 -translate-x-1/2 shadow-lg"
          >
            <ArrowDown aria-hidden="true" />
            Nouveau message
          </Button>
        )}
        {conversation.isClosed ? (
          <p className="rounded-xl border bg-muted p-3 text-sm">
            Cette personne a supprimé son compte : la conversation est en lecture seule, tu ne peux
            plus lui écrire.
          </p>
        ) : (
          <MessageComposer conversationId={id} otherName={otherName} />
        )}
      </div>
    </div>
  );
}

export function ConversationPage() {
  const { id } = useParams();
  const validId = isUuid(id) ? id : null;
  const query = useConversation(validId);
  useDocumentTitle(
    query.data ? `Conversation avec ${query.data.otherName ?? DELETED_MEMBER}` : "Conversation",
  );

  if (!validId) return <Gone />;
  if (query.isPending) return <PageLoader />;
  if (query.isError && query.data === undefined) {
    return (
      <section className="space-y-4 py-8">
        <h1 className="text-2xl font-bold">Un petit souci</h1>
        <p role="alert" className="text-destructive">
          {GENERIC_ERROR}
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Réessayer
        </Button>
      </section>
    );
  }
  if (!query.data) return <Gone />;
  return <ConversationView key={query.data.id} conversation={query.data} />;
}
