import type { ListingKind } from "@/services/listings";

export const RADIUS_OPTIONS = [0, 10, 25, 50, 100] as const;
export const DEFAULT_RADIUS = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | null | undefined): value is string =>
  !!value && UUID.test(value);

/** Valeur de `ville` pour « Toute la France » : force les annonces récentes malgré une ville de profil. */
export const ALL_FRANCE = "toutes";

export interface ListingFilters {
  cityId: string | null;
  /** « Toute la France » choisi explicitement (`ville=toutes`). */
  allFrance: boolean;
  radius: number;
  activityId: string | null;
  kind: ListingKind | null;
}

export const radiusLabel = (km: number) => (km === 0 ? "Ma commune seulement" : `${km} km`);

/** Filtres lus dans l'URL ; toute valeur invalide est ignorée (valeur par défaut). */
export function parseFilters(params: URLSearchParams): ListingFilters {
  const rawRadius = params.get("rayon");
  const radius = rawRadius === null || rawRadius.trim() === "" ? NaN : Number(rawRadius);
  const type = params.get("type");
  const city = params.get("ville");
  const activity = params.get("activite");
  return {
    cityId: isUuid(city) ? city : null,
    allFrance: city === ALL_FRANCE,
    radius: RADIUS_OPTIONS.some((option) => option === radius) ? radius : DEFAULT_RADIUS,
    activityId: isUuid(activity) ? activity : null,
    kind: type === "don" || type === "pret" ? type : null,
  };
}

/** Écrit un changement de filtre dans les paramètres : les valeurs par défaut n'encombrent pas l'URL. */
export function withFilterChange(
  params: URLSearchParams,
  change: Partial<ListingFilters>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  if ("cityId" in change) set("ville", change.cityId ?? null);
  if (change.allFrance) set("ville", ALL_FRANCE);
  if ("activityId" in change) set("activite", change.activityId ?? null);
  if ("kind" in change) set("type", change.kind ?? null);
  if ("radius" in change) {
    set(
      "rayon",
      change.radius === undefined || change.radius === DEFAULT_RADIUS
        ? null
        : String(change.radius),
    );
  }
  return next;
}
