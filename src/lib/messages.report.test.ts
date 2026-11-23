import {
  GENERIC_ERROR,
  MESSAGING_SESSION_EXPIRED,
  NETWORK_ERROR,
  REPORT_CATEGORY_INVALID,
  REPORT_DETAILS_REQUIRED,
  REPORT_DETAILS_TOO_LONG,
  REPORT_DETAILS_TOO_SHORT,
  REPORT_FAILED,
  REPORT_LISTING_UNAVAILABLE,
  REPORT_OWN_LISTING,
  REPORT_RATE_LIMIT,
  mapReportError,
} from "./messages";

describe("mapReportError", () => {
  it.each([
    [{ code: "42501", hint: "auth_required" }, MESSAGING_SESSION_EXPIRED],
    [{ code: "42501" }, MESSAGING_SESSION_EXPIRED],
    [{ code: "PGRST301" }, MESSAGING_SESSION_EXPIRED],
    [{ code: "23514", hint: "listing_unavailable" }, REPORT_LISTING_UNAVAILABLE],
    [{ code: "23514", hint: "own_listing" }, REPORT_OWN_LISTING],
    [{ code: "23514", hint: "details_required" }, REPORT_DETAILS_REQUIRED],
    [{ code: "23514", hint: "details_too_short" }, REPORT_DETAILS_TOO_SHORT],
    [{ code: "23514", hint: "details_too_long" }, REPORT_DETAILS_TOO_LONG],
    [{ code: "22023", hint: "category_invalid" }, REPORT_CATEGORY_INVALID],
    [{ code: "PT429", hint: "report_rate_limit" }, REPORT_RATE_LIMIT],
    [{ code: "PT429" }, REPORT_RATE_LIMIT],
    [{ status: 429 }, REPORT_RATE_LIMIT],
    [{ message: "TypeError: Failed to fetch" }, NETWORK_ERROR],
    [{ code: "XX000", hint: "inconnu" }, REPORT_FAILED],
  ])("%j", (error, expected) => {
    expect(mapReportError(error)).toBe(expected);
  });

  it("ne se fie jamais au texte du message", () => {
    expect(mapReportError({ code: "23514", message: "own_listing" })).toBe(REPORT_FAILED);
    expect(REPORT_FAILED).not.toBe(GENERIC_ERROR);
  });
});
