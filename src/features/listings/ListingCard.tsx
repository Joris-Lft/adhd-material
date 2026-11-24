import { Link } from "react-router";
import { ImageOff, MapPin } from "lucide-react";
import { formatRelativeDate } from "@/lib/relative-date";
import { listingPhotoUrl, type ListingSummary } from "@/services/listing-reads";
import { KindBadge, StatusBadge } from "./ListingBadges";
import { formatDistance, photoAlt } from "./listing-labels";

interface ListingCardProps {
  listing: ListingSummary;
  /** Niveau du titre dans la page (h2 par défaut). */
  headingLevel?: "h2" | "h3";
  /** Vrai si la ville de recherche est celle du profil (« Dans ta commune » plutôt que « Dans la commune »). */
  ownCity?: boolean;
  /** Contenu sous la carte (ex. actions), hors de la zone cliquable. */
  children?: React.ReactNode;
}

/** Carte d'annonce : une seule zone cliquable (le titre, étendu à toute la carte). */
export function ListingCard({
  listing,
  headingLevel: Heading = "h2",
  ownCity = false,
  children,
}: ListingCardProps) {
  const distance = formatDistance(listing.distanceKm, ownCity);
  return (
    <article className="relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="aspect-4/3 w-full overflow-hidden rounded-t-xl bg-muted">
        {listing.coverPath ? (
          <img
            src={listingPhotoUrl(listing.coverPath)}
            alt={photoAlt(listing.activityName)}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Heading className="text-lg font-semibold wrap-break-word">
          <Link
            id={`listing-link-${listing.id}`}
            to={`/annonces/${listing.id}`}
            className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
          >
            {listing.activityName}
          </Link>
        </Heading>
        <div className="flex flex-wrap gap-2">
          <KindBadge kind={listing.kind} />
          <StatusBadge status={listing.status} />
        </div>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span>{[listing.cityName, distance].filter(Boolean).join(" · ")}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          <time dateTime={listing.createdAt}>{formatRelativeDate(listing.createdAt)}</time>
        </p>
      </div>
      {children && <div className="relative border-t p-4">{children}</div>}
    </article>
  );
}
