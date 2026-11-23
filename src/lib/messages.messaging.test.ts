import {
  CONTACT_LISTING_UNAVAILABLE,
  CONTACT_OWN_LISTING,
  CONVERSATION_RATE_LIMIT,
  GENERIC_ERROR,
  LOAN_ALREADY_OPEN,
  LOAN_ALREADY_RETURNED,
  LOAN_CONVERSATION_GONE,
  LOAN_DUE_DATE_INVALID,
  LOAN_FAILED,
  LOAN_LISTING_UNAVAILABLE,
  LOAN_NOT_FOUND,
  LOAN_NOT_LOANABLE,
  MESSAGE_CLOSED,
  MESSAGE_CLOSED_LOAN,
  MESSAGE_EMPTY,
  MESSAGE_NOT_PARTICIPANT,
  MESSAGE_RATE_LIMIT,
  MESSAGE_SEND_FAILED,
  MESSAGE_TOO_LONG,
  MESSAGING_SESSION_EXPIRED,
  NETWORK_ERROR,
  mapLoanError,
  mapSendMessageError,
  mapStartConversationError,
} from "./messages";

describe("mapStartConversationError", () => {
  it.each([
    [{ code: "23514", hint: "own_listing" }, CONTACT_OWN_LISTING],
    [{ code: "23514", hint: "listing_unavailable" }, CONTACT_LISTING_UNAVAILABLE],
    [{ code: "PT429", hint: "conversation_rate_limit" }, CONVERSATION_RATE_LIMIT],
    [{ code: "PT429" }, CONVERSATION_RATE_LIMIT],
    [{ code: "42501", hint: "auth_required" }, MESSAGING_SESSION_EXPIRED],
    [{ code: "PGRST301" }, MESSAGING_SESSION_EXPIRED],
    [{ message: "TypeError: Failed to fetch" }, NETWORK_ERROR],
    [{ code: "XX000", hint: "inconnu" }, GENERIC_ERROR],
  ])("%j", (error, expected) => {
    expect(mapStartConversationError(error)).toBe(expected);
  });

  it("ne se fie jamais au texte du message", () => {
    expect(mapStartConversationError({ code: "23514", message: "own_listing" })).toBe(
      GENERIC_ERROR,
    );
  });
});

describe("mapSendMessageError", () => {
  it.each([
    [{ code: "23514", hint: "body_empty" }, MESSAGE_EMPTY],
    [{ code: "23514", hint: "body_too_long" }, MESSAGE_TOO_LONG],
    [{ code: "42501", hint: "conversation_closed" }, MESSAGE_CLOSED],
    [{ code: "PT429", hint: "message_rate_limit" }, MESSAGE_RATE_LIMIT],
    [{ code: "42501" }, MESSAGE_NOT_PARTICIPANT],
    [{ code: "42501", hint: "auth_required" }, MESSAGING_SESSION_EXPIRED],
    [{ message: "NetworkError when attempting to fetch resource." }, NETWORK_ERROR],
    [{ code: "XX000" }, MESSAGE_SEND_FAILED],
  ])("%j", (error, expected) => {
    expect(mapSendMessageError(error)).toBe(expected);
  });
});

describe("mapLoanError", () => {
  it.each([
    ["conversation_not_found", LOAN_CONVERSATION_GONE],
    ["conversation_closed", MESSAGE_CLOSED_LOAN],
    ["listing_not_loanable", LOAN_NOT_LOANABLE],
    ["loan_already_open", LOAN_ALREADY_OPEN],
    ["listing_not_available", LOAN_LISTING_UNAVAILABLE],
    ["due_date_invalid", LOAN_DUE_DATE_INVALID],
    ["loan_not_found", LOAN_NOT_FOUND],
    ["loan_already_returned", LOAN_ALREADY_RETURNED],
    ["auth_required", MESSAGING_SESSION_EXPIRED],
    ["autre", LOAN_FAILED],
  ])("clé %s", (hint, expected) => {
    expect(mapLoanError({ code: "23514", hint })).toBe(expected);
  });

  it("réseau", () => {
    expect(mapLoanError({ message: "Load failed" })).toBe(NETWORK_ERROR);
  });
});
