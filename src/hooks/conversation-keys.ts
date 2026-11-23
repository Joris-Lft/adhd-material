import type { QueryClient } from "@tanstack/react-query";

/** Clés TanStack Query de la messagerie. */
export const conversationKeys = {
  all: ["conversations"] as const,
  list: ["conversations", "list"] as const,
  unread: ["conversations", "unread"] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["conversations", "messages", id] as const,
};

/** Liste des conversations et pastille de non-lus. */
export function invalidateInbox(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: conversationKeys.list }),
    queryClient.invalidateQueries({ queryKey: conversationKeys.unread }),
  ]);
}

/** En-tête et fil d'une conversation. */
export function invalidateConversation(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) }),
    queryClient.invalidateQueries({ queryKey: conversationKeys.messages(id) }),
  ]);
}
