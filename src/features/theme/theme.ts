export type ThemeChoice = "auto" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "adhd-material-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
// Garder en phase avec public/theme-init.js.
const THEME_COLOR: Record<EffectiveTheme, string> = { light: "#4f46e5", dark: "#12131d" };

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === "auto" || value === "light" || value === "dark";

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function writeThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Stockage indisponible : le choix vaut pour la session seulement.
  }
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): EffectiveTheme {
  return choice === "auto" ? (systemDark ? "dark" : "light") : choice;
}

export function applyTheme(theme: EffectiveTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}
