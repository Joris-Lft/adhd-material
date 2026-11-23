import { z } from "zod"; // eslint-disable-line no-restricted-imports
import { parseSupabaseEnv } from "./supabase-env";

describe("zod (CSP sans unsafe-eval)", () => {
  it("jitless est activé dès l'import de supabase-env, avant la création de son schéma", () => {
    expect(parseSupabaseEnv).toBeTypeOf("function");
    expect(z.config().jitless).toBe(true);
  });
});
