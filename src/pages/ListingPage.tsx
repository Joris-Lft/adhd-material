import { Link, useParams } from "react-router";
import { ArrowLeft, MapPin } from "lucide-react";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/useSession";
import { formatCity } from "@/features/cities/format-city";
import { ListingGallery } from "@/features/listings/ListingGallery";
import { ContactButton } from "@/features/messages/ContactButton";
import { KindBadge, StatusBadge } from "@/features/listings/ListingBadges";
import { ListingStatusActions } from "@/features/listings/ListingStatusActions";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useListing } from "@/hooks/useListing";
import { isUuid } from "@/lib/listing-filters";
import { GENERIC_ERROR } from "@/lib/messages";
import { buildLoginUrl } from "@/lib/next-path";
import { formatRelativeDate } from "@/lib/relative-date";
import type { ListingDetail } from "@/services/listing-reads";

function Gone() {
  return (
    <section className="space-y-4 py-8">
      <h1 className="text-2xl font-bold">Cette annonce n'existe plus ou n'est plus visible</h1>
      <p className="text-muted-foreground">
        Elle a peut-être été donnée ou retirée par son auteur.
      </p>
      <Button asChild>
        <Link to="/">Voir les annonces</Link>
      </Button>
    </section>
  );
}

function TextSection({ title, text }: { title: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="whitespace-pre-line">{text}</p>
    </section>
  );
}

function ContactAction({ listing }: { listing: ListingDetail }) {
  const { session, loading } = useSession();
  if (loading) return <div className="h-11" aria-hidden="true" />;
  if (session?.user.id === listing.ownerId) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link to="/mes-annonces">Gérer dans Mes annonces</Link>
        </Button>
        <ListingStatusActions listing={listing} />
      </div>
    );
  }
  // Annonce donnée : plus rien à demander, le badge suffit.
  if (listing.status === "donnee") return null;
  if (!session) {
    return (
      <Button asChild>
        <Link to={buildLoginUrl(`/annonces/${listing.id}`)}>Se connecter pour contacter</Link>
      </Button>
    );
  }
  // Sans auteur (compte supprimé), personne à contacter.
  if (!listing.ownerId) return null;
  return <ContactButton listingId={listing.id} ownerName={listing.ownerName} />;
}

export function ListingPage() {
  const { id } = useParams();
  const validId = isUuid(id) ? id : null;
  const query = useListing(validId);
  const listing = query.data;
  useDocumentTitle(listing?.activityName ?? "Annonce");

  if (!validId) return <Gone />;
  if (query.isPending) return <PageLoader />;
  if (query.isError && !listing) {
    return (
      <section className="space-y-4 py-8">
        <h1 className="text-2xl font-bold">Un petit souci</h1>
        <p role="alert" className="text-destructive">
          {GENERIC_ERROR}
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Réessayer
        </Button>
      </section>
    );
  }
  if (!listing) return <Gone />;

  return (
    <article className="mx-auto max-w-xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Toutes les annonces
        </Link>
      </Button>
      <ListingGallery
        key={listing.id}
        photos={listing.photos}
        activityName={listing.activityName}
      />
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{listing.activityName}</h1>
        <div className="flex flex-wrap gap-2">
          <KindBadge kind={listing.kind} />
          <StatusBadge status={listing.status} />
        </div>
        <p className="flex items-start gap-1 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {formatCity({ id: "", name: listing.cityName, postal_codes: listing.postalCodes })}
            {" · "}
            <time dateTime={listing.createdAt}>{formatRelativeDate(listing.createdAt)}</time>
            {listing.ownerName && <> · par {listing.ownerName}</>}
          </span>
        </p>
      </div>
      <TextSection title="Description" text={listing.description} />
      <TextSection title="Son expérience" text={listing.experience} />
      <ContactAction listing={listing} />
    </article>
  );
}
