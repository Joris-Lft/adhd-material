import { supabase } from "@/lib/supabase";
import type { ListingKind, ListingStatus } from "@/services/listings";
import type { Database } from "@/types/database";

export const PAGE_SIZE = 24;
const PHOTOS_BUCKET = "listing-photos";
const PUBLIC_STATUSES: ListingStatus[] = ["disponible", "reservee"];

/** Données d'une carte d'annonce, quelle que soit la source (RPC de recherche ou lecture directe). */
export interface ListingSummary {
  id: string;
  kind: ListingKind;
  status: ListingStatus;
  createdAt: string;
  activityName: string;
  cityName: string;
  /** Distance à la ville de recherche ; null hors recherche géographique. */
  distanceKm: number | null;
  coverPath: string | null;
  ownerName: string | null;
}

export interface ListingPhoto {
  id: string;
  path: string;
  position: number;
}

export interface ListingDetail {
  id: string;
  ownerId: string | null;
  ownerName: string | null;
  kind: ListingKind;
  status: ListingStatus;
  createdAt: string;
  activityName: string;
  cityName: string;
  postalCodes: string[];
  description: string | null;
  experience: string | null;
  photos: ListingPhoto[];
}

export interface FeedFilters {
  activityId: string | null;
  kind: ListingKind | null;
}

export function listingPhotoUrl(path: string): string {
  return supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

type SearchRow = Database["public"]["Functions"]["search_listings"]["Returns"][number];

/** Annonces proches d'une ville, triées par distance puis par date. */
export async function searchListings(
  params: FeedFilters & { cityId: string; radiusKm: number; offset: number },
): Promise<ListingSummary[]> {
  const { data, error } = await supabase.rpc("search_listings", {
    p_city_id: params.cityId,
    p_radius_km: params.radiusKm,
    p_limit: PAGE_SIZE,
    p_offset: params.offset,
    ...(params.activityId ? { p_activity_id: params.activityId } : {}),
    ...(params.kind ? { p_kind: params.kind } : {}),
  });
  if (error) throw error;
  return data.map((row: SearchRow) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    activityName: row.activity_name,
    cityName: row.city_name,
    distanceKm: row.distance_km,
    coverPath: row.cover_photo_path ?? null,
    ownerName: row.owner_display_name,
  }));
}

// Colonnes lisibles avec la clé publique : profiles(id, display_name), activities(id, name), cities.
const SUMMARY_SELECT =
  "id, kind, status, created_at, activities(name), cities(name), listing_photos(storage_path, position)";

interface SummaryRow {
  id: string;
  kind: ListingKind;
  status: ListingStatus;
  created_at: string;
  activities: { name: string } | null;
  cities: { name: string } | null;
  listing_photos: { storage_path: string; position: number }[];
  profiles?: { display_name: string } | null;
}

function toSummary(row: SummaryRow): ListingSummary {
  const cover = [...row.listing_photos].sort((a, b) => a.position - b.position)[0];
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    activityName: row.activities?.name ?? "",
    cityName: row.cities?.name ?? "",
    distanceKm: null,
    coverPath: cover?.storage_path ?? null,
    ownerName: row.profiles?.display_name ?? null,
  };
}

/** Annonces les plus récentes de toute la France (repli sans ville). */
export async function fetchRecentListings(
  params: FeedFilters & { offset: number },
): Promise<ListingSummary[]> {
  let query = supabase
    .from("listings")
    .select(`${SUMMARY_SELECT}, profiles!listings_owner_id_fkey(display_name)`)
    .in("status", PUBLIC_STATUSES);
  if (params.activityId) query = query.eq("activity_id", params.activityId);
  if (params.kind) query = query.eq("kind", params.kind);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .order("position", { referencedTable: "listing_photos" })
    .limit(1, { referencedTable: "listing_photos" })
    .range(params.offset, params.offset + PAGE_SIZE - 1);
  if (error) throw error;
  return data.map(toSummary);
}

/** Toutes les annonces de l'utilisateur, archivées comprises (la RLS ne montre que les siennes). */
export async function fetchMyListings(userId: string): Promise<ListingSummary[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(SUMMARY_SELECT)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .order("position", { referencedTable: "listing_photos" })
    .limit(1, { referencedTable: "listing_photos" });
  if (error) throw error;
  return data.map(toSummary);
}

/** Fiche d'une annonce ; null si elle n'existe pas ou n'est pas visible (archivée d'un autre). */
export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, owner_id, kind, status, created_at, description, experience, activities(name), cities(name, postal_codes), listing_photos(id, storage_path, position), profiles!listings_owner_id_fkey(display_name)",
    )
    .eq("id", id)
    .order("position", { referencedTable: "listing_photos" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    ownerId: data.owner_id,
    ownerName: data.profiles?.display_name ?? null,
    kind: data.kind,
    status: data.status,
    createdAt: data.created_at,
    activityName: data.activities?.name ?? "",
    cityName: data.cities?.name ?? "",
    postalCodes: data.cities?.postal_codes ?? [],
    description: data.description,
    experience: data.experience,
    photos: [...data.listing_photos]
      .sort((a, b) => a.position - b.position)
      .map((photo) => ({ id: photo.id, path: photo.storage_path, position: photo.position })),
  };
}
