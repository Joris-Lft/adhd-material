import { formatRelativeDate } from "./relative-date";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeDate", () => {
  it("formate en français selon l'ordre de grandeur", () => {
    expect(formatRelativeDate(ago(10_000), NOW)).toBe("à l'instant");
    expect(formatRelativeDate(ago(5 * MINUTE), NOW)).toBe("il y a 5 minutes");
    expect(formatRelativeDate(ago(3 * HOUR), NOW)).toBe("il y a 3 heures");
    expect(formatRelativeDate(ago(DAY), NOW)).toBe("hier");
    expect(formatRelativeDate(ago(4 * DAY), NOW)).toBe("il y a 4 jours");
    expect(formatRelativeDate(ago(65 * DAY), NOW)).toBe("il y a 2 mois");
    expect(formatRelativeDate(ago(800 * DAY), NOW)).toBe("il y a 2 ans");
  });

  it("ne plante pas sur une date invalide ou future", () => {
    expect(formatRelativeDate("nope", NOW)).toBe("");
    expect(formatRelativeDate(ago(-HOUR), NOW)).toBe("à l'instant");
  });
});
