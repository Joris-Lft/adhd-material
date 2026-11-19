import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type City = Database["public"]["Functions"]["search_cities"]["Returns"][number];
export type CitySummary = Pick<City, "id" | "name" | "postal_codes">;

export async function searchCities(q: string): Promise<City[]> {
  const { data, error } = await supabase.rpc("search_cities", { q });
  if (error) throw error;
  return data;
}

export async function fetchCity(id: string): Promise<CitySummary | null> {
  const { data, error } = await supabase
    .from("cities")
    .select("id, name, postal_codes")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
