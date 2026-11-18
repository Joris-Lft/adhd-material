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
    return error.message || "Trop de tentatives, réessaie dans un instant.";
  }
  if (error.code === "23505") return DISPLAY_NAME_TAKEN;
  if (error.code === "23514") {
    return error.message?.includes(DISPLAY_NAME_UNAVAILABLE)
      ? DISPLAY_NAME_UNAVAILABLE
      : DISPLAY_NAME_LENGTH;
  }
  return DISPLAY_NAME_SAVE_FAILED;
}
