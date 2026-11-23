/** Clés TanStack Query des annonces : invalider `all` rafraîchit listes, fiche et « Mes annonces ». */
export const listingKeys = {
  all: ["listings"] as const,
  feed: (filters: unknown) => ["listings", "feed", filters] as const,
  detail: (id: string) => ["listings", "detail", id] as const,
  mine: (userId: string | undefined) => ["listings", "mine", userId] as const,
};
