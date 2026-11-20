import { supabase } from "@/lib/supabase";
import {
  GENERIC_ERROR,
  PHOTO_FORMAT_UNSUPPORTED,
  mapListingError,
  mapPhotoUploadError,
  type ListingField,
} from "@/lib/messages";
import { photoExtension } from "@/features/listings/photos";
import { randomId } from "@/lib/random-id";
import { ActivityError, resolveActivity, type ActivityValue } from "@/services/activities";
import type { Database } from "@/types/database";

export type ListingKind = Database["public"]["Enums"]["listing_kind"];
export type ListingStep = "upload" | "publish";

const PHOTOS_BUCKET = "listing-photos";

/** Échec de publication ; `field` indique le champ du formulaire concerné quand on peut l'attribuer. */
export class ListingError extends Error {
  field?: ListingField;
  /** Issue incertaine : l'annonce a peut-être été créée, les photos doivent être conservées. */
  uncertain: boolean;
  constructor(message: string, field?: ListingField, uncertain = false) {
    super(message);
    this.field = field;
    this.uncertain = uncertain;
  }
}

export interface CreateListingCallbacks {
  onStep?: (step: ListingStep) => void;
  /** Appelé quand une activité nouvelle vient d'être créée : un réessai doit réutiliser la version en base. */
  onActivityResolved?: (activity: { id: string; name: string }) => void;
}

export interface CreateListingInput {
  userId: string;
  activity: NonNullable<ActivityValue>;
  kind: ListingKind;
  cityId: string;
  /** Photos déjà compressées, dans l'ordre d'affichage (la première est la couverture). */
  photos: Blob[];
  description?: string;
  experience?: string;
}

async function removePhotos(paths: string[]) {
  try {
    await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
  } catch {
    // Nettoyage au mieux : l'erreur d'origine reste celle affichée.
  }
}

/** Crée l'activité si besoin, envoie les photos puis publie l'annonce. Renvoie l'id de l'annonce. */
export async function createListing(
  input: CreateListingInput,
  { onStep, onActivityResolved }: CreateListingCallbacks = {},
): Promise<string> {
  let activity: { id: string; name: string };
  try {
    activity = await resolveActivity(input.activity);
  } catch (error) {
    throw new ListingError(
      error instanceof ActivityError ? error.message : GENERIC_ERROR,
      "activity",
    );
  }
  if (input.activity.kind === "new") onActivityResolved?.(activity);

  const extensions = input.photos.map((photo) => photoExtension(photo.type));
  if (extensions.some((extension) => !extension)) {
    throw new ListingError(PHOTO_FORMAT_UNSUPPORTED, "photos");
  }
  onStep?.("upload");
  const paths = extensions.map((extension) => `${input.userId}/${randomId()}.${extension}`);
  try {
    const uploads = await Promise.allSettled(
      paths.map(async (path, index) => {
        const photo = input.photos[index] as Blob;
        const { error } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (error) throw error;
      }),
    );
    const failed = uploads.find((upload) => upload.status === "rejected");
    if (failed) {
      throw new ListingError(mapPhotoUploadError(failed.reason ?? {}), "photos");
    }

    onStep?.("publish");
    const description = input.description?.trim();
    const experience = input.experience?.trim();
    let result;
    try {
      result = await supabase.rpc("create_listing", {
        p_activity_id: activity.id,
        p_kind: input.kind,
        p_city_id: input.cityId,
        p_photo_paths: paths,
        // Clé omise quand le champ est vide (le type de la RPC n'accepte pas null).
        ...(description ? { p_description: input.description } : {}),
        ...(experience ? { p_experience: input.experience } : {}),
      });
    } catch (error) {
      // Requête interrompue : on ignore si le serveur l'a traitée.
      result = { data: null, error: { message: error instanceof Error ? error.message : "" } };
    }
    if (result.error) {
      const { message, field, uncertain } = mapListingError(result.error);
      throw new ListingError(message, field, uncertain);
    }
    return result.data as string;
  } catch (error) {
    // Issue incertaine : l'annonce existe peut-être, ses photos ne doivent pas être supprimées.
    if (!(error instanceof ListingError && error.uncertain)) await removePhotos(paths);
    throw error;
  }
}
