import type { ListingKind, ListingStatus } from "@/services/listings";

export const KIND_LABEL: Record<ListingKind, string> = { don: "Don", pret: "Prêt" };

/** Libellé du statut sur la fiche ; `disponible` n'a pas de badge. */
export const STATUS_LABEL: Record<ListingStatus, string> = {
  disponible: "Disponible",
  reservee: "Réservée",
  donnee: "Déjà donnée",
  pretee: "Prêtée en ce moment",
  archivee: "Archivée",
};

export const photoAlt = (activityName: string) =>
  `Photo : matériel de ${activityName.toLocaleLowerCase("fr")}`;

export function formatDistance(distanceKm: number | null, ownCity = false): string | null {
  if (distanceKm === null) return null;
  if (distanceKm === 0) return ownCity ? "Dans ta commune" : "Dans la commune";
  return `À ${Math.max(1, Math.round(distanceKm))} km`;
}
