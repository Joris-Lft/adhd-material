export const DELETED_MEMBER = "Membre supprimé";

const dateFormatter = new Intl.DateTimeFormat("fr", { dateStyle: "long" });
const timeFormatter = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });
const shortDateTimeFormatter = new Intl.DateTimeFormat("fr", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 23 novembre 2026 ». */
export function formatDay(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Heure seule le jour même, sinon jour et heure. */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? timeFormatter.format(date)
    : shortDateTimeFormatter.format(date);
}

/** Aujourd'hui au format `YYYY-MM-DD` (heure locale), pour l'attribut `min` d'un champ date. */
export function todayInputValue(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Fin de journée locale d'une date `YYYY-MM-DD`, en ISO : le prêt doit finir après « maintenant ». */
export function endOfLocalDayIso(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}
