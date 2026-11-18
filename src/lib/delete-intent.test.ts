import { clearDeleteIntent, hasDeleteIntent, rememberDeleteIntent } from "./delete-intent";

describe("intention de suppression", () => {
  beforeEach(() => localStorage.clear());

  it("n'existe pas par défaut ni sans utilisateur", () => {
    expect(hasDeleteIntent("u1")).toBe(false);
    expect(hasDeleteIntent(undefined)).toBe(false);
  });

  it("est valable pour le même utilisateur seulement", () => {
    rememberDeleteIntent("u1");
    expect(hasDeleteIntent("u1")).toBe(true);
    expect(hasDeleteIntent("u2")).toBe(false);
  });

  it("expire au bout de 10 minutes", () => {
    rememberDeleteIntent("u1");
    expect(hasDeleteIntent("u1", Date.now() + 9 * 60 * 1000)).toBe(true);
    expect(hasDeleteIntent("u1", Date.now() + 11 * 60 * 1000)).toBe(false);
  });

  it("s'efface et ignore un contenu corrompu", () => {
    rememberDeleteIntent("u1");
    clearDeleteIntent();
    expect(hasDeleteIntent("u1")).toBe(false);
    localStorage.setItem("adhd-material:suppression", "{pas du json");
    expect(hasDeleteIntent("u1")).toBe(false);
  });
});
