/**
 * Connexion par email (code OTP à 8 chiffres) : désactivée par défaut, car elle exige les modèles
 * d'email personnalisés, refusés par Supabase cloud (offre gratuite) sans SMTP perso.
 * Active uniquement si VITE_AUTH_EMAIL_ENABLED vaut exactement "true". Lu à l'appel (testable).
 */
export function isEmailAuthEnabled(): boolean {
  return import.meta.env.VITE_AUTH_EMAIL_ENABLED === "true";
}
