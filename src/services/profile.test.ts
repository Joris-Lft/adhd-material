import { queryResult, supabaseMock } from "@/test/supabase-mock";
import { mapDisplayNameError } from "@/lib/messages";
import { DisplayNameError, updateDisplayName } from "./profile";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

describe("mapDisplayNameError", () => {
  it("23505 : pseudo déjà pris", () => {
    expect(mapDisplayNameError({ code: "23505" })).toBe("Ce pseudo est déjà pris");
  });

  it("23514 avec le message serveur : le reprend", () => {
    expect(mapDisplayNameError({ code: "23514", message: "Ce pseudo n'est pas disponible" })).toBe(
      "Ce pseudo n'est pas disponible",
    );
  });

  it("autre 23514 : contrainte de longueur", () => {
    expect(mapDisplayNameError({ code: "23514", message: "violates check constraint" })).toBe(
      "Entre 3 et 30 caractères",
    );
  });

  it("PT429 : affiche le message du serveur", () => {
    expect(
      mapDisplayNameError({
        code: "PT429",
        status: 429,
        message: "Trop de changements de pseudo.",
      }),
    ).toBe("Trop de changements de pseudo.");
  });

  it("erreur inconnue : message générique", () => {
    expect(mapDisplayNameError({ code: "XX000" })).toMatch(/Réessaie/);
  });
});

describe("updateDisplayName", () => {
  beforeEach(() => supabaseMock.resetMocks());

  it("lève DisplayNameError avec le message traduit", async () => {
    supabaseMock.from.mockReturnValue(
      queryResult({ data: null, error: { code: "23505" } }).builder,
    );
    await expect(updateDisplayName("u1", "Alex")).rejects.toThrow(
      new DisplayNameError("Ce pseudo est déjà pris"),
    );
  });

  it("met à jour sans jamais demander * ni city_id, et filtre sur l'id", async () => {
    const { builder, calls } = queryResult({
      data: [{ id: "u1", display_name: "Alex" }],
      error: null,
    });
    supabaseMock.from.mockReturnValue(builder);
    await updateDisplayName("u1", "Alex");
    expect(supabaseMock.from).toHaveBeenCalledWith("profiles");
    expect(calls).toEqual([
      { method: "update", args: [{ display_name: "Alex", display_name_confirmed: true }] },
      { method: "eq", args: ["id", "u1"] },
      { method: "select", args: ["id, display_name"] },
    ]);
  });

  it("exige exactement une ligne mise à jour", async () => {
    supabaseMock.from.mockReturnValue(queryResult({ data: [], error: null }).builder);
    await expect(updateDisplayName("u1", "Alex")).rejects.toBeInstanceOf(DisplayNameError);
  });
});
