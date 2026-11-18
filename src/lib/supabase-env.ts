import { z } from "zod";

const envSchema = z.object({
  url: z
    .string({ error: "VITE_SUPABASE_URL est manquante." })
    .url("VITE_SUPABASE_URL doit être une URL valide.")
    .refine(
      (value) => value.startsWith("https://"),
      "VITE_SUPABASE_URL doit commencer par https://.",
    ),
  publishableKey: z
    .string({ error: "VITE_SUPABASE_PUBLISHABLE_KEY est manquante." })
    .refine(
      (value) => !value.startsWith("sb_secret_"),
      "VITE_SUPABASE_PUBLISHABLE_KEY contient une clé secrète : n'utilisez JAMAIS une clé sb_secret_ dans le navigateur.",
    )
    .refine(
      (value) => value.startsWith("sb_publishable_"),
      "VITE_SUPABASE_PUBLISHABLE_KEY doit commencer par sb_publishable_.",
    ),
});

export type SupabaseEnv = z.infer<typeof envSchema>;

/** Valide les variables d'env Supabase ; lève une erreur au message explicite. */
export function parseSupabaseEnv(raw: {
  url: string | undefined;
  publishableKey: string | undefined;
}): SupabaseEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `- ${issue.message}`).join("\n");
    throw new Error(`Configuration Supabase invalide (voir .env.example) :\n${details}`);
  }
  return result.data;
}
