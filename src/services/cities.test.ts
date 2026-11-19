import { queryResult, supabaseMock } from "@/test/supabase-mock";
import { fetchCity, searchCities } from "./cities";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

beforeEach(() => supabaseMock.resetMocks());

describe("searchCities", () => {
  it("appelle la RPC et renvoie les lignes", async () => {
    const rows = [{ id: "c1", insee_code: "69123", name: "Lyon", postal_codes: ["69001"] }];
    supabaseMock.rpc.mockResolvedValue({ data: rows, error: null });
    await expect(searchCities("Lyon")).resolves.toEqual(rows);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("search_cities", { q: "Lyon" });
  });

  it("propage l'erreur", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(searchCities("Lyon")).rejects.toEqual({ message: "boom" });
  });
});

describe("fetchCity", () => {
  it("lit la ville par id", async () => {
    const city = { id: "c1", name: "Lyon", postal_codes: ["69001"] };
    const { builder, calls } = queryResult({ data: city, error: null });
    supabaseMock.from.mockReturnValue(builder);
    await expect(fetchCity("c1")).resolves.toEqual(city);
    expect(supabaseMock.from).toHaveBeenCalledWith("cities");
    expect(calls).toContainEqual({ method: "select", args: ["id, name, postal_codes"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", "c1"] });
  });

  it("propage l'erreur", async () => {
    supabaseMock.from.mockReturnValue(queryResult({ data: null, error: { code: "X" } }).builder);
    await expect(fetchCity("c1")).rejects.toEqual({ code: "X" });
  });
});
