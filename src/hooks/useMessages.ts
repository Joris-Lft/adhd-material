import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { conversationKeys } from "@/hooks/conversation-keys";
import {
  MESSAGES_PAGE_SIZE,
  fetchMessages,
  type Message,
  type MessageCursor,
} from "@/services/conversations";

/** Fil d'une conversation : pages chargées du plus récent au plus ancien, rendues dans l'ordre de lecture. */
export function useMessages(conversationId: string, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: conversationKeys.messages(conversationId),
    queryFn: ({ pageParam, signal }) => fetchMessages(conversationId, pageParam, signal),
    initialPageParam: null as MessageCursor | null,
    getNextPageParam: (lastPage): MessageCursor | undefined => {
      const oldest = lastPage[lastPage.length - 1];
      return lastPage.length < MESSAGES_PAGE_SIZE || !oldest
        ? undefined
        : { createdAt: oldest.createdAt, id: oldest.id };
    },
    enabled,
  });

  const messages = useMemo(() => {
    if (!query.data) return null;
    // Un message peut figurer dans deux pages si le fil a bougé entre deux chargements.
    const seen = new Set<string>();
    const unique: Message[] = [];
    for (const page of query.data.pages) {
      for (const message of page) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        unique.push(message);
      }
    }
    return unique.reverse();
  }, [query.data]);

  return { ...query, messages };
}
