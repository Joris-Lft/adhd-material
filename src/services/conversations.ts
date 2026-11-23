import { supabase } from "@/lib/supabase";
import {
  mapLoanError,
  mapSendMessageError,
  mapStartConversationError,
  GENERIC_ERROR,
} from "@/lib/messages";
import type { ListingKind, ListingStatus } from "@/services/listings";
import type { Database } from "@/types/database";

export const MESSAGES_PAGE_SIZE = 30;
export const MESSAGE_MAX_LENGTH = 2000;

type SummaryRow = Database["public"]["CompositeTypes"]["conversation_summary"];

/** Une conversation vue par la personne connectée. */
export interface Conversation {
  id: string;
  /** `owner` : tu es l'auteur de l'annonce ; `requester` : tu l'as contactée. */
  role: "owner" | "requester";
  lastActivityAt: string;
  listingId: string;
  activityName: string;
  listingKind: ListingKind;
  listingStatus: ListingStatus;
  coverPath: string | null;
  /** Null : l'autre personne a supprimé son compte. */
  otherName: string | null;
  /** Lecture seule : l'autre personne n'existe plus. */
  isClosed: boolean;
  lastMessageExcerpt: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
  loanId: string | null;
  loanStartedAt: string | null;
  loanDueAt: string | null;
}

export interface Message {
  id: string;
  senderId: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** Échec d'une action de messagerie ; le message est prêt à afficher, `hint` est la clé du serveur. */
export class MessagingError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

interface RpcError {
  code?: string;
  hint?: string;
  message?: string;
  status?: number;
}

/** Erreur levée par `fetch` (réseau) : mêmes champs qu'une erreur PostgREST, sans code. */
function fromThrown(error: unknown): RpcError {
  return { message: error instanceof Error ? error.message : "" };
}

/** Ligne écartée si un champ indispensable manque : aucune valeur par défaut qui changerait un droit ou un statut. */
function toConversation(row: SummaryRow): Conversation | null {
  const lastActivityAt = row.last_activity_at ?? row.created_at;
  if (
    !row.conversation_id ||
    !row.listing_id ||
    (row.role !== "owner" && row.role !== "requester") ||
    !row.listing_kind ||
    !row.listing_status ||
    row.activity_name === null ||
    !lastActivityAt
  ) {
    return null;
  }
  return {
    id: row.conversation_id,
    role: row.role,
    lastActivityAt,
    listingId: row.listing_id,
    activityName: row.activity_name,
    listingKind: row.listing_kind,
    listingStatus: row.listing_status,
    coverPath: row.cover_photo_path,
    otherName: row.other_display_name,
    // Dans le doute, lecture seule.
    isClosed: row.is_closed ?? true,
    lastMessageExcerpt: row.last_message_excerpt,
    lastMessageAt: row.last_message_at,
    lastMessageFromMe: row.last_message_from_me ?? false,
    unreadCount: row.unread_count ?? 0,
    loanId: row.loan_id,
    loanStartedAt: row.loan_started_at,
    loanDueAt: row.loan_due_at,
  };
}

/** Mes conversations, la plus récente en premier (200 au maximum). */
export async function fetchConversations(signal?: AbortSignal): Promise<Conversation[]> {
  const request = supabase.rpc("list_my_conversations");
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return (data ?? []).flatMap((row) => toConversation(row) ?? []);
}

/** Une conversation ; null si elle n'existe pas ou si je n'y participe pas (ou que je suis auteur sans message). */
export async function fetchConversation(
  id: string,
  signal?: AbortSignal,
): Promise<Conversation | null> {
  const request = supabase.rpc("get_conversation", { p_conversation_id: id });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? toConversation(row) : null;
}

export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const request = supabase.rpc("get_unread_count");
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function markConversationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: id });
  if (error) throw error;
}

/** Ouvre (ou retrouve) la conversation avec l'auteur d'une annonce. */
export async function startConversation(listingId: string): Promise<string> {
  let result;
  try {
    result = await supabase.rpc("start_conversation", { p_listing_id: listingId });
  } catch (error) {
    result = { data: null, error: fromThrown(error) };
  }
  if (result.error || !result.data) {
    throw new MessagingError(
      result.error ? mapStartConversationError(result.error) : GENERIC_ERROR,
      result.error?.hint,
    );
  }
  return result.data;
}

/** Position dans le fil : date en chaîne telle que renvoyée par le serveur (microsecondes). */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

const MESSAGE_COLUMNS = "id,sender_id,body,created_at,read_at";

function toMessage(
  row: Pick<
    Database["public"]["Tables"]["messages"]["Row"],
    "id" | "sender_id" | "body" | "created_at" | "read_at"
  >,
): Message {
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/** Une page de messages, du plus récent au plus ancien, avant `cursor` s'il est donné. */
export async function fetchMessages(
  conversationId: string,
  cursor: MessageCursor | null,
  signal?: AbortSignal,
): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);
  if (cursor) {
    // Chaîne telle quelle : une Date perdrait les microsecondes et sauterait des messages.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  return data.map(toMessage);
}

/**
 * Envoie un message. `clientId` identifie le message composé : le renvoyer après une issue incertaine
 * ne crée pas de doublon. Renvoie null si le serveur l'avait déjà enregistré (23505) : à relire.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  clientId: string,
): Promise<Message | null> {
  let result;
  try {
    result = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, body, client_id: clientId })
      .select(MESSAGE_COLUMNS)
      .single();
  } catch (error) {
    result = { data: null, error: fromThrown(error) };
  }
  if (
    result.error &&
    "code" in result.error &&
    result.error.code === "23505" &&
    (!("hint" in result.error) ||
      !result.error.hint ||
      result.error.hint === "message_already_sent")
  ) {
    return null;
  }
  if (result.error || !result.data) {
    throw new MessagingError(
      result.error ? mapSendMessageError(result.error) : GENERIC_ERROR,
      result.error && "hint" in result.error ? result.error.hint : undefined,
    );
  }
  return toMessage(result.data);
}

/** Enregistre le prêt ; `dueAt` est une date ISO future (ou null : pas de date de retour). */
export async function startLoan(conversationId: string, dueAt: string | null): Promise<string> {
  let result;
  try {
    result = await supabase.rpc("start_loan", {
      p_conversation_id: conversationId,
      ...(dueAt ? { p_due_at: dueAt } : {}),
    });
  } catch (error) {
    result = { data: null, error: fromThrown(error) };
  }
  if (result.error || !result.data) {
    throw new MessagingError(
      result.error ? mapLoanError(result.error) : GENERIC_ERROR,
      result.error?.hint,
    );
  }
  return result.data;
}

export async function returnLoan(loanId: string): Promise<void> {
  let result;
  try {
    result = await supabase.rpc("return_loan", { p_loan_id: loanId });
  } catch (error) {
    result = { data: null, error: fromThrown(error) };
  }
  // Déjà rendu (autre appareil, réessai) : c'est l'état voulu.
  if (result.error && result.error.hint !== "loan_already_returned") {
    throw new MessagingError(mapLoanError(result.error), result.error.hint);
  }
}
