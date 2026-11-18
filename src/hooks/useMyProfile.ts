import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { fetchMyProfile } from "@/services/profile";

export const profileKey = (userId: string | undefined) => ["profile", userId] as const;

export function useMyProfile() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: profileKey(userId),
    queryFn: fetchMyProfile,
    enabled: !!userId,
  });
}
