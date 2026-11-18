import { fakeJwt } from "@/test/supabase-mock";
import { decodeJwtPayload, lastAuthTimestamp, needsReauth } from "./jwt";

const NOW_MS = 1_800_000_000_000;
const nowS = NOW_MS / 1000;

describe("decodeJwtPayload", () => {
  it("décode le payload base64url (accents compris)", () => {
    expect(decodeJwtPayload(fakeJwt({ sub: "u1", nom: "Éloïse" }))).toMatchObject({
      sub: "u1",
      nom: "Éloïse",
    });
  });

  it.each([undefined, null, "", "abc", "a.b.c", "a.%%%.c"])("renvoie null pour %j", (token) => {
    expect(decodeJwtPayload(token)).toBeNull();
  });
});

describe("lastAuthTimestamp", () => {
  it("prend le plus récent des amr[].timestamp", () => {
    const token = fakeJwt({
      amr: [
        { method: "otp", timestamp: 100 },
        { method: "oauth", timestamp: 300 },
      ],
    });
    expect(lastAuthTimestamp(token)).toBe(300);
  });

  it("renvoie null sans amr exploitable", () => {
    expect(lastAuthTimestamp(fakeJwt({}))).toBeNull();
    expect(lastAuthTimestamp(fakeJwt({ amr: "otp" }))).toBeNull();
    expect(
      lastAuthTimestamp(fakeJwt({ amr: [{ method: "otp", timestamp: "x" }, null] })),
    ).toBeNull();
  });
});

describe("needsReauth", () => {
  const tokenAgedBy = (seconds: number) =>
    fakeJwt({ amr: [{ method: "otp", timestamp: nowS - seconds }] });

  it("n'exige rien pour une authentification récente", () => {
    expect(needsReauth(tokenAgedBy(30), NOW_MS)).toBe(false);
    expect(needsReauth(tokenAgedBy(500), NOW_MS)).toBe(false);
  });

  it("exige une ré-authentification au-delà de la fenêtre (avec marge de 60 s)", () => {
    expect(needsReauth(tokenAgedBy(541), NOW_MS)).toBe(true);
    expect(needsReauth(tokenAgedBy(601), NOW_MS)).toBe(true);
    expect(needsReauth(tokenAgedBy(3 * 3600), NOW_MS)).toBe(true);
  });

  it("exige une ré-authentification si le jeton est absent ou illisible", () => {
    expect(needsReauth(undefined, NOW_MS)).toBe(true);
    expect(needsReauth("pas-un-jwt", NOW_MS)).toBe(true);
    expect(needsReauth(fakeJwt({ sub: "u" }), NOW_MS)).toBe(true);
  });
});
