import type { CitySummary } from "@/services/cities";

const MAX_POSTAL_CODES = 2;

/** « Lyon (69001, 69002…) » : codes postaux abrégés quand ils sont nombreux. */
export function formatCity({ name, postal_codes }: CitySummary): string {
  if (postal_codes.length === 0) return name;
  const shown = postal_codes.slice(0, MAX_POSTAL_CODES).join(", ");
  const more = postal_codes.length > MAX_POSTAL_CODES ? "…" : "";
  return `${name} (${shown}${more})`;
}
