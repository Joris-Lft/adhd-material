const formatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 365 * 86_400 },
  { unit: "month", seconds: 30 * 86_400 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/** Date relative en français (« il y a 3 jours », « hier »), calculée par rapport à `now`. */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const elapsed = Math.round((now - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(elapsed)) return "";
  if (elapsed < 60) return "à l'instant";
  const { unit, seconds } = UNITS.find((candidate) => elapsed >= candidate.seconds) ?? UNITS[4]!;
  return formatter.format(-Math.floor(elapsed / seconds), unit);
}
