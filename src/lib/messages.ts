// Messages affichés à l'utilisateur (français, tutoiement) et mappings d'erreurs Supabase.

interface ErrorLike {
  name?: string;
  code?: string;
  status?: number;
  statusCode?: string;
  hint?: string;
  message?: string;
}

export const GENERIC_ERROR = "Quelque chose n'a pas marché. Réessaie dans un instant.";
export const NETWORK_ERROR = "Pas de connexion pour l'instant. Vérifie ton réseau et réessaie.";
export const CODE_INVALID =
  "Ce code n'est pas bon ou a expiré. Vérifie-le ou demande-en un nouveau.";
export const VERIFY_RATE_LIMIT = "Trop d'essais. Patiente un peu avant de réessayer.";
export const SEND_RATE_LIMIT = "Patiente un peu avant de redemander un code.";
export const SIGN_OUT_FAILED = "La déconnexion a échoué. Réessaie dans un instant.";

const RATE_LIMIT_FALLBACK = "Trop de tentatives, réessaie dans un instant.";

export const DISPLAY_NAME_TAKEN = "Ce pseudo est déjà pris";
export const DISPLAY_NAME_UNAVAILABLE = "Ce pseudo n'est pas disponible";
export const DISPLAY_NAME_LENGTH = "Entre 3 et 30 caractères";
export const DISPLAY_NAME_SAVE_FAILED = "L'enregistrement a échoué. Réessaie dans un instant.";

/** Erreur Supabase Auth lors de l'envoi d'un code ou d'un lien. */
export function mapAuthError(error: ErrorLike): string {
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return NETWORK_ERROR;
  if (error.code === "over_request_rate_limit") return VERIFY_RATE_LIMIT;
  if (error.code === "over_email_send_rate_limit" || error.status === 429) return SEND_RATE_LIMIT;
  if (error.code === "otp_expired" || error.code === "otp_disabled") {
    return "Ce code a expiré ou n'est plus valable. Demande-en un nouveau.";
  }
  if (error.code === "validation_failed" || error.code === "email_address_invalid") {
    return "Cette adresse email n'a pas l'air valide.";
  }
  return GENERIC_ERROR;
}

/** Erreur Supabase Auth lors de la vérification d'un code saisi. */
export function mapVerifyError(error: ErrorLike): string {
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return NETWORK_ERROR;
  if (error.status === 429 || error.code === "over_request_rate_limit") return VERIFY_RATE_LIMIT;
  if (error.code === "otp_expired" || error.status === 403 || error.status === 400) {
    return CODE_INVALID;
  }
  return mapAuthError(error);
}

/** Erreur PostgREST lors de la mise à jour du pseudo. */
export function mapDisplayNameError(error: ErrorLike): string {
  if (error.code === "PT429" || error.status === 429) {
    return error.message || RATE_LIMIT_FALLBACK;
  }
  if (error.code === "23505") return DISPLAY_NAME_TAKEN;
  if (error.code === "23514") {
    return error.message?.includes(DISPLAY_NAME_UNAVAILABLE)
      ? DISPLAY_NAME_UNAVAILABLE
      : DISPLAY_NAME_LENGTH;
  }
  return DISPLAY_NAME_SAVE_FAILED;
}

export const SEARCH_FAILED = "La recherche n'a pas abouti. Réessaie dans un instant.";
export const CITY_SAVE_FAILED = "L'enregistrement a échoué. Réessaie dans un instant.";
export const CITY_UNKNOWN = "Cette ville n'existe pas. Choisis-en une dans la liste.";
export const ACTIVITY_CREATE_FAILED =
  "La création de l'activité a échoué. Réessaie dans un instant.";
export const ACTIVITY_NAME_LENGTH = "Le nom d'une activité doit faire entre 2 et 60 caractères.";
export const ACTIVITY_NAME_INVALID =
  "Ce nom d'activité n'est pas valide. Utilise au moins 2 lettres ou chiffres.";

function isNetworkError(error: ErrorLike): boolean {
  return (
    error.status === 0 || /failed to fetch|networkerror|load failed/i.test(error.message ?? "")
  );
}

