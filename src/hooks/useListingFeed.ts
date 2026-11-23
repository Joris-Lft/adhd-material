import { useInfiniteQuery } from "@tanstack/react-query";
import { listingKeys } from "@/hooks/listing-keys";
import { fetchRecentListings, PAGE_SIZE, searchListings } from "@/services/listing-reads";
import type { ListingKind } from "@/services/listings";

interface FeedParams {
  /** Sans ville : les annonces les plus récentes de France. */
  cityId: string | null;
  radiusKm: number;
  activityId: string | null;
  kind: ListingKind | null;
  enabled: boolean;
}

/** Liste paginée (pages de 24, « Voir plus ») : recherche géographique, ou récentes sans ville. */
export function useListingFeed({ cityId, radiusKm, activityId, kind, enabled }: FeedParams) {
  const filters = cityId ? { cityId, radiusKm, activityId, kind } : { activityId, kind };
  return useInfiniteQuery({
    queryKey: listingKeys.feed(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      cityId
        ? searchListings({ cityId, radiusKm, activityId, kind, offset: pageParam })
        : fetchRecentListings({ activityId, kind, offset: pageParam }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.length === PAGE_SIZE ? lastOffset + PAGE_SIZE : undefined,
    enabled,
  });
}
