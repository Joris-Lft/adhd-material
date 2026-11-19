// Messages affichés à l'utilisateur (français, tutoiement) et mappings d'erreurs Supabase.

interface ErrorLike {
  name?: string;
  code?: string;
  status?: number;
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
