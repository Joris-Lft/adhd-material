import { normalizeActivityName } from "@/lib/activity-name";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_CREATE_FAILED, mapActivityError } from "@/lib/messages";
import type { Database } from "@/types/database";

export type ActivitySuggestion =
  Database["public"]["Functions"]["search_activities"]["Returns"][number];

/** Activité choisie : existante, ou à créer à la publication de l'annonce. */
export type ActivityValue =
  { kind: "existing"; id: string; name: string } | { kind: "new"; name: string } | null;

export class ActivityError extends Error {}

export async function searchActivities(q: string): Promise<ActivitySuggestion[]> {
  const { data, error } = await supabase.rpc("search_activities", { q });
  if (error) throw error;
  return data;
}

/** Renvoie l'activité en base, en la créant si besoin (appelé à la publication de l'annonce). */
export async function resolveActivity(
  value: NonNullable<ActivityValue>,
): Promise<{ id: string; name: string }> {
  if (value.kind === "existing") return { id: value.id, name: value.name };

  const { data, error } = await supabase
    .from("activities")
    .insert({ name: value.name })
    .select("id, name")
    .single();
  if (!error) return data;

  if (error.code === "23505") {
    // Doublon apparu entre-temps : on récupère l'activité identique.
    const matches = await searchActivities(value.name).catch(() => []);
    const target = normalizeActivityName(value.name);
    const exact = matches.find((match) => normalizeActivityName(match.name) === target);
    if (exact) return { id: exact.id, name: exact.name };
    throw new ActivityError(ACTIVITY_CREATE_FAILED);
  }
  throw new ActivityError(mapActivityError(error));
}
