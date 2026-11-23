import { Link } from "react-router";
import { ImageOff } from "lucide-react";
import { StatusBadge } from "@/features/listings/ListingBadges";
import { formatRelativeDate } from "@/lib/relative-date";
import { cn } from "@/lib/utils";
import { listingPhotoUrl } from "@/services/listing-reads";
import type { Conversation } from "@/services/conversations";
import { DELETED_MEMBER } from "./format";

export const NO_MESSAGE_YET = "Pas encore de message";

/** Une ligne de la liste : toute la ligne est un lien vers la conversation. */
export function ConversationItem({ conversation }: { conversation: Conversation }) {
  const { unreadCount } = conversation;
  const unread = unreadCount > 0;
  const preview = conversation.lastMessageExcerpt
    ? `${conversation.lastMessageFromMe ? "Toi : " : ""}${conversation.lastMessageExcerpt}`
    : NO_MESSAGE_YET;
  const date = conversation.lastMessageAt ?? conversation.lastActivityAt;

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* Non-lus d'abord : c'est la première chose annoncée par un lecteur d'écran. */}
      {unread && (
        <span className="sr-only">
          {unreadCount} {unreadCount > 1 ? "non lus" : "non lu"},{" "}
        </span>
      )}
      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {conversation.coverPath ? (
          <img
            src={listingPhotoUrl(conversation.coverPath)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{conversation.activityName}</span>
          <time dateTime={date} className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeDate(date)}
          </time>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {conversation.otherName ?? DELETED_MEMBER}
        </p>
        <p
          className={cn(
            "truncate text-sm",
            unread ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {preview}
        </p>
        {conversation.listingStatus !== "disponible" && (
          <div className="pt-1">
            <StatusBadge status={conversation.listingStatus} />
          </div>
        )}
      </div>
      {unread && (
        <span
          aria-hidden="true"
          className="flex min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
