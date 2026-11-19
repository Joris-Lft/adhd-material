import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { cityKey } from "@/hooks/useCity";
import { profileKey } from "@/hooks/useMyProfile";
import { type CitySummary } from "@/services/cities";
import { updateCity } from "@/services/profile";

export function useUpdateCity() {
  const queryClient = useQueryClient();
  const userId = useSession().session?.user.id;
  return useMutation({
    mutationFn: (city: CitySummary | null) => {
      if (!userId) throw new Error("Session absente");
      return updateCity(userId, city?.id ?? null);
    },
    onSuccess: (_data, city) => {
      // La ville choisie est déjà connue : pas d'écran de chargement après l'invalidation du profil.
      if (city) queryClient.setQueryData(cityKey(city.id), city);
      return queryClient.invalidateQueries({ queryKey: profileKey(userId) });
    },
  });
}
