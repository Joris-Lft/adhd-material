import { supabase } from "@/lib/supabase";
import {
  CITY_SAVE_FAILED,
  DISPLAY_NAME_SAVE_FAILED,
  mapCityError,
  mapDisplayNameError,
} from "@/lib/messages";
import type { Database } from "@/types/database";

type RpcProfile = Database["public"]["Functions"]["get_my_profile"]["Returns"][number];
// Le type généré marque city_id non nul ; la colonne est nullable (Returns de la RPC mal inféré).
export type MyProfile = Omit<RpcProfile, "city_id"> & { city_id: string | null };

export class DisplayNameError extends Error {}
export class CityError extends Error {}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc("get_my_profile").maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  // Jamais `*` ni city_id en retour : refusé par les privilèges de colonnes (42501).
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, display_name_confirmed: true })
    .eq("id", userId)
    .select("id, display_name");
  if (error) throw new DisplayNameError(mapDisplayNameError(error));
  // Exactement une ligne attendue : 0 = profil introuvable (compte supprimé) ou refus silencieux.
  if (data?.length !== 1) throw new DisplayNameError(DISPLAY_NAME_SAVE_FAILED);
}

export async function updateCity(userId: string, cityId: string | null): Promise<void> {
  // Même contrainte que updateDisplayName : pas de city_id ni de `*` en retour.
  const { data, error } = await supabase
    .from("profiles")
    .update({ city_id: cityId })
    .eq("id", userId)
    .select("id");
  if (error) throw new CityError(mapCityError(error));
  if (data?.length !== 1) throw new CityError(CITY_SAVE_FAILED);
}
