import { cleanActivityName, isCreatableActivityName, normalizeActivityName } from "./activity-name";

const ZWSP = String.fromCharCode(0x200b);
const SOFT_HYPHEN = String.fromCharCode(0xad);
const NBSP = String.fromCharCode(0xa0);
const BIDI = String.fromCharCode(0x202e);

describe("cleanActivityName", () => {
  it("réduit les espaces et retire les caractères invisibles", () => {
    expect(cleanActivityName("  Jeux   de  société ")).toBe("Jeux de société");
    expect(cleanActivityName(`Cro${ZWSP}chet${SOFT_HYPHEN}${BIDI}`)).toBe("Crochet");
    expect(cleanActivityName(`Jeux${NBSP}de rôle`)).toBe("Jeux de rôle");
  });
});

describe("normalizeActivityName", () => {
  it("ignore casse, accents et ponctuation de bord", () => {
    expect(normalizeActivityName(" ÉCHECS ")).toBe("echecs");
    expect(normalizeActivityName("Échecs.")).toBe(normalizeActivityName("echecs"));
    expect(normalizeActivityName("  -- Crochet ! ")).toBe("crochet");
  });

  it("développe les ligatures", () => {
    expect(normalizeActivityName("Œnologie")).toBe(normalizeActivityName("oenologie"));
    expect(normalizeActivityName("Cæsar")).toBe("caesar");
    expect(normalizeActivityName("Straße")).toBe("strasse");
  });
});

describe("isCreatableActivityName", () => {
  it("exige 2 à 60 caractères et 2 caractères utiles une fois normalisé", () => {
    expect(isCreatableActivityName("Ab")).toBe(true);
    expect(isCreatableActivityName("A")).toBe(false);
    expect(isCreatableActivityName("!!")).toBe(false);
    expect(isCreatableActivityName("x".repeat(60))).toBe(true);
    expect(isCreatableActivityName("x".repeat(61))).toBe(false);
  });
});
