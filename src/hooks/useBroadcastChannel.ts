import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client = typeof supabase;

/** Informations transmises à `onResync` à chaque abonnement réussi. */
export interface ResyncInfo {
  /** Faux au premier abonnement, vrai après une coupure puis un nouvel abonnement. */
  reconnect: boolean;
  /** Instant où l'abonnement a été lancé : les données lues avant peuvent avoir manqué des événements. */
  startedAt: number;
}

// supabase-js réutilise le canal existant d'un même topic (RealtimeClient.channel) et ne le retire qu'une
// fois la sortie terminée (« ok » ou « timed out » ; seul « error » laisse un canal zombie enregistré).
// RealtimeClient._remove filtre par TOPIC : une fermeture tardive de l'ancien canal retirerait aussi le
// nouveau canal du même topic. On attend donc la fin de la suppression précédente d'un topic, mémorisée
// par client (pas d'état partagé entre clients).
const removals = new WeakMap<Client, Map<string, Promise<unknown>>>();

function removalsOf(client: Client) {
  let map = removals.get(client);
  if (!map) removals.set(client, (map = new Map()));
  return map;
}

function removeAndTrack(client: Client, topic: string, channel: ReturnType<Client["channel"]>) {
  const map = removalsOf(client);
  const removal: Promise<unknown> = client.removeChannel(channel).catch(() => undefined);
  map.set(topic, removal);
  void removal.then(() => {
    if (map.get(topic) === removal) map.delete(topic);
  });
}

/**
 * Attend la suppression en cours du topic, puis supprime encore une fois tout canal resté enregistré.
 * Renvoie faux s'il en reste un (zombie) : on ne s'abonne jamais dessus. Un seul abonné par topic :
 * tout canal du topic est supprimé.
 */
async function releaseTopic(client: Client, topic: string): Promise<boolean> {
  await removalsOf(client).get(topic);
  const registered = () => client.getChannels().filter((c) => c.topic === `realtime:${topic}`);
  for (const existing of registered()) {
    try {
      await client.removeChannel(existing);
    } catch {
      // vérifié ci-dessous
    }
  }
  return registered().length === 0;
}

/**
 * Abonnement à un canal Broadcast privé. `topic` null : pas d'abonnement.
 * `onResync` est appelé à chaque abonnement réussi : il rattrape ce qui a pu être manqué
 * avant l'abonnement ou pendant une coupure (la bibliothèque se reconnecte seule).
 * `events` doit être une constante (stable entre deux rendus).
 * Un seul abonné par topic dans l'application : s'abonner supprime tout canal déjà ouvert sur ce topic.
 * Si l'abonnement est impossible (canal zombie, exception), `onResync` est appelé quand même pour relire
 * les données, et un nouvel essai a lieu au retour d'onglet.
 */
export function useBroadcastChannel(
  topic: string | null,
  events: readonly string[],
  onEvent: (event: string, payload: Record<string, unknown>) => void,
  onResync: (info: ResyncInfo) => void,
) {
  const latest = useRef({ onEvent, onResync });
  useEffect(() => {
    latest.current = { onEvent, onResync };
  });

  // Incrémenté pour retenter un abonnement impossible (au retour d'onglet).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!topic) return;
    // `cancelled` évite un double abonnement (StrictMode, changement rapide de conversation).
    let cancelled = false;
    let channel: ReturnType<Client["channel"]> | null = null;
    let retryListener: (() => void) | null = null;

    const giveUp = () => {
      // Repli : on relit les données, et on réessaiera quand l'onglet redeviendra visible.
      latest.current.onResync({ reconnect: true, startedAt: Date.now() });
      retryListener = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", retryListener!);
        retryListener = null;
        setAttempt((value) => value + 1);
      };
      document.addEventListener("visibilitychange", retryListener);
    };

    void (async () => {
      try {
        try {
          await supabase.realtime.setAuth();
        } catch {
          // Hors ligne : l'abonnement réessaiera, la resynchronisation rattrapera.
        }
        if (cancelled) return;
        const clean = await releaseTopic(supabase, topic);
        if (cancelled) return;
        if (!clean) return giveUp();
        // Création, écouteurs et abonnement dans le même tour : rien ne s'intercale.
        const created = supabase.channel(topic, { config: { private: true } });
        channel = created;
        for (const event of events) {
          created.on("broadcast", { event }, (message: { payload?: Record<string, unknown> }) =>
            latest.current.onEvent(event, message.payload ?? {}),
          );
        }
        const startedAt = Date.now();
        let seenSubscribed = false;
        created.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          latest.current.onResync({ reconnect: seenSubscribed, startedAt });
          seenSubscribed = true;
        });
      } catch {
        if (!cancelled) giveUp();
      }
    })();

    return () => {
      cancelled = true;
      if (retryListener) document.removeEventListener("visibilitychange", retryListener);
      if (channel) removeAndTrack(supabase, topic, channel);
    };
  }, [topic, events, attempt]);
}
