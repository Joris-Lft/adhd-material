import { skipToken, useQuery } from "@tanstack/react-query";
import { fetchCity } from "@/services/cities";

export const cityKey = (cityId: string | null) => ["city", cityId] as const;

export function useCity(cityId: string | null) {
  return useQuery({
    queryKey: cityKey(cityId),
    queryFn: cityId ? () => fetchCity(cityId) : skipToken,
    staleTime: Infinity,
  });
}
