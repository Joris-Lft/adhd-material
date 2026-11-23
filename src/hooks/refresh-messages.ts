import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { conversationKeys } from "@/hooks/conversation-keys";
import {
  MESSAGES_PAGE_SIZE,
  fetchMessages,
  type Message,
  type MessageCursor,
} from "@/services/conversations";

export type MessagePages = InfiniteData<Message[], MessageCursor | null>;

/** Du plus récent au plus ancien ; dates comparées en temps puis en texte (microsecondes), puis id. */
export function compareNewestFirst(a: Message, b: Message): number {
  return (
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** Ajoute un message à la première page, à sa place (date, id). */
export function insertMessage(queryClient: QueryClient, conversationId: string, message: Message) {
  queryClient.setQueryData<MessagePages>(conversationKeys.messages(conversationId), (data) => {
    if (!data) return data;
    const [first = [], ...rest] = data.pages;
    if (first.some((existing) => existing.id === message.id)) return data;
    return { ...data, pages: [[message, ...first].sort(compareNewestFirst), ...rest] };
  });
}

/** Union de deux lectures de la première page : jamais de perte, jamais de retour en arrière de `readAt`. */
export function mergeMessages(current: Message[], fresh: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of [...fresh, ...current]) {
    const known = byId.get(message.id);
    byId.set(message.id, known ? { ...known, readAt: known.readAt ?? message.readAt } : message);
  }
  return [...byId.values()].sort(compareNewestFirst);
}

const IDLE_WAIT_MS = 5000;

/** Attend que le fil ne soit plus en cours de chargement (page suivante, relecture complète). */
function waitUntilIdle(queryClient: QueryClient, key: readonly unknown[]): Promise<void> {
  const isFetching = () => queryClient.getQueryState(key)?.fetchStatus === "fetching";
  if (!isFetching()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (!isFetching()) done();
    });
    const timer = setTimeout(done, IDLE_WAIT_MS);
  });
}

/**
 * Relit la première page du fil et la FUSIONNE avec le cache (un message inséré pendant la lecture, ou une
 * réponse arrivée dans le désordre, ne disparaît jamais). Les pages anciennes déjà chargées restent.
 * Pas de lecture si le fil n'est pas en cache ; attend la fin d'un chargement en cours (TanStack
 * reconstruit les pages et écraserait la fusion). Si plus de messages sont arrivés qu'une page ne peut en
 * contenir (trou possible), on relit tout.
 */
export async function refreshLatestMessages(queryClient: QueryClient, conversationId: string) {
  const key = conversationKeys.messages(conversationId);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await waitUntilIdle(queryClient, key);
      if (!queryClient.getQueryData<MessagePages>(key)?.pages.length) return;
      const fresh = await fetchMessages(conversationId, null);
      // Un chargement a démarré pendant la lecture : on recommence une fois qu'il est fini.
      if (queryClient.getQueryState(key)?.fetchStatus === "fetching") continue;
      // Cache relu APRÈS la réponse : il contient ce qui a été inséré entre-temps.
      const data = queryClient.getQueryData<MessagePages>(key);
      if (!data?.pages.length) return;
      const [oldFirst = [], ...rest] = data.pages;
      const oldest = oldFirst[oldFirst.length - 1];
      const covers =
        !oldest || fresh.length < MESSAGES_PAGE_SIZE || fresh.some((m) => m.id === oldest.id);
      if (!covers) {
        await queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.setQueryData<MessagePages>(key, {
        ...data,
        pages: [mergeMessages(oldFirst, fresh), ...rest],
      });
      return;
    }
  } catch {
    // La resynchronisation (reconnexion, retour d'onglet) rattrapera.
  }
}
