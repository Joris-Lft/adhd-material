import { endOfLocalDayIso, formatDay, formatMessageTime, todayInputValue } from "./format";

describe("format", () => {
  it("todayInputValue : date locale au format AAAA-MM-JJ", () => {
    expect(todayInputValue(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("endOfLocalDayIso : fin de journée locale, donc après « maintenant » pour aujourd'hui", () => {
    const iso = endOfLocalDayIso(todayInputValue());
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
    const end = new Date(iso);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  });

  it("formatDay : date longue en français", () => {
    expect(formatDay(new Date(2026, 10, 23, 12).toISOString())).toBe("23 novembre 2026");
  });

  it("formatMessageTime : l'heure seule le jour même, sinon jour et heure", () => {
    const now = new Date(2026, 10, 23, 15, 0);
    expect(formatMessageTime(new Date(2026, 10, 23, 9, 5).toISOString(), now)).toBe("09:05");
    expect(formatMessageTime(new Date(2026, 10, 20, 9, 5).toISOString(), now)).toMatch(/20 nov/);
  });
});
