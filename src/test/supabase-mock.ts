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

/**
 * Comme `queryResult`, mais le résultat est calculé à la résolution à partir des appels enregistrés
 * (ex. pagination selon `range`, filtre selon `eq`).
 */
export function queryHandler(resolve: (calls: { method: string; args: unknown[] }[]) => unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: unknown = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === "then"
          ? (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
              Promise.resolve()
                .then(() => resolve(calls))
                .then(onFulfilled, onRejected)
          : (...args: unknown[]) => {
              calls.push({ method: String(prop), args });
              return builder;
            },
    },
  );
  return { builder, calls };
}

/** Réponse de `supabase.rpc()` simulée : une promesse qui accepte aussi `.abortSignal()`. */
export function rpcResult(result: unknown) {
  const promise = Promise.resolve(result);
  return Object.assign(promise, { abortSignal: () => promise });
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

/**
 * Canal Realtime simulé, fidèle aux pièges de supabase-js : le topic porte le préfixe `realtime:`,
 * `channel()` réutilise le canal existant du même topic, `subscribe()` lève « tried to join multiple times »
 * sur un canal déjà joint, `removeChannel()` est asynchrone (le canal reste « leaving » jusqu'à l'accusé) :
 * « ok » ou « timed out » ferment puis retirent le canal, seul « error » laisse un zombie enregistré, et
 * `teardown()` ne retire rien de la liste (comme RealtimeClient).
 */
export interface FakeChannel {
  topic: string;
  config: unknown;
  state: "closed" | "joining" | "joined" | "leaving";
  /** Comme phoenix : un canal ne peut être joint qu'une fois (même après teardown). */
  joinedOnce: boolean;
  handlers: { event: string; callback: (message: { payload: unknown }) => void }[];
  statusCallback: ((status: string) => void) | null;
  on: (
    type: string,
    filter: { event: string },
    callback: (message: { payload: unknown }) => void,
  ) => FakeChannel;
  subscribe: (callback?: (status: string) => void) => FakeChannel;
  teardown: () => void;
}

export function createSupabaseMock() {
  const listeners = new Set<Listener>();
  let current: Session | null = null;
  let channels: FakeChannel[] = [];
  /** Abonnements créés depuis le début du test, retirés compris. */
  let createdChannels = 0;
  let holdRemovals = false;
  const pendingRemovals: ((status: string) => void)[] = [];

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
    realtime: { setAuth: vi.fn() },
    channel: vi.fn((topic: string, config?: unknown): FakeChannel => {
      const fullTopic = `realtime:${topic}`;
      const existing = channels.find((candidate) => candidate.topic === fullTopic);
      if (existing) return existing;
      createdChannels += 1;
      const channel: FakeChannel = {
        topic: fullTopic,
        config,
        state: "closed",
        joinedOnce: false,
        handlers: [],
        statusCallback: null,
        on: (_type, filter, callback) => {
          channel.handlers.push({ event: filter.event, callback });
          return channel;
        },
        subscribe: (callback) => {
          if (channel.joinedOnce) {
            throw new Error(
              "tried to join multiple times. 'subscribe' can only be called a single time per channel instance",
            );
          }
          channel.joinedOnce = true;
          channel.state = "joining";
          channel.statusCallback = callback ?? null;
          queueMicrotask(() => {
            if (channel.state !== "joining") return;
            channel.state = "joined";
            callback?.("SUBSCRIBED");
          });
          return channel;
        },
        // Ne retire pas le canal de RealtimeClient.channels.
        teardown: () => {
          channel.state = "closed";
        },
      };
      channels.push(channel);
      return channel;
    }),
    getChannels: () => [...channels],
    removeChannel: vi.fn(async (channel: FakeChannel): Promise<string> => {
      channel.state = "leaving";
      let status = "ok";
      if (holdRemovals) {
        status = await new Promise<string>((resolve) => pendingRemovals.push(resolve));
      }
      // phoenix : « ok » et « timed out » ferment le canal, qui est alors retiré (socket._remove, par topic) ;
      // seul « error » le laisse enregistré.
      if (status === "ok" || status === "timed out") {
        channel.teardown();
        channels = channels.filter((candidate) => candidate.topic !== channel.topic);
      }
      return status;
    }),
    /** Les suppressions de canal restent en attente jusqu'à `releaseRemovals`. */
    holdChannelRemovals() {
      holdRemovals = true;
    },
    /** Termine les suppressions en attente (« ok », « timed out » ou « error » : seul ce dernier laisse un zombie). */
    releaseRemovals(status: "ok" | "timed out" | "error" = "ok") {
      holdRemovals = false;
      pendingRemovals.splice(0).forEach((resolve) => resolve(status));
    },
    /** Canaux enregistrés (par topic sans préfixe, ou tous). */
    activeChannels: (topic?: string) =>
      channels.filter((channel) => topic === undefined || channel.topic === `realtime:${topic}`),
    channelsCreated: () => createdChannels,
    /** Simule un événement Broadcast reçu sur `topic`. */
    emitBroadcast(topic: string, event: string, payload: unknown) {
      channels
        .filter((channel) => channel.topic === `realtime:${topic}`)
        .forEach((channel) =>
          channel.handlers
            .filter((handler) => handler.event === event)
            .forEach((handler) => handler.callback({ payload })),
        );
    },
    /** Simule un changement d'état du canal (SUBSCRIBED, CHANNEL_ERROR, CLOSED, TIMED_OUT). */
    emitChannelStatus(topic: string, status: string) {
      channels
        .filter((channel) => channel.topic === `realtime:${topic}`)
        .forEach((channel) => channel.statusCallback?.(status));
    },
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
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
      mock.storage.from.mockReset();
      mock.realtime.setAuth.mockReset().mockResolvedValue(undefined);
      mock.channel.mockClear();
      mock.removeChannel.mockClear();
      channels = [];
      createdChannels = 0;
      holdRemovals = false;
      pendingRemovals.length = 0;
    },
  };
  return mock;
}

export const supabaseMock = createSupabaseMock();
