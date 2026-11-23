import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { listingKeys } from "@/hooks/listing-keys";
import { fetchMyListings } from "@/services/listing-reads";

export function useMyListings() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: listingKeys.mine(userId),
    queryFn: () => fetchMyListings(userId as string),
    enabled: !!userId,
  });
}
