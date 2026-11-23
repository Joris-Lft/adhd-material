import { useEffect, useRef } from "react";

/** En dessous, un onglet resté caché n'a rien pu manquer d'important : pas de rattrapage. */
const MIN_HIDDEN_MS = 30_000;

/**
 * Appelle `callback` quand l'onglet redevient visible après avoir été caché au moins 30 s (rattrapage
 * après une mise en veille). Si on n'a pas vu l'onglet se cacher, on rattrape par prudence.
 * Volontairement indépendant de l'authentification : jamais sur SIGNED_IN, émis à chaque retour d'onglet.
 */
export function useOnTabVisible(callback: () => void, enabled = true) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    if (!enabled) return;
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenFor = hiddenAt === null ? Infinity : Date.now() - hiddenAt;
      hiddenAt = null;
      if (hiddenFor >= MIN_HIDDEN_MS) latest.current();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [enabled]);
}
