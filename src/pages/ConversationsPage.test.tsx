import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, supabaseMock } from "@/test/supabase-mock";
import { ID } from "@/test/listing-fixtures";
import { convRow, setupMessaging } from "@/test/conversation-fixtures";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

beforeEach(() => {
  supabaseMock.resetMocks();
  supabaseMock.setSession(fakeSession());
});

const listItems = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("liste des conversations", () => {
  it("affiche vignette, activité, pseudo, extrait, date relative, non-lus et statut", async () => {
    setupMessaging({
      list: [
        convRow({
          last_message_excerpt: "On se voit samedi ?",
          last_message_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          unread_count: 3,
          listing_status: "reservee",
        }),
        convRow({
          conversation_id: "c2",
          activity_name: "Guitare",
          other_display_name: "Bob",
          last_message_excerpt: "Merci !",
          last_message_from_me: true,
          last_message_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          cover_photo_path: null,
        }),
      ],
    });
    renderApp(routes, "/messages");

    expect(await screen.findByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    const [first, second] = await waitFor(() => {
      const items = listItems();
      expect(items).toHaveLength(2);
      return items;
    });

    const link = within(first!).getByRole("link");
    expect(link).toHaveAttribute("href", `/messages/${ID.conversation}`);
    expect(within(first!).getByText("Crochet")).toBeVisible();
    expect(within(first!).getByText("Alice")).toBeVisible();
    expect(within(first!).getByText("On se voit samedi ?")).toBeVisible();
    expect(within(first!).getByText("il y a 3 heures")).toBeVisible();
    expect(within(first!).getByText(/3 non lus/)).toBeInTheDocument();
    expect(within(first!).getByText("Réservée")).toBeVisible();
    expect(first!.querySelector("img")).toHaveAttribute("src", "https://img.test/u/a.webp");

    expect(within(second!).getByText("Toi : Merci !")).toBeVisible();
    expect(within(second!).queryByText(/non lu/)).not.toBeInTheDocument();
    expect(second!.querySelector("img")).toBeNull();
  });

  it("conversation vide : « Pas encore de message » ; autre supprimé : « Membre supprimé »", async () => {
    setupMessaging({ list: [convRow({ other_display_name: null })] });
    renderApp(routes, "/messages");
    expect(await screen.findByText("Pas encore de message")).toBeVisible();
    expect(screen.getByText("Membre supprimé")).toBeVisible();
  });

  it("état vide avec lien vers les annonces", async () => {
    setupMessaging({ list: [] });
    renderApp(routes, "/messages");
    expect(await screen.findByText(/pas encore de conversation/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir les annonces" })).toHaveAttribute("href", "/");
  });

  it("erreur : message et Réessayer", async () => {
    const state = setupMessaging({ rpcErrors: { list_my_conversations: { code: "XX000" } } });
    const user = userEvent.setup();
    renderApp(routes, "/messages");
    expect(await screen.findByRole("alert")).toHaveTextContent("Quelque chose n'a pas marché");

    state.rpcErrors = {};
    state.list = [convRow({ last_message_excerpt: "Coucou" })];
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Coucou")).toBeVisible();
  });

  it("s'abonne à user:<uid> et recharge liste et badge sur inbox_changed", async () => {
    const state = setupMessaging({ list: [convRow({ last_message_excerpt: "Avant" })] });
    renderApp(routes, "/messages");
    expect(await screen.findByText("Avant")).toBeVisible();
    await waitFor(() => expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1));
    await waitFor(() =>
      expect(supabaseMock.activeChannels("user:user-1")[0]?.config).toEqual({
        config: { private: true },
      }),
    );

    state.list = [convRow({ last_message_excerpt: "Après", unread_count: 1 })];
    state.unread = 1;
    act(() =>
      supabaseMock.emitBroadcast("user:user-1", "inbox_changed", {
        conversation_id: ID.conversation,
        reason: "message",
      }),
    );
    expect(await screen.findByText("Après")).toBeVisible();
    expect(await screen.findByRole("link", { name: "Messages, 1 non lu" })).toBeVisible();
  });
});

describe("lien Messages de l'en-tête", () => {
  it("affiche le nombre de non-lus dans le nom accessible", async () => {
    setupMessaging({ unread: 3 });
    renderApp(routes, "/");
    const link = await screen.findByRole("link", { name: "Messages, 3 non lus" });
    expect(link).toHaveAttribute("href", "/messages");
    expect(link).toHaveTextContent("3");
  });

  it("sans non-lu : « Messages » seulement, sans pastille", async () => {
    setupMessaging({ unread: 0 });
    renderApp(routes, "/");
    const link = await screen.findByRole("link", { name: "Messages" });
    expect(link).not.toHaveTextContent(/\d/);
  });

  it("plafonne l'affichage à 99+", async () => {
    setupMessaging({ unread: 150 });
    renderApp(routes, "/");
    expect(await screen.findByRole("link", { name: "Messages, 150 non lus" })).toHaveTextContent(
      "99+",
    );
  });

  it("visiteur : ni lien, ni abonnement, ni appel", async () => {
    supabaseMock.setSession(null);
    setupMessaging();
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Connexion" });
    expect(screen.queryByRole("link", { name: /^Messages/ })).not.toBeInTheDocument();
    expect(supabaseMock.channel).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("get_unread_count");
  });

  it("un seul abonnement user:<uid> pour toute l'app, même en changeant de page", async () => {
    setupMessaging({ list: [convRow()] });
    const user = userEvent.setup();
    renderApp(routes, "/messages");
    await screen.findByRole("heading", { name: "Messages" });
    await waitFor(() => expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1));
    await user.click(await screen.findByRole("link", { name: /Crochet/ }));
    await screen.findByRole("heading", { level: 1, name: "Alice" });
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1);
    expect(
      supabaseMock
        .activeChannels()
        .map((channel) => channel.topic.replace("realtime:", ""))
        .sort(),
    ).toEqual([`conversation:${ID.conversation}`, "user:user-1"]);
  });

  it("à la déconnexion, le canal est retiré", async () => {
    setupMessaging();
    renderApp(routes, "/");
    await waitFor(() => expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1));
    act(() => supabaseMock.setSession(null, "SIGNED_OUT"));
    await waitFor(() => expect(supabaseMock.activeChannels()).toHaveLength(0));
  });
});
