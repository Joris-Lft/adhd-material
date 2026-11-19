import { queryResult, supabaseMock } from "@/test/supabase-mock";
import { mapActivityError } from "@/lib/messages";
import { ActivityError, resolveActivity, searchActivities } from "./activities";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

beforeEach(() => supabaseMock.resetMocks());

describe("searchActivities", () => {
  it("appelle la RPC et renvoie les lignes", async () => {
    const rows = [{ id: "a1", name: "Crochet", similarity: 0.8 }];
    supabaseMock.rpc.mockResolvedValue({ data: rows, error: null });
    await expect(searchActivities("Croch")).resolves.toEqual(rows);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("search_activities", { q: "Croch" });
  });

  it("propage l'erreur", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(searchActivities("Croch")).rejects.toEqual({ message: "boom" });
  });
});

describe("resolveActivity", () => {
  it("existing : renvoie l'activité sans appel réseau", async () => {
    await expect(resolveActivity({ kind: "existing", id: "a1", name: "Crochet" })).resolves.toEqual(
      { id: "a1", name: "Crochet" },
    );
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("new : insère puis renvoie id et nom", async () => {
    const { builder, calls } = queryResult({ data: { id: "a9", name: "Poterie" }, error: null });
    supabaseMock.from.mockReturnValue(builder);
    await expect(resolveActivity({ kind: "new", name: "Poterie" })).resolves.toEqual({
      id: "a9",
      name: "Poterie",
    });
    expect(supabaseMock.from).toHaveBeenCalledWith("activities");
    expect(calls).toEqual([
      { method: "insert", args: [{ name: "Poterie" }] },
      { method: "select", args: ["id, name"] },
      { method: "single", args: [] },
    ]);
  });

  it("23505 : récupère l'activité identique apparue entre-temps", async () => {
    supabaseMock.from.mockReturnValue(
      queryResult({ data: null, error: { code: "23505" } }).builder,
    );
    supabaseMock.rpc.mockResolvedValue({
      data: [
        { id: "a2", name: "Poterie d'art", similarity: 0.6 },
        { id: "a1", name: "Œnologie", similarity: 0.9 },
      ],
      error: null,
    });
    // Casse, accents, ligatures et ponctuation de bord ignorés, comme côté base.
    await expect(resolveActivity({ kind: "new", name: "oenologie." })).resolves.toEqual({
      id: "a1",
      name: "Œnologie",
    });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("search_activities", { q: "oenologie." });
  });

  it("23505 sans résultat exact : erreur générique", async () => {
    supabaseMock.from.mockReturnValue(
      queryResult({ data: null, error: { code: "23505" } }).builder,
    );
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: "a2", name: "Poterie d'art", similarity: 0.6 }],
      error: null,
    });
    await expect(resolveActivity({ kind: "new", name: "Poterie" })).rejects.toThrow(
      new ActivityError("La création de l'activité a échoué. Réessaie dans un instant."),
    );
  });

  it("PT429 : reprend le message du serveur", async () => {
    supabaseMock.from.mockReturnValue(
      queryResult({
        data: null,
        error: { code: "PT429", message: "Trop de créations aujourd'hui." },
      }).builder,
    );
    await expect(resolveActivity({ kind: "new", name: "Poterie" })).rejects.toThrow(
      new ActivityError("Trop de créations aujourd'hui."),
    );
  });

  it("autre erreur : message générique", async () => {
    supabaseMock.from.mockReturnValue(
      queryResult({ data: null, error: { code: "XX000" } }).builder,
    );
    await expect(resolveActivity({ kind: "new", name: "Poterie" })).rejects.toBeInstanceOf(
      ActivityError,
    );
  });
});

describe("resolveActivity : échec de la RPC dans le repli 23505", () => {
  it("erreur générique", async () => {
    supabaseMock.resetMocks();
    supabaseMock.from.mockReturnValue(
      queryResult({ data: null, error: { code: "23505" } }).builder,
    );
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(resolveActivity({ kind: "new", name: "Poterie" })).rejects.toBeInstanceOf(
      ActivityError,
    );
  });
});

describe("mapActivityError", () => {
  it("distingue les deux contraintes 23514", () => {
    expect(
      mapActivityError({
        code: "23514",
        message: 'violates check constraint "activities_name_check"',
      }),
    ).toMatch(/entre 2 et 60/);
    expect(
      mapActivityError({
        code: "23514",
        message: 'violates check constraint "activities_name_normalized_length"',
      }),
    ).toMatch(/au moins 2 lettres/);
  });

  it("réseau", () => {
    expect(mapActivityError({ message: "TypeError: Failed to fetch" })).toMatch(/connexion/);
  });
});
