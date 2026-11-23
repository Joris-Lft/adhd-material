import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import type { CityValue } from "@/features/cities/CityPicker";
import { useSession } from "@/features/auth/useSession";
import { ListingCard } from "@/features/listings/ListingCard";
import { ListingFilters } from "@/features/listings/ListingFilters";
import { activityKey, useActivity } from "@/hooks/useActivity";
import { cityKey, useCity } from "@/hooks/useCity";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useListingFeed } from "@/hooks/useListingFeed";
import { useMyProfile } from "@/hooks/useMyProfile";
import {
  RADIUS_OPTIONS,
  parseFilters,
  radiusLabel,
  withFilterChange,
  type ListingFilters as Filters,
} from "@/lib/listing-filters";
import { SEARCH_FAILED } from "@/lib/messages";
import type { ActivityValue } from "@/services/activities";
import type { ListingSummary } from "@/services/listing-reads";

function uniqueListings(pages: ListingSummary[][] | undefined): ListingSummary[] {
  const seen = new Set<string>();
  const all: ListingSummary[] = [];
  for (const listing of pages?.flat() ?? []) {
    if (!seen.has(listing.id)) {
      seen.add(listing.id);
      all.push(listing);
    }
  }
  return all;
}

const SKELETONS = [0, 1, 2, 3, 4, 5];

function ListSkeleton() {
  return (
    <ul aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
      {SKELETONS.map((key) => (
        <li key={key} className="h-72 animate-pulse rounded-xl bg-muted" />
      ))}
    </ul>
  );
}

interface EmptyStateProps {
  hasCity: boolean;
  radius: number;
  filtered: boolean;
  onWiden: (radius: number) => void;
  onClearFilters: () => void;
}

function EmptyState({ hasCity, radius, filtered, onWiden, onClearFilters }: EmptyStateProps) {
  const wider = RADIUS_OPTIONS.find((option) => option > radius);
  return (
    <div className="space-y-4 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">
        {hasCity ? "Rien pour l'instant autour de toi" : "Rien pour l'instant"}
      </h2>
      <p className="text-muted-foreground">
        Ça arrive, les annonces se remplissent petit à petit. Tu peux :
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {hasCity && wider !== undefined && (
          <Button type="button" variant="outline" onClick={() => onWiden(wider)}>
            Élargir à {radiusLabel(wider)}
          </Button>
        )}
        {filtered && (
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Retirer les filtres
          </Button>
        )}
        <Button asChild>
          <Link to="/publier">Publier une annonce</Link>
        </Button>
      </div>
    </div>
  );
}

