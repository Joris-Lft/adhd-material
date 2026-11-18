import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { profileKey } from "@/hooks/useMyProfile";
import { updateDisplayName } from "@/services/profile";

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  const userId = useSession().session?.user.id;
  return useMutation({
    mutationFn: (displayName: string) => {
      if (!userId) throw new Error("Session absente");
      return updateDisplayName(userId, displayName);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}
