import type { Session } from "@supabase/supabase-js";

type Listener = (event: string, session: Session | null) => void;

/**
 * Résultat PostgREST simulé : toute la chaîne (from/update/eq/select/maybeSingle) renvoie le même objet
 * « thenable » et chaque appel est enregistré dans `calls`, pour vérifier `.eq("id", …)` etc.
 */
export function queryResult(result: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: unknown = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === "then"
          ? (resolve: (value: unknown) => unknown) => resolve(result)
          : (...args: unknown[]) => {
              calls.push({ method: String(prop), args });
              return builder;
            },
    },
  );
  return { builder, calls };
}

export function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

export function fakeSession(
  overrides: { amrTimestamp?: number; email?: string; providers?: string[]; id?: string } = {},
): Session {
  const timestamp = overrides.amrTimestamp ?? Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt({ sub: "user-1", amr: [{ method: "otp", timestamp }] }),
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: overrides.id ?? "user-1",
      email: overrides.email ?? "moi@example.com",
      app_metadata: { providers: overrides.providers ?? ["email"] },
      identities: (overrides.providers ?? ["email"]).map((provider) => ({ provider })),
    },
  } as Session;
}

export function createSupabaseMock() {
  const listeners = new Set<Listener>();
  let current: Session | null = null;

  const mock = {
    auth: {
      onAuthStateChange: vi.fn((listener: Listener) => {
        listeners.add(listener);
        queueMicrotask(() => listener("INITIAL_SESSION", current));
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      }),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    /** Définit la session de départ (avant le rendu) ou émet un changement. */
    setSession(session: Session | null, event?: string) {
      current = session;
      if (event) listeners.forEach((listener) => listener(event, session));
    },
    resetMocks() {
      current = null;
      listeners.clear();
      mock.auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
      mock.auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
      mock.auth.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
      mock.auth.signOut.mockReset().mockResolvedValue({ error: null });
      mock.rpc.mockReset();
      mock.from.mockReset();
      mock.functions.invoke.mockReset();
    },
  };
  return mock;
}

export const supabaseMock = createSupabaseMock();
