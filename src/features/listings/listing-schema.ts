import { z } from "@/lib/zod";
import type { ActivityValue } from "@/services/activities";
import type { CityValue } from "@/features/cities/CityPicker";
import type { ListingKind } from "@/services/listings";
import {
  LISTING_ACTIVITY_REQUIRED,
  LISTING_CITY_REQUIRED,
  LISTING_KIND_REQUIRED,
  LISTING_PHOTOS_MAX,
  LISTING_PHOTOS_REQUIRED,
  LISTING_TEXT_MAX,
} from "@/lib/messages";
import { MAX_PHOTOS, type PhotoItem } from "./photos";

export const LISTING_TEXT_LIMIT = 2000;

export const listingSchema = z.object({
  activity: z.custom<ActivityValue>((value) => value !== null && typeof value === "object", {
    error: LISTING_ACTIVITY_REQUIRED,
  }),
  kind: z.custom<ListingKind | null>((value) => value === "don" || value === "pret", {
    error: LISTING_KIND_REQUIRED,
  }),
  photos: z
    .array(z.custom<PhotoItem>())
    .min(1, LISTING_PHOTOS_REQUIRED)
    .max(MAX_PHOTOS, LISTING_PHOTOS_MAX),
  city: z.custom<CityValue | null>((value) => value !== null && typeof value === "object", {
    error: LISTING_CITY_REQUIRED,
  }),
  description: z.string().max(LISTING_TEXT_LIMIT, LISTING_TEXT_MAX),
  experience: z.string().max(LISTING_TEXT_LIMIT, LISTING_TEXT_MAX),
});

export type ListingFormValues = z.infer<typeof listingSchema>;
