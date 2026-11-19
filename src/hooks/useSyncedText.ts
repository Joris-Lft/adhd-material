import { useState } from "react";

/**
 * Texte d'un champ de sélection : suit `value` quand il change de l'extérieur (reset, pré-remplissage),
 * sans écraser la frappe (qui remet elle-même la valeur à null via `markTyped`).
 */
export function useSyncedText(value: { name: string } | null) {
  const [text, setText] = useState(value?.name ?? "");
  const [previous, setPrevious] = useState(value);
  const [typed, setTyped] = useState(false);

  if (value !== previous) {
    setPrevious(value);
    setTyped(false);
    if (value) setText(value.name);
    else if (!typed) setText("");
  }
  return { text, setText, markTyped: () => setTyped(true) };
}
