import { supabase } from "@/lib/supabase";
import { DISPLAY_NAME_SAVE_FAILED, mapDisplayNameError } from "@/lib/messages";
import type { Database } from "@/types/database";

export type MyProfile = Database["public"]["Functions"]["get_my_profile"]["Returns"][number];

export class DisplayNameError extends Error {}

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