/** Erreur PostgREST lors de la mise à jour de la ville du profil. */
export function mapCityError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.code === "23503") return CITY_UNKNOWN;
  return CITY_SAVE_FAILED;
}

/** Erreur PostgREST lors de la création d'une activité. */
export function mapActivityError(error: ErrorLike): string {
  if (error.code === "PT429" || error.status === 429) return error.message || RATE_LIMIT_FALLBACK;
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.code === "23514") {
    return error.message?.includes("activities_name_normalized_length")
      ? ACTIVITY_NAME_INVALID
      : ACTIVITY_NAME_LENGTH;
  }
  return ACTIVITY_CREATE_FAILED;
}

// --- Publication d'une annonce ---

export type ListingField = "activity" | "kind" | "city" | "photos" | "details";

export const LISTING_ACTIVITY_REQUIRED = "Choisis une activité dans la liste ou propose-en une.";
export const LISTING_KIND_REQUIRED = "Dis-nous si tu donnes ou si tu prêtes.";
export const LISTING_PHOTOS_REQUIRED = "Ajoute au moins une photo.";
export const LISTING_PHOTOS_MAX = "Tu peux ajouter 3 photos au maximum.";
export const LISTING_CITY_REQUIRED = "Choisis une ville dans la liste.";
export const LISTING_TEXT_MAX = "2000 caractères au maximum.";
export const LISTING_TEXTS_TOO_LONG =
  "La description et l'expérience sont limitées à 2000 caractères chacune.";
export const LISTING_UNCONFIRMED =
  "On n'a pas pu confirmer la publication. Vérifie ta connexion avant de réessayer : l'annonce est peut-être déjà en ligne.";
export const PHOTO_PROCESS_FAILED =
  "Les photos n'ont pas pu être préparées. Réessaie dans un instant.";
export const LISTING_SESSION_EXPIRED =
  "Ta session a expiré. Reconnecte-toi pour publier ton annonce.";
export const PHOTO_UPLOAD_FAILED = "L'envoi des photos a échoué. Réessaie dans un instant.";
export const PHOTO_UPLOAD_TOO_HEAVY = "Une photo est trop lourde pour être envoyée.";
export const PHOTO_FORMAT_UNSUPPORTED =
  "Une photo est dans un format non pris en charge. Utilise JPEG, PNG ou WebP.";
export const PHOTO_MISSING = "Une photo n'a pas été envoyée : réessaie l'envoi.";
export const PHOTO_ALREADY_USED = "Une de ces photos est déjà utilisée par une annonce.";
export const PHOTO_LIMIT_IGNORED =
  "Tu peux ajouter 3 photos au maximum : les autres ont été ignorées.";

export const photoFormatMessage = (name: string) =>
  `« ${name} » : format non pris en charge. Utilise une image JPEG, PNG ou WebP.`;
export const photoTooHeavyMessage = (name: string) =>
  `« ${name} » est trop lourde, même après compression. Choisis une image plus légère.`;
export const photoUnreadableMessage = (name: string) =>
  `« ${name} » n'a pas pu être lue. Essaie avec une autre image.`;

/** Erreur du Storage lors de l'envoi d'une photo. */
export function mapPhotoUploadError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.status === 413 || error.statusCode === "413") return PHOTO_UPLOAD_TOO_HEAVY;
  return PHOTO_UPLOAD_FAILED;
}

export const LISTING_PHOTO_INVALID = "Une photo n'est pas valide. Retire-la et réessaie.";

type ListingErrorInfo = {
  message: string;
  field?: ListingField;
  /** Issue incertaine (réseau, passerelle) : l'annonce a pu être créée, il ne faut rien supprimer. */
  uncertain?: boolean;
};

