import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyTheme,
  DARK_QUERY,
  readThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  systemPrefersDark,
  writeThemeChoice,
  type ThemeChoice,
} from "./theme";
import { ThemeContext } from "./theme-context";

/** Source unique du thème : choix de l'utilisateur, préférence de l'appareil, classe `.dark`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readThemeChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const theme = resolveTheme(choice, systemDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Autre onglet : le choix mémorisé change, on le suit (sans réécrire le stockage).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // key === null : localStorage.clear().
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      setChoiceState(readThemeChoice());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeThemeChoice(next);
  }, []);

  const value = useMemo(() => ({ choice, theme, setChoice }), [choice, theme, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
