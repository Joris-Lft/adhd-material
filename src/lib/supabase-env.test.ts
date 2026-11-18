import { parseSupabaseEnv } from "./supabase-env";

const url = "https://abc.supabase.co";
const key = "sb_publishable_abc";

describe("parseSupabaseEnv", () => {
  it("accepte une configuration valide", () => {
    expect(parseSupabaseEnv({ url, publishableKey: key })).toEqual({ url, publishableKey: key });
  });

  it("refuse des variables absentes", () => {
    expect(() => parseSupabaseEnv({ url: undefined, publishableKey: undefined })).toThrow(
      /manquante/,
    );
  });

  it("refuse une URL non https", () => {
    expect(() => parseSupabaseEnv({ url: "http://abc.supabase.co", publishableKey: key })).toThrow(
      /https/,
    );
    expect(() => parseSupabaseEnv({ url: "pas une url", publishableKey: key })).toThrow(/URL/);
  });

  it("refuse explicitement une clé secrète", () => {
    expect(() => parseSupabaseEnv({ url, publishableKey: "sb_secret_xyz" })).toThrow(/secrète/);
  });

  it("refuse une clé qui n'est pas publishable", () => {
    expect(() => parseSupabaseEnv({ url, publishableKey: "eyJhbGciOi" })).toThrow(
      /sb_publishable_/,
    );
  });
});
