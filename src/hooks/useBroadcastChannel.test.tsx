import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { supabaseMock } from "@/test/supabase-mock";
import { useBroadcastChannel } from "./useBroadcastChannel";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

const EVENTS = ["message_created", "messages_read"] as const;

beforeEach(() => supabaseMock.resetMocks());

function setup(topic: string | null, onEvent = vi.fn(), onResync = vi.fn()) {
  const view = renderHook(({ topic }) => useBroadcastChannel(topic, EVENTS, onEvent, onResync), {
    initialProps: { topic },
    wrapper: StrictMode,
  });
  return { ...view, onEvent, onResync };
}

describe("useBroadcastChannel", () => {
  it("authentifie le temps réel puis s'abonne à un canal privé, une seule fois (StrictMode)", async () => {
    setup("conversation:c1");
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:c1")).toHaveLength(1));
    expect(supabaseMock.realtime.setAuth).toHaveBeenCalled();
    expect(supabaseMock.channelsCreated()).toBe(1);
    expect(supabaseMock.activeChannels()[0]?.config).toEqual({ config: { private: true } });
  });

  it("sans topic : aucun abonnement", async () => {
    setup(null);
    await Promise.resolve();
    expect(supabaseMock.channel).not.toHaveBeenCalled();
  });

  it("transmet les événements Broadcast avec leur charge utile", async () => {
    const { onEvent } = setup("user:u1");
    await waitFor(() => expect(supabaseMock.activeChannels()).toHaveLength(1));
    act(() => supabaseMock.emitBroadcast("user:u1", "message_created", { message_id: "m1" }));
    expect(onEvent).toHaveBeenCalledWith("message_created", { message_id: "m1" });
    act(() => supabaseMock.emitBroadcast("user:u1", "autre", {}));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("resynchronise à chaque abonnement réussi, y compris après une coupure", async () => {
    const { onResync } = setup("user:u1");
    await waitFor(() => expect(onResync).toHaveBeenCalledTimes(1));
    expect(onResync.mock.calls[0]?.[0]).toMatchObject({ reconnect: false });
    act(() => supabaseMock.emitChannelStatus("user:u1", "TIMED_OUT"));
    act(() => supabaseMock.emitChannelStatus("user:u1", "CHANNEL_ERROR"));
    expect(onResync).toHaveBeenCalledTimes(1);
    act(() => supabaseMock.emitChannelStatus("user:u1", "SUBSCRIBED"));
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it("retire le canal au démontage et au changement de topic", async () => {
    const { rerender, unmount } = setup("conversation:c1");
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:c1")).toHaveLength(1));
    rerender({ topic: "conversation:c2" });
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:c2")).toHaveLength(1));
    expect(supabaseMock.activeChannels("conversation:c1")).toHaveLength(0);
    unmount();
    expect(supabaseMock.activeChannels()).toHaveLength(0);
  });

  it("démonté avant la fin de setAuth : aucun canal créé", async () => {
    let release: () => void = () => {};
    supabaseMock.realtime.setAuth.mockReturnValue(
      new Promise<void>((resolve) => (release = resolve)),
    );
    const { unmount } = renderHook(() => useBroadcastChannel("user:u1", EVENTS, vi.fn(), vi.fn()));
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(supabaseMock.channel).not.toHaveBeenCalled();
  });

  it("A -> B -> A rapide : attend la fin de la suppression de A avant de se réabonner (pas de canal zombie)", async () => {
    const { rerender, onResync, onEvent } = setup("conversation:A");
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:A")).toHaveLength(1));
    const first = supabaseMock.activeChannels("conversation:A")[0]!;
    expect(supabaseMock.channelsCreated()).toBe(1);

    supabaseMock.holdChannelRemovals();
    rerender({ topic: "conversation:B" });
    rerender({ topic: "conversation:A" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Suppression de A pas terminée : on ne récupère pas le canal « leaving », rien n'est créé de plus.
    expect(first.state).toBe("leaving");
    expect(supabaseMock.channelsCreated()).toBe(1);

    await act(async () => supabaseMock.releaseRemovals("ok"));
    await waitFor(() => expect(supabaseMock.channelsCreated()).toBe(2));
    await waitFor(() => {
      const [fresh] = supabaseMock.activeChannels("conversation:A");
      expect(fresh).toBeDefined();
      expect(fresh).not.toBe(first);
      expect(fresh?.state).toBe("joined");
    });
    expect(supabaseMock.activeChannels("conversation:A")).toHaveLength(1);
    expect(supabaseMock.activeChannels("conversation:B")).toHaveLength(0);
    expect(onResync).toHaveBeenCalledTimes(2);

    // Le nouveau canal A écoute vraiment.
    act(() =>
      supabaseMock.emitBroadcast("conversation:A", "message_created", { message_id: "m9" }),
    );
    expect(onEvent).toHaveBeenCalledWith("message_created", { message_id: "m9" });
  });

  it("suppression « timed out » : le canal est retiré, le nouvel abonnement repart proprement", async () => {
    const { rerender } = setup("conversation:A");
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:A")).toHaveLength(1));
    const old = supabaseMock.activeChannels("conversation:A")[0]!;

    supabaseMock.holdChannelRemovals();
    rerender({ topic: null as unknown as string });
    rerender({ topic: "conversation:A" });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => supabaseMock.releaseRemovals("timed out"));
    await waitFor(() => {
      const [fresh] = supabaseMock.activeChannels("conversation:A");
      expect(fresh).not.toBe(old);
      expect(fresh?.state).toBe("joined");
    });
  });

  it("canal zombie (suppression en erreur) : jamais d'abonnement dessus, repli sur resync puis nouvel essai au retour d'onglet", async () => {
    const { rerender, onResync } = setup("conversation:A");
    await waitFor(() => expect(supabaseMock.activeChannels("conversation:A")).toHaveLength(1));
    const zombie = supabaseMock.activeChannels("conversation:A")[0]!;

    supabaseMock.holdChannelRemovals();
    rerender({ topic: null as unknown as string });
    // Le suivant (la deuxième suppression, lancée par le hook) échouera aussi.
    await act(async () => supabaseMock.releaseRemovals("error"));
    supabaseMock.holdChannelRemovals();
    rerender({ topic: "conversation:A" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => supabaseMock.releaseRemovals("error"));
    await waitFor(() => expect(onResync).toHaveBeenCalledTimes(2));
    expect(onResync).toHaveBeenLastCalledWith(expect.objectContaining({ reconnect: true }));
    expect(supabaseMock.activeChannels("conversation:A")).toEqual([zombie]);
    expect(supabaseMock.channelsCreated()).toBe(1);

    // Retour d'onglet : nouvel essai, le zombie est enfin retiré et un canal sain est créé.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => {
      const [fresh] = supabaseMock.activeChannels("conversation:A");
      expect(fresh).not.toBe(zombie);
      expect(fresh?.state).toBe("joined");
    });
  });

  it("exception pendant l'abonnement : aucune exception non gérée, repli sur resync", async () => {
    supabaseMock.channel.mockImplementationOnce(() => {
      throw new Error("tried to join multiple times");
    });
    const { onResync } = setup("user:u1");
    await waitFor(() =>
      expect(onResync).toHaveBeenCalledWith(expect.objectContaining({ reconnect: true })),
    );
  });
});
