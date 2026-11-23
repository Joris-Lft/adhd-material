import { queryResult, supabaseMock } from "@/test/supabase-mock";
import { convRow } from "@/test/conversation-fixtures";
import {
  MessagingError,
  fetchConversation,
  fetchConversations,
  fetchMessages,
  fetchUnreadCount,
  markConversationRead,
  returnLoan,
  sendMessage,
  startConversation,
  startLoan,
} from "./conversations";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

beforeEach(() => supabaseMock.resetMocks());

describe("lectures", () => {
  it("fetchConversations : convertit les lignes et écarte celles qui sont incomplètes", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [
        convRow({ role: "owner", unread_count: 2, last_message_from_me: true }),
        convRow({ conversation_id: null }),
        convRow({ conversation_id: "c2", role: "n'importe quoi" }),
        convRow({ conversation_id: "c3", listing_status: null }),
        convRow({ conversation_id: "c4", listing_kind: null }),
        convRow({ conversation_id: "c5", other_display_name: null, is_closed: null }),
      ],
      error: null,
    });
    const result = await fetchConversations();
    expect(supabaseMock.rpc).toHaveBeenCalledWith("list_my_conversations");
    expect(result.map((conversation) => conversation.id)).toEqual([
      convRow().conversation_id,
      "c5",
    ]);
    expect(result[0]).toMatchObject({ role: "owner", unreadCount: 2, lastMessageFromMe: true });
    // Dans le doute (champ absent), lecture seule.
    expect(result[1]).toMatchObject({ otherName: null, isClosed: true });
  });

  it("transmet le signal d'annulation aux lectures", async () => {
    const abortSignal = vi.fn();
    const request = Object.assign(Promise.resolve({ data: [], error: null }), { abortSignal });
    abortSignal.mockReturnValue(request);
    supabaseMock.rpc.mockReturnValue(request);
    const controller = new AbortController();
    await fetchConversations(controller.signal);
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("fetchConversation : 0 ligne = null, 1 ligne = la conversation", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchConversation("c1")).toBeNull();
    supabaseMock.rpc.mockResolvedValueOnce({ data: [convRow()], error: null });
    expect(await fetchConversation("c1")).toMatchObject({ activityName: "Crochet" });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_conversation", { p_conversation_id: "c1" });
  });

  it("fetchUnreadCount et markConversationRead", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: 4, error: null });
    expect(await fetchUnreadCount()).toBe(4);
    supabaseMock.rpc.mockResolvedValueOnce({ data: 0, error: null });
    await markConversationRead("c1");
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith("mark_conversation_read", {
      p_conversation_id: "c1",
    });
  });

  it("une erreur de lecture est levée telle quelle", async () => {
    const error = { code: "XX000", message: "boom" };
    supabaseMock.rpc.mockResolvedValue({ data: null, error });
    await expect(fetchConversations()).rejects.toBe(error);
  });
});

