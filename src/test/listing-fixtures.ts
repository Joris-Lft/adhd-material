import { supabaseMock } from "@/test/supabase-mock";

export const ID = {
  lyon: "11111111-1111-4111-8111-111111111111",
  crochet: "22222222-2222-4222-8222-222222222222",
  listing: "33333333-3333-4333-8333-333333333333",
  conversation: "44444444-4444-4444-8444-444444444444",
};

/** Le client mocké expose l'URL publique d'une photo sous https://img.test/. */
export function mockPublicStorage() {
  supabaseMock.storage.from.mockReturnValue({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://img.test/${path}` } }),
  });
}

/** Ligne renvoyée par la RPC search_listings. */
export function rpcRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `listing-${index}`,
    owner_id: "owner-1",
    owner_display_name: "Alex",
    activity_id: ID.crochet,
    activity_name: `Activité ${index}`,
    kind: "don",
    status: "disponible",
    city_id: ID.lyon,
    city_name: "Lyon",
    postal_codes: ["69001"],
    description: null,
    experience: null,
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    distance_km: 0,
    cover_photo_path: `u/photo-${index}.webp`,
    ...overrides,
  };
}

/** Ligne de lecture directe de `listings` avec relations embarquées. */
export function directRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `listing-${index}`,
    kind: "don",
    status: "disponible",
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    activities: { name: `Activité ${index}` },
    cities: { name: "Lyon" },
    listing_photos: [{ storage_path: `u/photo-${index}.webp`, position: 1 }],
    profiles: { display_name: "Alex" },
    ...overrides,
  };
}

export function profileRpc(cityId: string | null) {
  return {
    maybeSingle: () =>
      Promise.resolve({
        data: { id: "user-1", display_name: "Alex", display_name_confirmed: true, city_id: cityId },
        error: null,
      }),
  };
}

/** Ligne de lecture directe de la fiche (`fetchListing`). */
export function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID.listing,
    owner_id: "owner-1",
    kind: "don",
    status: "disponible",
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    description: "Crochets et laine.\nPatrons débutant inclus.",
    experience: "Arrêté après 3 semaines.\n\nTrop de comptage.",
    activities: { name: "Crochet" },
    cities: { name: "Paris", postal_codes: ["75001", "75002", "75003"] },
    listing_photos: [{ id: "p1", storage_path: "u/a.webp", position: 1 }],
    profiles: { display_name: "Alice" },
    ...overrides,
  };
}
