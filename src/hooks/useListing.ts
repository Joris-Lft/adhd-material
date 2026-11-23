import { useQuery } from "@tanstack/react-query";
import { listingKeys } from "@/hooks/listing-keys";
import { fetchListing } from "@/services/listing-reads";

export function useListing(id: string | null) {
  return useQuery({
    queryKey: listingKeys.detail(id ?? ""),
    queryFn: () => fetchListing(id as string),
    enabled: !!id,
  });
}
