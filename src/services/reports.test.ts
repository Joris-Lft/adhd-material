import { supabaseMock } from "@/test/supabase-mock";
import { REPORT_RATE_LIMIT } from "@/lib/messages";
import { ReportError, reportListing } from "./reports";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

beforeEach(() => supabaseMock.resetMocks());

describe("reportListing", () => {
  it("appelle report_listing avec la catégorie et les précisions", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const result = await reportListing({ listingId: "l1", category: "autre", details: "Bizarre" });
    expect(result).toEqual({ alreadyReported: false });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("report_listing", {
      p_listing_id: "l1",
      p_category: "autre",
      p_details: "Bizarre",
    });
  });

  it("n'envoie pas p_details quand il n'y en a pas", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    await reportListing({ listingId: "l1", category: "arnaque" });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("report_listing", {
      p_listing_id: "l1",
      p_category: "arnaque",
    });
  });

  it("already_reported : succès doux, pas une erreur", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", hint: "already_reported" },
    });
    await expect(reportListing({ listingId: "l1", category: "arnaque" })).resolves.toEqual({
      alreadyReported: true,
    });
  });

  it("erreur du serveur : ReportError avec le message traduit et la clé", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: "PT429", hint: "report_rate_limit" },
    });
    await expect(reportListing({ listingId: "l1", category: "arnaque" })).rejects.toMatchObject({
      message: REPORT_RATE_LIMIT,
      hint: "report_rate_limit",
    });
  });

  it("erreur réseau levée par fetch : ReportError, pas d'exception brute", async () => {
    supabaseMock.rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    const failure = await reportListing({ listingId: "l1", category: "arnaque" }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ReportError);
  });
});
