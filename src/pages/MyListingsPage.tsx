import { Link } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/features/listings/ListingCard";
import { ListingStatusActions } from "@/features/listings/ListingStatusActions";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMyListings } from "@/hooks/useMyListings";
import { GENERIC_ERROR } from "@/lib/messages";
import type { ListingSummary } from "@/services/listing-reads";

const ONLINE = ["disponible", "reservee", "pretee"];

function ListingGroup({ title, listings }: { title: string; listings: ListingSummary[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">
        {title} ({listings.length})
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {listings.map((listing) => (
          <li key={listing.id}>
            <ListingCard listing={listing} headingLevel="h3">
              <ListingStatusActions listing={listing} />
            </ListingCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyListingsPage() {
  useDocumentTitle("Mes annonces");
  const query = useMyListings();
  const listings = query.data;

  let content;
  if (query.isPending) content = <PageLoader />;
  else if (!listings) {
    content = (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {GENERIC_ERROR}
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  } else if (listings.length === 0) {
    content = (
      <div className="space-y-4 rounded-xl border border-dashed p-6">
        <p className="text-muted-foreground">
          Tu n'as pas encore d'annonce. Quand tu en publieras une, tu pourras la suivre ici.
        </p>
        <Button asChild>
          <Link to="/publier">Publier une annonce</Link>
        </Button>
      </div>
    );
  } else {
    const online = listings.filter((listing) => ONLINE.includes(listing.status));
    const finished = listings.filter((listing) => !ONLINE.includes(listing.status));
    content = (
      <div className="space-y-8">
        {online.length > 0 ? (
          <ListingGroup title="En ligne" listings={online} />
        ) : (
          <p className="text-muted-foreground">Rien en ligne pour l'instant.</p>
        )}
        {finished.length > 0 && <ListingGroup title="Terminées et archivées" listings={finished} />}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Mes annonces</h1>
      {content}
    </section>
  );
}
