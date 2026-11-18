import {
  buildLoginUrl,
  clearNextPath,
  rememberNextPath,
  resolveNextPath,
  sanitizeNextPath,
} from "./next-path";

describe("sanitizeNextPath", () => {
  it("accepte les chemins internes (avec query et hash)", () => {
    expect(sanitizeNextPath("/profil")).toBe("/profil");
    expect(sanitizeNextPath("/annonces?q=peinture#haut")).toBe("/annonces?q=peinture#haut");
    expect(sanitizeNextPath("/profil?suppression=1")).toBe("/profil?suppression=1");
  });

  it.each([
    "https://evil.example/",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "profil",
    "",
    "/ab\ncd",
    "/\t/evil.example",
    "/.//evil.example",
    "/..//evil.example",
    "/%2e//evil.example",
    "/%2E%2e/x",
    "/x/..//evil.example",
    "/a/./b",
  ])("refuse %j", (value) => {
    expect(sanitizeNextPath(value)).toBeNull();
  });

  it("refuse null / undefined", () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
  });

  it("refuse les pages d'authentification (boucle de redirection)", () => {
    expect(sanitizeNextPath("/connexion")).toBeNull();
    expect(sanitizeNextPath("/connexion?suivant=/x")).toBeNull();
    expect(sanitizeNextPath("/auth/callback")).toBeNull();
    expect(sanitizeNextPath("/bienvenue")).toBeNull();
  });
});

describe("resolveNextPath", () => {
  beforeEach(() => localStorage.clear());

  it("préfère ?suivant= valide", () => {
    rememberNextPath("/profil");
    expect(resolveNextPath("?suivant=%2Fannonces")).toBe("/annonces");
  });

  it("ignore un ?suivant= dangereux et retombe sur sessionStorage puis sur l'accueil", () => {
    expect(resolveNextPath("?suivant=https%3A%2F%2Fevil.example")).toBe("/");
    rememberNextPath("/profil");
    expect(resolveNextPath("?suivant=%2F%2Fevil.example")).toBe("/profil");
  });

  it("oublie la page mémorisée au bout de 15 minutes", () => {
    localStorage.setItem(
      "adhd-material:suivant",
      JSON.stringify({ path: "/profil", at: Date.now() - 16 * 60 * 1000 }),
    );
    expect(resolveNextPath("")).toBe("/");
    localStorage.setItem(
      "adhd-material:suivant",
      JSON.stringify({ path: "/profil", at: Date.now() - 5 * 60 * 1000 }),
    );
    expect(resolveNextPath("")).toBe("/profil");
  });

  it("ne mémorise pas un chemin dangereux et sait oublier", () => {
    rememberNextPath("//evil.example");
    expect(resolveNextPath("")).toBe("/");
    rememberNextPath("/profil");
    clearNextPath();
    expect(resolveNextPath("")).toBe("/");
  });
});

describe("buildLoginUrl", () => {
  it("encode la page demandée", () => {
    expect(buildLoginUrl("/profil?a=1")).toBe("/connexion?suivant=%2Fprofil%3Fa%3D1");
    expect(buildLoginUrl("//evil.example")).toBe("/connexion");
  });
});