// Clés stables renvoyées par create_listing dans `hint` (jamais de comparaison de messages).
const LISTING_ERRORS_BY_HINT: Record<string, ListingErrorInfo> = {
  auth_required: { message: LISTING_SESSION_EXPIRED },
  kind_required: { message: LISTING_KIND_REQUIRED, field: "kind" },
  photos_count: { message: "Une annonce doit avoir de 1 à 3 photos.", field: "photos" },
  photo_path_missing: { message: LISTING_PHOTO_INVALID, field: "photos" },
  photo_duplicate: { message: LISTING_PHOTO_INVALID, field: "photos" },
  photo_path_forbidden: { message: LISTING_PHOTO_INVALID, field: "photos" },
  photo_path_invalid: { message: LISTING_PHOTO_INVALID, field: "photos" },
  photo_missing: { message: PHOTO_MISSING, field: "photos" },
  photo_in_use: { message: PHOTO_ALREADY_USED, field: "photos" },
  listing_photo_required: { message: LISTING_PHOTOS_REQUIRED, field: "photos" },
  activity_not_found: {
    message: "Cette activité n'existe plus. Choisis-en une autre.",
    field: "activity",
  },
  city_not_found: { message: CITY_UNKNOWN, field: "city" },
  // Le serveur ne dit pas quel texte est trop long : l'erreur est posée sur Description.
  text_too_long: { message: LISTING_TEXTS_TOO_LONG, field: "details" },
};

const SQLSTATE = /^[0-9A-Z]{5}$/;
const GATEWAY_STATUSES = [502, 503, 504];

/** Erreur de create_listing : d'abord la clé `hint`, puis le code SQL en repli. */
export function mapListingError(error: ErrorLike): ListingErrorInfo {
  if (error.hint === "listing_rate_limit" || error.code === "PT429" || error.status === 429) {
    return { message: error.message || RATE_LIMIT_FALLBACK };
  }
  const byHint = error.hint ? LISTING_ERRORS_BY_HINT[error.hint] : undefined;
  if (byHint) return byHint;
  // PGRSTxxx : PostgREST a refusé la requête avant toute transaction, rien n'a été écrit.
  if (/^PGRST\d{3}$/.test(error.code ?? "")) {
    return {
      message:
        error.code === "PGRST301" || error.code === "PGRST303"
          ? LISTING_SESSION_EXPIRED
          : GENERIC_ERROR,
    };
  }
  // Sans clé connue ni SQLSTATE, on ne sait pas si la transaction a été validée.
  if (
    isNetworkError(error) ||
    !SQLSTATE.test(error.code ?? "") ||
    GATEWAY_STATUSES.includes(error.status ?? 0)
  ) {
    return { message: LISTING_UNCONFIRMED, uncertain: true };
  }
  if (error.code === "42501") return { message: LISTING_SESSION_EXPIRED };
  if (error.code === "23505") return { message: PHOTO_ALREADY_USED, field: "photos" };
  return { message: GENERIC_ERROR };
}

// --- Statut d'une annonce ---

export const LISTING_STATUS_PHOTO_REQUIRED =
  "Cette annonce n'a plus de photo : elle ne peut pas être remise en ligne.";
export const LISTING_STATUS_LOAN =
  "Cette annonce est prêtée en ce moment : son statut ne peut pas être changé ici.";
export const LISTING_STATUS_GONE =
  "Cette annonce n'existe plus ou ne t'appartient pas. Recharge la page.";
export const LISTING_STATUS_FAILED = "Le changement n'a pas abouti. Réessaie dans un instant.";

/** Erreur PostgREST lors d'un changement de statut d'annonce. */
export function mapListingStatusError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.code === "23514") {
    return error.hint === "listing_photo_required"
      ? LISTING_STATUS_PHOTO_REQUIRED
      : LISTING_STATUS_LOAN;
  }
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST303") {
    return LISTING_SESSION_EXPIRED;
  }
  return LISTING_STATUS_FAILED;
}

// --- Messagerie et prêts ---

export const MESSAGING_SESSION_EXPIRED = "Ta session a expiré. Reconnecte-toi puis réessaie.";
export const CONTACT_OWN_LISTING = "C'est ton annonce : tu ne peux pas te contacter toi-même.";
export const CONTACT_LISTING_UNAVAILABLE =
  "Cette annonce n'est plus disponible : tu ne peux plus la contacter.";
export const CONVERSATION_RATE_LIMIT =
  "Tu as déjà contacté beaucoup de personnes aujourd'hui. Réessaie demain.";
