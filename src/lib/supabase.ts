import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseSupabaseEnv } from "./supabase-env";

const { url, publishableKey } = parseSupabaseEnv({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
