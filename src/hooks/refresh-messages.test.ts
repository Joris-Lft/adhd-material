import { QueryClient } from "@tanstack/react-query";
import { conversationKeys } from "@/hooks/conversation-keys";
import { messageRow } from "@/test/conversation-fixtures";
import { fetchMessages, type Message } from "@/services/conversations";
import {
  insertMessage,
  mergeMessages,
  refreshLatestMessages,
  type MessagePages,
} from "./refresh-messages";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

vi.mock("@/services/conversations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/conversations")>()),
  fetchMessages: vi.fn(),
}));

const fetchMock = vi.mocked(fetchMessages);
const KEY = conversationKeys.messages("c1");

const msg = (index: number, overrides: Partial<Message> = {}): Message => {
  const row = messageRow(index);
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    ...overrides,
  };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(first: Message[], ...older: Message[][]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData<MessagePages>(KEY, {
    pages: [first, ...older],
    pageParams: [null, ...older.map(() => null)],
  });
  return queryClient;
}

const ids = (queryClient: QueryClient) =>
  queryClient.getQueryData<MessagePages>(KEY)!.pages.map((page) => page.map((m) => m.id));

beforeEach(() => fetchMock.mockReset());

describe("mergeMessages", () => {
  it("union dédoublonnée, plus récent d'abord, readAt jamais perdu", () => {
    const merged = mergeMessages(
      [msg(2, { readAt: "lu" }), msg(1)],
      [msg(3), msg(2, { readAt: null })],
    );
    expect(merged.map((m) => m.id)).toEqual([msg(3).id, msg(2).id, msg(1).id]);
    expect(merged[1]?.readAt).toBe("lu");
  });
});

describe("refreshLatestMessages", () => {
  it("un message inséré pendant la lecture (mon envoi) ne disparaît pas", async () => {
    const queryClient = setup([msg(1)]);
    const read = deferred<Message[]>();
    fetchMock.mockReturnValue(read.promise);
    const refresh = refreshLatestMessages(queryClient, "c1");
    await Promise.resolve();
    insertMessage(queryClient, "c1", msg(2));
    read.resolve([msg(1)]); // lecture partie avant l'envoi
    await refresh;
    expect(ids(queryClient)[0]).toEqual([msg(2).id, msg(1).id]);
  });

  it("deux lectures dont les réponses arrivent dans le désordre : rien n'est perdu", async () => {
    const queryClient = setup([msg(1)]);
    const first = deferred<Message[]>();
    const second = deferred<Message[]>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = refreshLatestMessages(queryClient, "c1");
    const b = refreshLatestMessages(queryClient, "c1");
    await Promise.resolve();
    await Promise.resolve();
    second.resolve([msg(3), msg(2), msg(1)]);
    await b;
    first.resolve([msg(2), msg(1)]); // réponse ancienne en dernier
    await a;
    expect(ids(queryClient)[0]).toEqual([msg(3).id, msg(2).id, msg(1).id]);
  });

  it("garde les pages anciennes déjà chargées", async () => {
    const queryClient = setup([msg(3), msg(2)], [msg(1)]);
    fetchMock.mockResolvedValue([msg(4), msg(3), msg(2)]);
    await refreshLatestMessages(queryClient, "c1");
    expect(ids(queryClient)).toEqual([[msg(4).id, msg(3).id, msg(2).id], [msg(1).id]]);
  });

  it("fil absent du cache : aucune lecture", async () => {
    await refreshLatestMessages(new QueryClient(), "c1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attend la fin d'un chargement en cours avant de lire (la fusion ne serait pas écrasée)", async () => {
    const queryClient = setup([msg(1)]);
    const loading = deferred<Message[]>();
    const running = queryClient.fetchInfiniteQuery({
      queryKey: KEY,
      queryFn: () => loading.promise,
      initialPageParam: null,
      staleTime: 0,
    });
    await Promise.resolve();
    fetchMock.mockResolvedValue([msg(2), msg(1)]);
    const refresh = refreshLatestMessages(queryClient, "c1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    loading.resolve([msg(1)]);
    await running;
    await refresh;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ids(queryClient)[0]).toEqual([msg(2).id, msg(1).id]);
  });

  it("trou possible (30 messages plus récents sans l'ancien repère) : relecture complète", async () => {
    const queryClient = setup([msg(1)]);
    fetchMock.mockResolvedValue(Array.from({ length: 30 }, (_, i) => msg(100 - i)));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await refreshLatestMessages(queryClient, "c1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });
});
