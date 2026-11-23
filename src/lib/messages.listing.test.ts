import {
  GENERIC_ERROR,
  LISTING_SESSION_EXPIRED,
  mapListingError,
  mapListingStatusError,
  LISTING_STATUS_FAILED,
  LISTING_STATUS_LOAN,
  LISTING_STATUS_PHOTO_REQUIRED,
  NETWORK_ERROR,
  mapPhotoUploadError,
} from "./messages";

describe("mapListingError", () => {
  const field = (hint: string) => mapListingError({ hint, code: "22023", message: "x" }).field;

  it.each([
    ["photos_count", "photos"],
    ["photo_path_missing", "photos"],
    ["photo_duplicate", "photos"],
    ["photo_path_forbidden", "photos"],
    ["photo_path_invalid", "photos"],
    ["photo_missing", "photos"],
    ["photo_in_use", "photos"],
    ["listing_photo_required", "photos"],
    ["activity_not_found", "activity"],
    ["city_not_found", "city"],
    ["text_too_long", "details"],
    ["auth_required", undefined],
    ["kind_required", "kind"],
  ])("clé %s : champ %s", (hint, expected) => {
    const result = mapListingError({ hint, code: "XX000", message: "message serveur" });
    expect(result.field).toBe(expected);
    expect(result.message).not.toBe("message serveur");
    expect(field(hint)).toBe(expected);
  });

  it("listing_rate_limit : message du serveur, sans champ", () => {
    expect(
      mapListingError({ hint: "listing_rate_limit", code: "PT429", message: "Limite atteinte" }),
    ).toEqual({ message: "Limite atteinte" });
  });

  it("la clé prime sur le code", () => {
    expect(mapListingError({ hint: "city_not_found", code: "23505" }).field).toBe("city");
  });

  it("replis par code quand la clé est absente ou inconnue", () => {
    expect(mapListingError({ code: "PT429", message: "Trop" })).toEqual({ message: "Trop" });
    expect(mapListingError({ status: 429 }).message).toMatch(/Trop de tentatives/);
    expect(mapListingError({ code: "42501" }).message).toMatch(/Reconnecte-toi/);
    expect(mapListingError({ code: "23505", hint: "inconnue" }).field).toBe("photos");
    expect(mapListingError({ code: "23503" })).toEqual({ message: expect.any(String) });
    expect(mapListingError({ code: "22023", message: "Une photo…" }).field).toBeUndefined();
    expect(mapListingError({ code: "XX000" }).message).toMatch(/Quelque chose n'a pas marché/);
  });

  it("issue incertaine (réseau, passerelle, sans SQLSTATE) : message dédié, uncertain", () => {
    for (const error of [
      { message: "Failed to fetch" },
      { status: 0 },
      { status: 503, code: "XX000" },
      { status: 502 },
      { code: "", message: "Bad Gateway" },
    ]) {
      const result = mapListingError(error);
      expect(result.uncertain).toBe(true);
      expect(result.message).toMatch(/On n'a pas pu confirmer la publication/);
    }
  });

  it("une erreur métier n'est jamais incertaine", () => {
    for (const error of [
      { code: "23503", hint: "city_not_found" },
      { code: "XX000" },
      { code: "PT429" },
      { code: "42501" },
      { code: "PGRST202" },
      { code: "PGRST301" },
    ]) {
      expect(mapListingError(error).uncertain).toBeUndefined();
    }
  });

  it("refus PostgREST avant transaction : session expirée ou erreur générique", () => {
    expect(mapListingError({ code: "PGRST301" }).message).toBe(LISTING_SESSION_EXPIRED);
    expect(mapListingError({ code: "PGRST303" }).message).toBe(LISTING_SESSION_EXPIRED);
    expect(mapListingError({ code: "PGRST202" }).message).toBe(GENERIC_ERROR);
  });
});

describe("mapPhotoUploadError", () => {
  it("réseau, trop lourd, autre", () => {
    expect(mapPhotoUploadError({ message: "Failed to fetch" })).toMatch(/Pas de connexion/);
    expect(mapPhotoUploadError({ status: 413 })).toMatch(/trop lourde/);
    expect(mapPhotoUploadError({ status: 500 })).toMatch(/L'envoi des photos a échoué/);
  });
});

describe("mapListingStatusError", () => {
  it("23514 avec la clé listing_photo_required : photo manquante", () => {
    expect(
      mapListingStatusError({ code: "23514", hint: "listing_photo_required", message: "x" }),
    ).toBe(LISTING_STATUS_PHOTO_REQUIRED);
  });

  it("23514 sans clé : garde « prêtée »", () => {
    expect(mapListingStatusError({ code: "23514", message: "Un prêt est en cours" })).toBe(
      LISTING_STATUS_LOAN,
    );
  });

  it("réseau, session expirée, autre erreur", () => {
    expect(mapListingStatusError({ message: "TypeError: Failed to fetch" })).toBe(NETWORK_ERROR);
    expect(mapListingStatusError({ status: 0 })).toBe(NETWORK_ERROR);
    expect(mapListingStatusError({ code: "42501" })).toBe(LISTING_SESSION_EXPIRED);
    expect(mapListingStatusError({ code: "PGRST301" })).toBe(LISTING_SESSION_EXPIRED);
    expect(mapListingStatusError({ code: "XX000" })).toBe(LISTING_STATUS_FAILED);
  });
});
