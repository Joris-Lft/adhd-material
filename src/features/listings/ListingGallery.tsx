import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { listingPhotoUrl, type ListingPhoto } from "@/services/listing-reads";
import { photoAlt } from "./listing-labels";

/** Galerie sans carrousel : une grande photo et, au-delà d'une photo, des vignettes-boutons. */
export function ListingGallery({
  photos,
  activityName,
}: {
  photos: ListingPhoto[];
  activityName: string;
}) {
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)];
  if (!current) {
    return (
      <div className="flex aspect-4/3 w-full items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <ImageOff className="size-10" aria-hidden="true" />
      </div>
    );
  }
  const alt =
    photos.length > 1
      ? `${photoAlt(activityName)} (${photos.indexOf(current) + 1} sur ${photos.length})`
      : photoAlt(activityName);
  return (
    <div className="space-y-3">
      <img
        src={listingPhotoUrl(current.path)}
        alt={alt}
        className="aspect-4/3 w-full rounded-xl bg-muted object-cover"
      />
      {photos.length > 1 && (
        <ul className="flex gap-2" aria-label="Photos de l'annonce">
          {photos.map((photo, position) => (
            <li key={photo.id}>
              <button
                type="button"
                aria-label={`Voir la photo ${position + 1} sur ${photos.length}`}
                aria-pressed={photo === current}
                onClick={() => setIndex(position)}
                className={cn(
                  "block size-16 overflow-hidden rounded-md border-2 border-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  photo === current && "border-primary",
                )}
              >
                <img
                  src={listingPhotoUrl(photo.path)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
