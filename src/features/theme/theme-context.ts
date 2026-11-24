import { createContext, useContext } from "react";
import type { EffectiveTheme, ThemeChoice } from "./theme";

export interface ThemeState {
  choice: ThemeChoice;
  /** Thème réellement affiché (« auto » résolu selon l'appareil). */
  theme: EffectiveTheme;
  setChoice: (choice: ThemeChoice) => void;
}

// Valeurs par défaut silencieuses : un composant hors ThemeProvider (tests) reste en clair, sans erreur.
export const ThemeContext = createContext<ThemeState>({
  choice: "auto",
  theme: "light",
  setChoice: () => {},
});

export const useTheme = () => useContext(ThemeContext);