export function HomePage() {
  useDocumentTitle("Annonces");
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const change = (next: Partial<Filters>) => {
    setParams((previous) => withFilterChange(previous, next));
  };

  const queryClient = useQueryClient();
  const { session, loading: sessionLoading } = useSession();
  const profile = useMyProfile();

  // Ville : celle de l'URL si elle existe, sinon celle du profil (sans l'écrire dans l'URL :
  // un lien partagé ne porte que les choix explicites de la personne). `ville=toutes` force la France entière.
  const urlCityQuery = useCity(filters.cityId);
  const urlCity = filters.cityId ? (urlCityQuery.data ?? null) : null;
  const urlCityPending = !!filters.cityId && urlCityQuery.isPending;
  const useProfileCity = !filters.allFrance && !urlCity && !urlCityPending;
  const profileLoading = sessionLoading || (!!session && profile.isPending);
  const profileCityId = useProfileCity ? (profile.data?.city_id ?? null) : null;
  const profileCityQuery = useCity(profileCityId);
  const city: CityValue | null =
    urlCity ?? (useProfileCity && profileCityId ? (profileCityQuery.data ?? null) : null);
  const ownCity = !urlCity && !!city;

  const activityQuery = useActivity(filters.activityId);
  const activityPending = !!filters.activityId && activityQuery.isPending;
  const activityData = filters.activityId ? activityQuery.data : null;
  const activity = useMemo<ActivityValue>(
    () =>
      activityData ? { kind: "existing", id: activityData.id, name: activityData.name } : null,
    [activityData],
  );

  // Lecture en échec (réseau) : on le dit, le filtre n'est pas ignoré en silence. Id introuvable = repli silencieux.
  const lookups = [
    ...(filters.cityId ? [urlCityQuery] : []),
    ...(profileCityId ? [profileCityQuery] : []),
    ...(filters.activityId ? [activityQuery] : []),
  ];
  const lookupFailed = lookups.some((query) => query.isError);

  const resolving =
    urlCityPending ||
    activityPending ||
    (useProfileCity && (profileLoading || (!!profileCityId && profileCityQuery.isPending)));

  // Texte des champs : un brouillon (frappe en cours) n'écrase pas la valeur active tant qu'aucun choix n'est fait.
  const [cityDraft, setCityDraft] = useState<CityValue | null>(city);
  const [previousCity, setPreviousCity] = useState(city);
  if (city !== previousCity) {
    setPreviousCity(city);
    setCityDraft(city);
  }
  const [activityDraft, setActivityDraft] = useState<ActivityValue>(activity);
  const [previousActivity, setPreviousActivity] = useState(activity);
  if (activity !== previousActivity) {
    setPreviousActivity(activity);
    setActivityDraft(activity);
  }

  const feed = useListingFeed({
    cityId: city?.id ?? null,
    radiusKm: filters.radius,
    activityId: activityData?.id ?? null,
    kind: filters.kind,
    enabled: !resolving && !lookupFailed,
  });

  const items = useMemo(() => uniqueListings(feed.data?.pages), [feed.data]);

  // « Voir plus » : le focus passe à la première nouvelle annonce (le bouton peut disparaître).
  // Issue et focus sont liés au jeu de filtres : ils sont ignorés dès que celui-ci change
  // (navigation dans l'historique, autre filtre), et le focus n'est déplacé qu'une seule fois.
  const feedKey = JSON.stringify([
    city?.id ?? null,
    filters.radius,
    activityData?.id ?? null,
    filters.kind,
  ]);
  const focusFrom = useRef<{ key: string; index: number } | null>(null);
  const focusLoadMore = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; kind: "empty" | "error" } | null>(null);
  if (outcome && outcome.key !== feedKey) setOutcome(null);
  const loadOutcome = outcome?.key === feedKey ? outcome.kind : null;

  useEffect(() => {
    const pending = focusFrom.current;
    const first = pending?.key === feedKey ? items[pending.index] : undefined;
    if (!first) return;
    focusFrom.current = null;
    document.getElementById(`listing-link-${first.id}`)?.focus();
  }, [items, feedKey]);
  useEffect(() => {
    // Échec : le bouton, désactivé pendant le chargement, est de nouveau actif à ce rendu.
    if (focusLoadMore.current !== feedKey) return;
    focusLoadMore.current = null;
    document.getElementById("load-more")?.focus();
  }, [outcome, feedKey]);

  function loadMore() {
    const key = feedKey;
    const before = items.length;
    const lastBefore = items.at(-1)?.id;
    focusFrom.current = { key, index: before };
    focusLoadMore.current = null;
    setOutcome(null);
    void feed.fetchNextPage().then((result) => {
      const failedPage = result.isError;
      if (!failedPage && uniqueListings(result.data?.pages).length > before) return;
      if (focusFrom.current?.key === key) focusFrom.current = null;
      setOutcome({ key, kind: failedPage ? "error" : "empty" });
      if (failedPage) focusLoadMore.current = key;
      else if (lastBefore) document.getElementById(`listing-link-${lastBefore}`)?.focus();
    });
  }

  const failed = lookupFailed || (!resolving && feed.isError && !feed.data);
  const loading = !failed && (resolving || feed.isPending);
  const filtered = !!activity || !!filters.kind;
  let status = "";
  if (loading) status = "Chargement des annonces…";
  else if (!failed && items.length > 0) {
    status =
      loadOutcome === "empty" && !feed.hasNextPage
        ? `Plus d'autres annonces : ${items.length} au total`
        : `${items.length} annonce${items.length > 1 ? "s" : ""}${feed.hasNextPage ? " affichées" : ""}`;
  }

  function retry() {
    for (const query of lookups) if (query.isError) void query.refetch();
    if (feed.isError) void feed.refetch();
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Annonces</h1>

      <ListingFilters
        city={cityDraft}
        showRadius={!!city}
        onCityChange={(next) => {
          if (!next) return setCityDraft(null);
          // La ville est déjà connue : pas de relecture ni de squelette après le choix.
          queryClient.setQueryData(cityKey(next.id), next);
          change({ cityId: next.id, allFrance: false });
        }}
        onAllFrance={() => change({ cityId: null, allFrance: true })}
        radius={filters.radius}
        onRadiusChange={(radius) => change({ radius })}
        activity={activityDraft}
        onActivityChange={(next) => {
          if (next?.kind !== "existing") return setActivityDraft(null);
          queryClient.setQueryData(activityKey(next.id), { id: next.id, name: next.name });
          change({ activityId: next.id });
        }}
        onActivityClear={() => filters.activityId && change({ activityId: null })}
        kind={filters.kind}
        onKindChange={(kind) => change({ kind })}
      />

      {!city && !resolving && (
        <p className="flex items-start gap-2 rounded-xl bg-primary/5 p-4 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Voici les dernières annonces de toute la France. Choisis ta ville pour voir ce qui est
            proche de toi.
          </span>
        </p>
      )}

      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>

      {loading && !failed && <ListSkeleton />}

      {failed && (
        <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
          <p role="alert" className="text-destructive">
            {SEARCH_FAILED}
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && !failed && items.length === 0 && (
        <EmptyState
          hasCity={!!city}
          radius={filters.radius}
          filtered={filtered}
          onWiden={(radius) => change({ radius })}
          onClearFilters={() => change({ activityId: null, kind: null })}
        />
      )}

      {!loading && !failed && items.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((listing) => (
              <li key={listing.id}>
                <ListingCard listing={listing} ownCity={ownCity} />
              </li>
            ))}
          </ul>
          {feed.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              {SEARCH_FAILED}
            </p>
          )}
          {feed.hasNextPage && (
            <div className="flex justify-center">
              <LoadingButton
                type="button"
                id="load-more"
                variant="outline"
                loading={feed.isFetchingNextPage}
                onClick={loadMore}
              >
                Voir plus
              </LoadingButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