describe("fetchMessages", () => {
  const row = { id: "m1", sender_id: "u", body: "Salut", created_at: "t", read_at: null };

  it("première page : plus récents d'abord, 30 par page, sans curseur", async () => {
    const { builder, calls } = queryResult({ data: [row], error: null });
    supabaseMock.from.mockReturnValue(builder);
    expect(await fetchMessages("c1", null)).toEqual([
      { id: "m1", senderId: "u", body: "Salut", createdAt: "t", readAt: null },
    ]);
    expect(supabaseMock.from).toHaveBeenCalledWith("messages");
    expect(calls).toEqual([
      { method: "select", args: ["id,sender_id,body,created_at,read_at"] },
      { method: "eq", args: ["conversation_id", "c1"] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [30] },
    ]);
  });

  it("page suivante : curseur (created_at, id) avec la date TELLE QUELLE (microsecondes)", async () => {
    const { builder, calls } = queryResult({ data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);
    await fetchMessages("c1", { createdAt: "2026-11-20T10:00:00.123456+00:00", id: "m9" });
    expect(calls.find((call) => call.method === "or")?.args).toEqual([
      "created_at.lt.2026-11-20T10:00:00.123456+00:00,and(created_at.eq.2026-11-20T10:00:00.123456+00:00,id.lt.m9)",
    ]);
  });
});

describe("sendMessage", () => {
  it("insère puis relit la ligne créée", async () => {
    const row = { id: "m1", sender_id: "u", body: "Salut", created_at: "t", read_at: null };
    const { builder, calls } = queryResult({ data: row, error: null });
    supabaseMock.from.mockReturnValue(builder);
    expect(await sendMessage("c1", "Salut", "client-1")).toMatchObject({ id: "m1", body: "Salut" });
    expect(calls[0]).toEqual({
      method: "insert",
      args: [{ conversation_id: "c1", body: "Salut", client_id: "client-1" }],
    });
  });

  it.each([
    [{ code: "23514", hint: "body_too_long", message: "x" }, /trop long/, "body_too_long"],
    [
      { code: "42501", hint: "conversation_closed", message: "x" },
      /n'a plus de compte/,
      "conversation_closed",
    ],
    [{ code: "PT429", hint: "message_rate_limit", message: "x" }, /Patiente/, "message_rate_limit"],
    [{ code: "42501", message: "x" }, /pas partie/, undefined],
  ])("erreur %j : MessagingError avec message et clé", async (error, text, hint) => {
    const { builder } = queryResult({ data: null, error });
    supabaseMock.from.mockReturnValue(builder);
    const failure = await sendMessage("c1", "Salut", "client-1").catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(MessagingError);
    expect((failure as MessagingError).message).toMatch(text);
    expect((failure as MessagingError).hint).toBe(hint);
  });

  it("23505 (client_id déjà utilisé, avec ou sans clé) : message déjà enregistré, renvoie null", async () => {
    for (const hint of ["message_already_sent", undefined]) {
      const { builder } = queryResult({ data: null, error: { code: "23505", hint, message: "x" } });
      supabaseMock.from.mockReturnValue(builder);
      await expect(sendMessage("c1", "Salut", "client-1")).resolves.toBeNull();
    }
  });

  it("23505 avec une autre clé : ce n'est pas un doublon de message, l'erreur est levée", async () => {
    const { builder } = queryResult({
      data: null,
      error: { code: "23505", hint: "autre_contrainte", message: "x" },
    });
    supabaseMock.from.mockReturnValue(builder);
    await expect(sendMessage("c1", "Salut", "client-1")).rejects.toBeInstanceOf(MessagingError);
  });

  it("une exception réseau devient un message de connexion", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(sendMessage("c1", "Salut", "client-1")).rejects.toThrow(/Pas de connexion/);
  });
});

describe("conversation et prêts", () => {
  it("startConversation : renvoie l'id ; erreurs mappées par clé", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: "c1", error: null });
    expect(await startConversation("l1")).toBe("c1");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("start_conversation", { p_listing_id: "l1" });

    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", hint: "own_listing", message: "x" },
    });
    await expect(startConversation("l1")).rejects.toMatchObject({
      message: expect.stringMatching(/ton annonce/),
      hint: "own_listing",
    });
  });

  it("startLoan : p_due_at seulement s'il y a une date", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: "loan-1", error: null });
    await startLoan("c1", null);
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith("start_loan", { p_conversation_id: "c1" });
    await startLoan("c1", "2026-12-01T22:59:59.000Z");
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith("start_loan", {
      p_conversation_id: "c1",
      p_due_at: "2026-12-01T22:59:59.000Z",
    });
  });

  it("startLoan / returnLoan : erreurs mappées", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", hint: "loan_already_open", message: "x" },
    });
    await expect(startLoan("c1", null)).rejects.toThrow(/déjà prêté/);
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", hint: "loan_already_returned", message: "x" },
    });
    // Déjà rendu : c'est l'état voulu, pas une erreur.
    await expect(returnLoan("loan-1")).resolves.toBeUndefined();
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(returnLoan("loan-1")).resolves.toBeUndefined();
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith("return_loan", { p_loan_id: "loan-1" });
  });
});
