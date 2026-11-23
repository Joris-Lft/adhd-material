import { skipToken, useQuery } from "@tanstack/react-query";
import { fetchActivity } from "@/services/activities";

export const activityKey = (activityId: string | null) => ["activity", activityId] as const;

export function useActivity(activityId: string | null) {
  return useQuery({
    queryKey: activityKey(activityId),
    queryFn: activityId ? () => fetchActivity(activityId) : skipToken,
    staleTime: Infinity,
  });
}
