import { parseFilters, withFilterChange } from "./listing-filters";

const ID = "11111111-1111-4111-8111-111111111111";

describe("filtres d'annonces", () => {
  it("lit des valeurs valides", () => {
    expect(
      parseFilters(new URLSearchParams(`ville=${ID}&rayon=50&activite=${ID}&type=pret`)),
    ).toEqual({ cityId: ID, allFrance: false, radius: 50, activityId: ID, kind: "pret" });
  });

  it("ignore les valeurs invalides", () => {
    expect(parseFilters(new URLSearchParams("ville=abc&rayon=33&activite=%27&type=troc"))).toEqual({
      cityId: null,
      allFrance: false,
      radius: 25,
      activityId: null,
      kind: null,
    });
    expect(parseFilters(new URLSearchParams("rayon=abc")).radius).toBe(25);
    expect(parseFilters(new URLSearchParams("type=tout")).kind).toBeNull();
  });

  it("sans paramètre ou paramètre vide : 25 km par défaut (pas 0)", () => {
    expect(parseFilters(new URLSearchParams("")).radius).toBe(25);
    expect(parseFilters(new URLSearchParams("rayon=")).radius).toBe(25);
  });

  it("« Toute la France » : ville=toutes, sans ville, et écrit dans l'URL", () => {
    expect(parseFilters(new URLSearchParams("ville=toutes"))).toMatchObject({
      cityId: null,
      allFrance: true,
    });
    const next = withFilterChange(new URLSearchParams(`ville=${ID}&rayon=50`), {
      cityId: null,
      allFrance: true,
    });
    expect(next.get("ville")).toBe("toutes");
    expect(withFilterChange(next, { cityId: ID, allFrance: false }).get("ville")).toBe(ID);
  });

  it("accepte 0 km (ma commune seulement)", () => {
    expect(parseFilters(new URLSearchParams("rayon=0")).radius).toBe(0);
  });

  it("écrit les changements et retire les valeurs par défaut", () => {
    const start = new URLSearchParams(`ville=${ID}&rayon=50&type=don&autre=1`);
    expect(withFilterChange(start, { radius: 25 }).toString()).toBe(`ville=${ID}&type=don&autre=1`);
    expect(withFilterChange(start, { kind: null }).get("type")).toBeNull();
    expect(withFilterChange(start, { radius: 0 }).get("rayon")).toBe("0");
    expect(withFilterChange(start, { activityId: ID }).get("activite")).toBe(ID);
    expect(withFilterChange(start, { cityId: null }).get("ville")).toBeNull();
    expect(withFilterChange(start, { cityId: null }).get("autre")).toBe("1");
  });
});
