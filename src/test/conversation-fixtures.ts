import { queryHandler, rpcResult, supabaseMock } from "@/test/supabase-mock";
import { ID, mockPublicStorage, profileRpc } from "@/test/listing-fixtures";

export const OTHER_ID = "owner-1";
export const CONVERSATION_PATH = `/messages/${ID.conversation}`;

/** Ligne brute de list_my_conversations / get_conversation (type conversation_summary). */
export function convRow(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: ID.conversation,
    role: "requester",
    created_at: "2026-11-20T09:00:00.000000+00:00",
    last_activity_at: "2026-11-23T09:00:00.000000+00:00",
    listing_id: ID.listing,
    activity_name: "Crochet",
    listing_kind: "don",
    listing_status: "disponible",
    cover_photo_path: "u/a.webp",
    other_user_id: OTHER_ID,
    other_display_name: "Alice",
    is_closed: false,
    last_message_excerpt: null,
    last_message_at: null,
    last_message_from_me: false,
    unread_count: 0,
    loan_id: null,
    loan_started_at: null,
    loan_due_at: null,
    ...overrides,
  };
}

const BASE = Date.UTC(2026, 10, 20, 10, 0, 0);

/** Date avec microsecondes, comme la renvoie Postgres : le curseur doit la conserver telle quelle. */
export function stamp(index: number) {
  return new Date(BASE + index * 60_000).toISOString().replace(/\.(\d{3})Z$/, ".$1456+00:00");
}

export interface MessageRowData {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export function messageRow(index: number, overrides: Partial<MessageRowData> = {}): MessageRowData {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sender_id: OTHER_ID,
    body: `Message ${index}`,
    created_at: stamp(index),
    read_at: null,
    ...overrides,
  };
}

export interface MessagingState {
  list: Record<string, unknown>[];
  /** Ligne renvoyée par get_conversation ; null = introuvable. */
  conversation: Record<string, unknown> | null;
  messages: MessageRowData[];
  unread: number;
  /** Erreur à renvoyer par une RPC (clé = nom de la fonction). */
  rpcErrors: Record<string, unknown>;
  /** Erreur à renvoyer à la lecture ou à l'envoi des messages. */
  readError: unknown;
  sendError: unknown;
  /** client_id de chaque tentative d'envoi (réussie ou non), dans l'ordre. */
  attempts: string[];
  /** Messages insérés par l'utilisateur, dans l'ordre. */
  sent: { conversation_id: string; body: string; client_id: string }[];
  /** Appels à la lecture des messages (méthodes enregistrées). */
  messageReads: { method: string; args: unknown[] }[][];
  /** Nombre d'appels par RPC. */
  rpcCalls: Record<string, number>;
}

/**
 * Simule le backend de messagerie : RPC, lecture paginée et insertion des messages.
 * Retourne l'état, que les tests modifient pour simuler ce qui arrive côté serveur.
 */
export function setupMessaging(initial: Partial<MessagingState> = {}): MessagingState {
  mockPublicStorage();
  const state: MessagingState = {
    list: [],
    conversation: convRow(),
    messages: [],
    unread: 0,
    rpcErrors: {},
    readError: null,
    sendError: null,
    sent: [],
    attempts: [],
    messageReads: [],
    rpcCalls: {},
    ...initial,
  };

  supabaseMock.rpc.mockImplementation((fn: string) => {
    if (fn === "get_my_profile") return profileRpc(null);
    state.rpcCalls[fn] = (state.rpcCalls[fn] ?? 0) + 1;
    const error = state.rpcErrors[fn];
    if (error) return rpcResult({ data: null, error });
    switch (fn) {
      case "list_my_conversations":
        return rpcResult({ data: state.list, error: null });
      case "get_conversation":
        return rpcResult({
          data: state.conversation ? [state.conversation] : [],
          error: null,
        });
      case "get_unread_count":
        return rpcResult({ data: state.unread, error: null });
      case "mark_conversation_read":
        return rpcResult({ data: 0, error: null });
      case "start_loan":
        return rpcResult({ data: "loan-1", error: null });
      case "return_loan":
        return rpcResult({ data: null, error: null });
      default:
        return rpcResult({ data: null, error: null });
    }
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "messages") throw new Error(`Table inattendue : ${table}`);
    const handler = queryHandler((calls) => {
      const insert = calls.find((call) => call.method === "insert");
      if (insert) {
        const payload = insert.args[0] as {
          conversation_id: string;
          body: string;
          client_id: string;
        };
        state.attempts.push(payload.client_id);
        if (state.sendError) return { data: null, error: state.sendError };
        // Comme l'index unique du serveur : un client_id déjà utilisé est refusé.
        if (state.sent.some((previous) => previous.client_id === payload.client_id)) {
          return {
            data: null,
            error: { code: "23505", hint: "message_already_sent", message: "doublon" },
          };
        }
        state.sent.push(payload);
        const row = messageRow(1000 + state.sent.length, {
          sender_id: "user-1",
          body: payload.body,
          created_at: stamp(1000 + state.sent.length),
        });
        state.messages.push(row);
        return { data: row, error: null };
      }
      state.messageReads.push(calls);
      if (state.readError) return { data: null, error: state.readError };
      let rows = [...state.messages].sort(
        (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
      const filter = calls.find((call) => call.method === "or")?.args[0] as string | undefined;
      const match = filter?.match(
        /^created_at\.lt\.(.+?),and\(created_at\.eq\.(.+?),id\.lt\.(.+)\)$/,
      );
      if (match) {
        const [, created, , id] = match;
        rows = rows.filter(
          (row) => row.created_at < created! || (row.created_at === created && row.id < id!),
        );
      }
      const limit = calls.find((call) => call.method === "limit")?.args[0] as number;
      return { data: rows.slice(0, limit), error: null };
    });
    return handler.builder;
  });
  return state;
}