export const MESSAGE_EMPTY = "Écris un message avant de l'envoyer.";
export const MESSAGE_TOO_LONG = "Ton message est trop long : 2000 caractères au maximum.";
export const MESSAGE_CLOSED = "Cette personne n'a plus de compte : tu ne peux plus lui écrire.";
export const MESSAGE_RATE_LIMIT =
  "Tu envoies beaucoup de messages. Patiente un instant avant de réessayer.";
export const MESSAGE_NOT_PARTICIPANT = "Tu ne fais pas partie de cette conversation.";
export const MESSAGE_SEND_FAILED =
  "Le message n'a pas pu être envoyé. Ton texte est conservé : réessaie dans un instant.";
export const LOAN_CONVERSATION_GONE = "Cette conversation n'est plus disponible. Recharge la page.";
export const MESSAGE_CLOSED_LOAN =
  "Cette personne n'a plus de compte : le prêt ne peut plus être enregistré.";
export const LOAN_NOT_LOANABLE = "Cette annonce n'est pas une annonce de prêt.";
export const LOAN_ALREADY_OPEN = "Ce matériel est déjà prêté en ce moment.";
export const LOAN_LISTING_UNAVAILABLE =
  "Cette annonce n'est plus disponible : le prêt ne peut pas être enregistré.";
export const LOAN_DUE_DATE_INVALID = "La date de retour doit être à partir d'aujourd'hui.";
export const LOAN_NOT_FOUND = "Ce prêt n'existe plus. Recharge la page.";
export const LOAN_ALREADY_RETURNED = "Ce prêt est déjà marqué comme rendu.";
export const LOAN_FAILED = "Le prêt n'a pas pu être mis à jour. Réessaie dans un instant.";

function isSessionError(error: ErrorLike): boolean {
  return error.code === "PGRST301" || error.code === "PGRST303" || error.hint === "auth_required";
}

/** Erreur de start_conversation (clé `hint`, jamais le message). */
export function mapStartConversationError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.hint === "conversation_rate_limit" || error.code === "PT429" || error.status === 429) {
    return CONVERSATION_RATE_LIMIT;
  }
  if (error.hint === "own_listing") return CONTACT_OWN_LISTING;
  if (error.hint === "listing_unavailable") return CONTACT_LISTING_UNAVAILABLE;
  if (isSessionError(error)) return MESSAGING_SESSION_EXPIRED;
  return GENERIC_ERROR;
}

/** Erreur de l'envoi d'un message. */
export function mapSendMessageError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  if (error.hint === "message_rate_limit" || error.code === "PT429" || error.status === 429) {
    return MESSAGE_RATE_LIMIT;
  }
  if (error.hint === "conversation_closed") return MESSAGE_CLOSED;
  if (error.hint === "body_empty") return MESSAGE_EMPTY;
  if (error.hint === "body_too_long") return MESSAGE_TOO_LONG;
  if (isSessionError(error)) return MESSAGING_SESSION_EXPIRED;
  // 42501 sans clé : la politique d'écriture refuse (tu n'es pas dans la conversation).
  if (error.code === "42501" && !error.hint) return MESSAGE_NOT_PARTICIPANT;
  return MESSAGE_SEND_FAILED;
}

/** Erreur de start_loan ou return_loan. */
export function mapLoanError(error: ErrorLike): string {
  if (isNetworkError(error)) return NETWORK_ERROR;
  switch (error.hint) {
    case "conversation_not_found":
      return LOAN_CONVERSATION_GONE;
    case "conversation_closed":
      return MESSAGE_CLOSED_LOAN;
    case "listing_not_loanable":
      return LOAN_NOT_LOANABLE;
    case "loan_already_open":
      return LOAN_ALREADY_OPEN;
    case "listing_not_available":
      return LOAN_LISTING_UNAVAILABLE;
    case "due_date_invalid":
      return LOAN_DUE_DATE_INVALID;
    case "loan_not_found":
      return LOAN_NOT_FOUND;
    case "loan_already_returned":
      return LOAN_ALREADY_RETURNED;
  }
  if (isSessionError(error)) return MESSAGING_SESSION_EXPIRED;
  return LOAN_FAILED;
}
