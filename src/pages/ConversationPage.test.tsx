import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listingKeys } from "@/hooks/listing-keys";
import { fakeSession, supabaseMock } from "@/test/supabase-mock";
import { ID } from "@/test/listing-fixtures";
import {
  CONVERSATION_PATH,
  convRow,
  messageRow,
  setupMessaging,
  stamp,
} from "@/test/conversation-fixtures";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: { success: toastSuccess, error: vi.fn() },
}));

const LIVE = '[aria-live="polite"]';

beforeEach(() => {
  supabaseMock.resetMocks();
  supabaseMock.setSession(fakeSession());
  toastSuccess.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document.documentElement, "scrollHeight");
});

const textbox = () => screen.findByRole("textbox", { name: "Ton message à Alice" });

/** Page loin du bas : les nouveaux messages ne doivent pas faire défiler. */
function scrollAwayFromBottom() {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 5000,
  });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

function incoming(state: ReturnType<typeof setupMessaging>, index: number, body: string) {
  state.messages.push(messageRow(index, { body }));
  act(() =>
    supabaseMock.emitBroadcast(`conversation:${ID.conversation}`, "message_created", {
      conversation_id: ID.conversation,
      message_id: messageRow(index).id,
      sender_id: "owner-1",
      created_at: stamp(index),
    }),
  );
}

describe("fil de messages", () => {
  it("affiche en-tête, bulles dans l'ordre, sauts de ligne conservés et « Lu » sous mon dernier message lu", async () => {
    setupMessaging({
      messages: [
        messageRow(1, { body: "Bonjour,\nencore dispo ?" }),
        messageRow(2, { sender_id: "user-1", body: "Oui !", read_at: stamp(3) }),
        messageRow(3, { sender_id: "user-1", body: "Je suis là samedi", read_at: stamp(4) }),
        messageRow(4, { sender_id: "user-1", body: "Et dimanche", read_at: null }),
      ],
      conversation: convRow({ listing_status: "reservee" }),
    });
    renderApp(routes, CONVERSATION_PATH);

    expect(await screen.findByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Crochet" })).toHaveAttribute(
      "href",
      `/annonces/${ID.listing}`,
    );
    expect(screen.getByText("Réservée")).toBeVisible();
    expect(document.title).toBe("Conversation avec Alice · adhd-material");

    const items = within(await screen.findByRole("list", { name: "Messages" })).getAllByRole(
      "listitem",
    );
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Bonjour,\nencore dispo ?"),
      expect.stringContaining("Oui !"),
      expect.stringContaining("Je suis là samedi"),
      expect.stringContaining("Et dimanche"),
    ]);
    const multiline = screen.getByText(
      (_, element) =>
        element?.textContent === "Bonjour,\nencore dispo ?" && element.tagName === "P",
    );
    expect(multiline).toHaveClass("whitespace-pre-wrap");
    // Une seule mention « Lu » : sous le dernier message lu, pas sous le précédent ni sous le non lu.
    expect(screen.getAllByText(/Lu$/)).toHaveLength(1);
    expect(within(items[2]!).getByText(/Lu$/)).toBeInTheDocument();
    expect(within(items[0]!).getByText("Alice :")).toHaveClass("sr-only");
    expect(within(items[1]!).getByText("Toi :")).toHaveClass("sr-only");
  });

  it("fil vide côté demandeur : invitation à écrire le premier message", async () => {
    setupMessaging({ messages: [] });
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByText("Écris ton premier message à Alice.")).toBeVisible();
    expect(await textbox()).toBeVisible();
  });

  it("descend en bas du fil au premier affichage", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    expect(scrollTo).toHaveBeenCalled();
  });

  it("conversation introuvable : page d'erreur simple, sans abonnement", async () => {
    setupMessaging({ conversation: null });
    renderApp(routes, CONVERSATION_PATH);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Cette conversation est introuvable" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir mes messages" })).toHaveAttribute(
      "href",
      "/messages",
    );
    await waitFor(() => expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1));
    expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(0);
  });

  it("identifiant invalide : même page, aucune requête de conversation", async () => {
    const state = setupMessaging();
    renderApp(routes, "/messages/pas-un-uuid");
    expect(await screen.findByRole("heading", { name: /introuvable/ })).toBeVisible();
    expect(state.rpcCalls.get_conversation).toBeUndefined();
  });

  it("échec de chargement de la conversation : Réessayer", async () => {
    const state = setupMessaging({ rpcErrors: { get_conversation: { code: "XX000" } } });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByRole("alert")).toHaveTextContent("Quelque chose n'a pas marché");
    state.rpcErrors = {};
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
  });

  it("échec de chargement des messages : Réessayer", async () => {
    const state = setupMessaging({ readError: { code: "XX000" } });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("Quelque chose n'a pas marché");
    state.readError = null;
    state.messages = [messageRow(1)];
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Message 1")).toBeVisible();
  });

  it("autre compte supprimé : zone de saisie remplacée par une explication", async () => {
    setupMessaging({
      conversation: convRow({ is_closed: true, other_display_name: null }),
      messages: [messageRow(1)],
    });
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByRole("heading", { level: 1, name: "Membre supprimé" })).toBeVisible();
    expect(screen.getByText(/en lecture seule/)).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });
});

describe("pagination", () => {
  it("charge d'abord 30 messages, puis les plus anciens par curseur (date conservée en chaîne)", async () => {
    const state = setupMessaging({
      messages: Array.from({ length: 45 }, (_, index) => messageRow(index + 1)),
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);

    await screen.findByText("Message 45");
    const list = screen.getByRole("list", { name: "Messages" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    expect(screen.queryByText("Message 15")).not.toBeInTheDocument();
    expect(screen.getByText("Message 16")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Messages plus anciens" }));
    await screen.findByText("Message 1");
    expect(
      within(screen.getByRole("list", { name: "Messages" })).getAllByRole("listitem"),
    ).toHaveLength(45);
    // Ordre de lecture conservé : le plus ancien en premier.
    const texts = within(screen.getByRole("list", { name: "Messages" }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    expect(texts).toEqual(Array.from({ length: 45 }, (_, index) => `Message ${index + 1}`));

    const cursorCall = state.messageReads.flat().find((call) => call.method === "or")
      ?.args[0] as string;
    expect(cursorCall).toBe(
      `created_at.lt.${stamp(16)},and(created_at.eq.${stamp(16)},id.lt.${messageRow(16).id})`,
    );
    // Plus rien à charger : le bouton disparaît et le focus reste dans le fil.
    expect(screen.queryByRole("button", { name: "Messages plus anciens" })).not.toBeInTheDocument();
    expect(list.parentElement).toHaveFocus();
  });

  it("pas de bouton quand le fil tient dans une page", async () => {
    setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    expect(screen.queryByRole("button", { name: "Messages plus anciens" })).not.toBeInTheDocument();
  });

  it("échec du chargement des anciens : message, bouton toujours là", async () => {
    const state = setupMessaging({
      messages: Array.from({ length: 31 }, (_, index) => messageRow(index + 1)),
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 31");
    state.readError = { code: "XX000" };
    await user.click(screen.getByRole("button", { name: "Messages plus anciens" }));
    expect(await screen.findByText(/n'ont pas pu être chargés/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Messages plus anciens" })).toBeEnabled();
  });
});

describe("envoi", () => {
  it("envoie le texte nettoyé, vide la zone, rend le focus et affiche le message", async () => {
    const state = setupMessaging();
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();

    await user.type(input, "  Salut !{Enter}À samedi  ");
    expect(input).toHaveValue("  Salut !\nÀ samedi  ");
    await user.click(send);

    await waitFor(() =>
      expect(state.sent).toEqual([
        {
          conversation_id: ID.conversation,
          body: "Salut !\nÀ samedi",
          client_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
      ]),
    );
    expect(
      await screen.findByText(
        (_, element) => element?.textContent === "Salut !\nÀ samedi" && element.tagName === "P",
      ),
    ).toBeVisible();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(send).toBeDisabled();
  });

  it("Entrée seule = nouvelle ligne ; Ctrl+Entrée et Cmd+Entrée envoient", async () => {
    const state = setupMessaging();
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();

    await user.type(input, "un{Enter}deux");
    expect(state.sent).toHaveLength(0);
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(state.sent.map((m) => m.body)).toEqual(["un\ndeux"]));

    await user.type(input, "trois");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(state.sent.map((m) => m.body)).toEqual(["un\ndeux", "trois"]));
  });

  it("pas de double envoi : un second Ctrl+Entrée pendant l'envoi est ignoré", async () => {
    const state = setupMessaging();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    fireEvent.change(input, { target: { value: "Une seule fois" } });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
      fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    });
    await waitFor(() => expect(input).toHaveValue(""));
    expect(state.sent).toHaveLength(1);
  });

  it("un texte blanc n'est pas envoyé", async () => {
    const state = setupMessaging();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    fireEvent.change(input, { target: { value: "   \n  " } });
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(state.sent).toHaveLength(0);
  });

  it("échec : message d'erreur, texte conservé, focus rendu, Réessayer renvoie le même texte", async () => {
    const state = setupMessaging({
      sendError: { code: "PT429", hint: "message_rate_limit", message: "interne" },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await user.type(input, "Mon message");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tu envoies beaucoup de messages");
    expect(alert).not.toHaveTextContent("interne");
    expect(input).toHaveValue("Mon message");
    expect(input).toHaveFocus();

    state.sendError = null;
    expect(alert).not.toContainElement(screen.getByRole("button", { name: "Réessayer" }));
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(state.sent.map((m) => m.body)).toEqual(["Mon message"]));
    // Même client_id au réessai : pas de doublon si le premier envoi était en fait passé.
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1]).toBe(state.attempts[0]);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("panne réseau : message de connexion, texte conservé", async () => {
    setupMessaging({ sendError: { message: "TypeError: Failed to fetch" } });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await user.type(input, "Coucou");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pas de connexion");
    expect(input).toHaveValue("Coucou");
  });

  it("conversation fermée entre-temps : message clair, pas de Réessayer, l'en-tête est rechargé", async () => {
    const state = setupMessaging({
      sendError: { code: "42501", hint: "conversation_closed", message: "x" },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await user.type(input, "Allô ?");
    state.conversation = convRow({ is_closed: true, other_display_name: null });
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(await screen.findByText(/en lecture seule/)).toBeVisible();
    expect(await screen.findByRole("heading", { level: 1, name: "Membre supprimé" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("compteur près de la limite ; au-delà, envoi bloqué avec explication", async () => {
    const state = setupMessaging();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();

    fireEvent.change(input, { target: { value: "a".repeat(1799) } });
    expect(screen.queryByText(/caractères/)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "a".repeat(1850) } });
    expect(screen.getByText("1850 / 2000 caractères")).toBeVisible();
    expect(input).toHaveAccessibleDescription("1850 / 2000 caractères");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "a".repeat(2001) } });
    expect(screen.getByText(/2001 \/ 2000 caractères : raccourcis ton message/)).toBeVisible();
    expect(input).toBeInvalid();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(state.sent).toHaveLength(0);
  });
});

describe("lecture", () => {
  it("marque la conversation comme lue à l'ouverture, puis à chaque message reçu", async () => {
    const state = setupMessaging({
      messages: [messageRow(1)],
      conversation: convRow({ unread_count: 1 }),
    });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(1));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("mark_conversation_read", {
      p_conversation_id: ID.conversation,
    });

    incoming(state, 2, "Et ça ?");
    await screen.findByText("Et ça ?");
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(2));
  });

  it("onglet masqué : pas de marquage avant qu'il redevienne visible", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const state = setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.rpcCalls.mark_conversation_read).toBeUndefined();

    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(1));
  });

  it("ne marque pas deux fois la même situation (retour d'onglet sans rien de nouveau)", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(1));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.rpcCalls.mark_conversation_read).toBe(1);
  });
});

describe("temps réel", () => {
  it("s'abonne au canal privé de la conversation une fois qu'elle est visible", async () => {
    setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)[0]?.config).toEqual({
      config: { private: true },
    });
  });

  it("message reçu en bas du fil : affiché, annoncé (sans relire le fil), reste en bas", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const scrollTo = vi.spyOn(window, "scrollTo");
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    expect(document.querySelector(LIVE)).toHaveTextContent("");
    scrollTo.mockClear();

    incoming(state, 2, "Nouveau !");
    expect(await screen.findByText("Nouveau !")).toBeVisible();
    expect(document.querySelector(LIVE)).toHaveTextContent("Alice : Nouveau !");
    expect(document.querySelector(LIVE)).not.toHaveTextContent("Message 1");
    expect(scrollTo).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Nouveau message" })).not.toBeInTheDocument();
  });

  it("message reçu pendant la lecture d'anciens messages : indicateur « Nouveau message » au lieu de défiler", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    scrollAwayFromBottom();
    const scrollTo = vi.spyOn(window, "scrollTo");

    incoming(state, 2, "Tu es là ?");
    expect(await screen.findByText("Tu es là ?")).toBeInTheDocument();
    const jump = await screen.findByRole("button", { name: "Nouveau message" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.querySelector(LIVE)).toHaveTextContent("Alice : Tu es là ?");

    await user.click(jump);
    expect(scrollTo).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Nouveau message" })).not.toBeInTheDocument();
  });

  it("mon propre message fait toujours défiler, sans annonce", async () => {
    setupMessaging({ messages: [messageRow(1)] });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await screen.findByText("Message 1");
    scrollAwayFromBottom();
    const scrollTo = vi.spyOn(window, "scrollTo");
    await user.type(input, "Moi");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText("Moi", { selector: "p" });
    expect(scrollTo).toHaveBeenCalled();
    expect(document.querySelector(LIVE)).toHaveTextContent("");
  });

  it("messages_read : « Lu » apparaît sous mon dernier message", async () => {
    const state = setupMessaging({
      messages: [messageRow(1, { sender_id: "user-1", body: "Salut" })],
    });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Salut");
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    expect(screen.queryByText(/Lu$/)).not.toBeInTheDocument();

    state.messages = [messageRow(1, { sender_id: "user-1", body: "Salut", read_at: stamp(5) })];
    act(() =>
      supabaseMock.emitBroadcast(`conversation:${ID.conversation}`, "messages_read", {
        conversation_id: ID.conversation,
        count: 1,
        reader_id: "owner-1",
      }),
    );
    expect(await screen.findByText(/Lu$/)).toBeVisible();
  });

  it("reconnexion : un nouvel abonnement réussi rattrape les messages manqués", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    const topic = `conversation:${ID.conversation}`;
    await waitFor(() => expect(supabaseMock.activeChannels(topic)).toHaveLength(1));

    act(() => supabaseMock.emitChannelStatus(topic, "CHANNEL_ERROR"));
    state.messages.push(messageRow(2, { body: "Pendant la coupure" }));
    act(() => supabaseMock.emitChannelStatus(topic, "SUBSCRIBED"));
    expect(await screen.findByText("Pendant la coupure")).toBeVisible();
  });

  it("propriétaire sans message : la conversation apparaît quand inbox_changed la rend visible", async () => {
    const state = setupMessaging({ conversation: null });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByRole("heading", { name: /introuvable/ });
    await waitFor(() => expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1));

    state.conversation = convRow({ role: "owner" });
    state.messages = [messageRow(1, { body: "Bonjour, c'est dispo ?" })];
    act(() =>
      supabaseMock.emitBroadcast("user:user-1", "inbox_changed", {
        conversation_id: ID.conversation,
        reason: "message",
      }),
    );
    expect(await screen.findByText("Bonjour, c'est dispo ?")).toBeVisible();
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
  });

  it("quitter la page retire le canal de la conversation", async () => {
    setupMessaging({ messages: [messageRow(1)] });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    await user.click(screen.getByRole("link", { name: /Tous les messages/ }));
    await screen.findByRole("heading", { level: 1, name: "Messages" });
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(0),
    );
    expect(supabaseMock.activeChannels("user:user-1")).toHaveLength(1);
  });
});

describe("prêt, côté propriétaire", () => {
  const owner = (overrides: Record<string, unknown> = {}) =>
    convRow({
      role: "owner",
      listing_kind: "pret",
      other_display_name: "Bob",
      ...overrides,
    });
  const messages = [messageRow(1, { body: "Je peux l'emprunter ?" })];

  it("annonce de don : aucun panneau de prêt", async () => {
    setupMessaging({ conversation: owner({ listing_kind: "don" }), messages });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Je peux l'emprunter ?");
    expect(screen.queryByRole("button", { name: /Prêter/ })).not.toBeInTheDocument();
  });

  it("prête avec une date de retour (fin de journée locale), après confirmation", async () => {
    const state = setupMessaging({ conversation: owner(), messages });
    const user = userEvent.setup();
    const { queryClient } = renderApp(routes, CONVERSATION_PATH);
    queryClient.setQueryData(listingKeys.detail(ID.listing), { id: ID.listing });

    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Prêter ce matériel à Bob ?" });
    const date = within(dialog).getByLabelText("Date de retour prévue (facultatif)");
    const today = new Date();
    const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(date).toHaveAttribute("min", min);
    expect(state.rpcCalls.start_loan).toBeUndefined();

    fireEvent.change(date, { target: { value: "2099-12-24" } });
    // Le serveur répond avec le prêt ouvert.
    state.conversation = owner({
      loan_id: "loan-1",
      listing_status: "pretee",
      loan_started_at: "2026-11-23T10:00:00+00:00",
      loan_due_at: new Date(2099, 11, 24, 23, 59, 59).toISOString(),
    });
    await user.click(within(dialog).getByRole("button", { name: "Oui, je le prête" }));

    await waitFor(() => expect(state.rpcCalls.start_loan).toBe(1));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("start_loan", {
      p_conversation_id: ID.conversation,
      p_due_at: new Date(2099, 11, 24, 23, 59, 59).toISOString(),
    });
    const giveBack = await screen.findByRole("button", { name: "Marquer comme rendu" });
    expect(
      screen.getByText(
        "Prêté à Bob depuis le 23 novembre 2026 (retour prévu le 24 décembre 2099).",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(giveBack).toHaveFocus());
    expect(toastSuccess).toHaveBeenCalledWith("Prêt enregistré");
    // Le statut de l'annonce a changé : les annonces en cache sont à relire.
    expect(queryClient.getQueryState(listingKeys.detail(ID.listing))?.isInvalidated).toBe(true);
    expect(screen.getByText("Prêtée en ce moment")).toBeVisible();
  });

  it("date de retour facultative : sans date, p_due_at n'est pas envoyé", async () => {
    const state = setupMessaging({ conversation: owner(), messages });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    await user.click(await screen.findByRole("button", { name: "Oui, je le prête" }));
    await waitFor(() => expect(state.rpcCalls.start_loan).toBe(1));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("start_loan", {
      p_conversation_id: ID.conversation,
    });
  });

  it("date passée : refusée avant tout appel", async () => {
    const state = setupMessaging({ conversation: owner(), messages });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText(/Date de retour/), {
      target: { value: "2020-01-01" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Oui, je le prête" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "La date de retour doit être à partir d'aujourd'hui.",
    );
    expect(state.rpcCalls.start_loan).toBeUndefined();
  });

  it("Annuler ferme la confirmation sans rien enregistrer et rend le focus au bouton", async () => {
    const state = setupMessaging({ conversation: owner(), messages });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const open = await screen.findByRole("button", { name: "Prêter à Bob" });
    await user.click(open);
    await user.click(await screen.findByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(state.rpcCalls.start_loan).toBeUndefined();
    await waitFor(() => expect(open).toHaveFocus());
  });

  it.each([
    ["loan_already_open", "déjà prêté"],
    ["listing_not_available", "n'est plus disponible"],
    ["due_date_invalid", "à partir d'aujourd'hui"],
    ["conversation_closed", "n'a plus de compte"],
    ["listing_not_loanable", "pas une annonce de prêt"],
  ])("erreur %s : message dans la confirmation, qui reste ouverte", async (hint, text) => {
    setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { start_loan: { code: "23514", hint, message: "interne" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Oui, je le prête" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(text);
    expect(within(dialog).getByRole("button", { name: "Oui, je le prête" })).toBeEnabled();
  });

  it("prêt ouvert : dates affichées, « Marquer comme rendu » avec confirmation", async () => {
    const state = setupMessaging({
      conversation: owner({
        loan_id: "loan-1",
        listing_status: "pretee",
        loan_started_at: "2026-11-20T10:00:00+00:00",
        loan_due_at: null,
      }),
      messages,
    });
    const user = userEvent.setup();
    const { queryClient } = renderApp(routes, CONVERSATION_PATH);
    queryClient.setQueryData(listingKeys.detail(ID.listing), { id: ID.listing });

    expect(await screen.findByText("Prêté à Bob depuis le 20 novembre 2026.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Prêter/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Marquer comme rendu" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Bob t'a rendu le matériel ?" });
    expect(state.rpcCalls.return_loan).toBeUndefined();

    state.conversation = owner({ listing_status: "disponible" });
    await user.click(within(dialog).getByRole("button", { name: "Oui, il est rendu" }));
    await waitFor(() => expect(state.rpcCalls.return_loan).toBe(1));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("return_loan", { p_loan_id: "loan-1" });

    const lend = await screen.findByRole("button", { name: "Prêter à Bob" });
    await waitFor(() => expect(lend).toHaveFocus());
    expect(toastSuccess).toHaveBeenCalledWith("Matériel marqué comme rendu");
    expect(queryClient.getQueryState(listingKeys.detail(ID.listing))?.isInvalidated).toBe(true);
  });

  it("retour : « déjà rendu » (autre appareil, réessai) vaut succès, la confirmation se ferme", async () => {
    const state = setupMessaging({
      conversation: owner({ loan_id: "loan-1", listing_status: "pretee" }),
      messages,
      rpcErrors: { return_loan: { code: "23514", hint: "loan_already_returned", message: "x" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Marquer comme rendu" }));
    const dialog = await screen.findByRole("alertdialog");
    state.conversation = owner({ listing_status: "disponible" });
    await user.click(within(dialog).getByRole("button", { name: "Oui, il est rendu" }));
    expect(await screen.findByRole("button", { name: "Prêter à Bob" })).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("annonce prêtée à quelqu'un d'autre (pas de prêt pour ce demandeur) : aucune action", async () => {
    setupMessaging({ conversation: owner({ listing_status: "pretee", loan_id: null }), messages });
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByText("Déjà prêté à quelqu'un d'autre.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Prêter|rendu/ })).not.toBeInTheDocument();
  });

  it("conversation fermée ou annonce archivée : pas de bouton Prêter", async () => {
    setupMessaging({
      conversation: owner({ is_closed: true, other_display_name: null }),
      messages,
    });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Je peux l'emprunter ?");
    expect(screen.queryByRole("button", { name: /Prêter/ })).not.toBeInTheDocument();
  });

  it("loan_changed : l'état du prêt est relu", async () => {
    const state = setupMessaging({ conversation: owner(), messages });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByRole("button", { name: "Prêter à Bob" });
    await waitFor(() =>
      expect(supabaseMock.activeChannels(`conversation:${ID.conversation}`)).toHaveLength(1),
    );
    state.conversation = owner({ loan_id: "loan-9", listing_status: "pretee" });
    act(() =>
      supabaseMock.emitBroadcast(`conversation:${ID.conversation}`, "loan_changed", {
        conversation_id: ID.conversation,
        loan_id: "loan-9",
        listing_id: ID.listing,
        returned: false,
      }),
    );
    expect(await screen.findByRole("button", { name: "Marquer comme rendu" })).toBeVisible();
  });
});

describe("prêt, côté demandeur", () => {
  const requester = (overrides: Record<string, unknown> = {}) =>
    convRow({ listing_kind: "pret", ...overrides });

  it("prêt ouvert : « <pseudo> te prête ce matériel… »", async () => {
    setupMessaging({
      conversation: requester({
        loan_id: "loan-1",
        listing_status: "pretee",
        loan_started_at: "2026-11-20T10:00:00+00:00",
        loan_due_at: "2026-12-05T12:00:00+00:00",
      }),
      messages: [messageRow(1)],
    });
    renderApp(routes, CONVERSATION_PATH);
    expect(
      await screen.findByText(
        "Alice te prête ce matériel depuis le 20 novembre 2026 (retour prévu le 5 décembre 2026).",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Prêter|rendu/ })).not.toBeInTheDocument();
  });

  it("prêtée à quelqu'un d'autre : l'indique, sans action", async () => {
    setupMessaging({
      conversation: requester({ listing_status: "pretee", loan_id: null }),
      messages: [messageRow(1)],
    });
    renderApp(routes, CONVERSATION_PATH);
    expect(await screen.findByText(/prêté à quelqu'un d'autre/)).toBeVisible();
  });

  it("annonce disponible : rien", async () => {
    setupMessaging({ conversation: requester(), messages: [messageRow(1)] });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    expect(screen.queryByText(/te prête/)).not.toBeInTheDocument();
  });
});

describe("fiabilité de l'envoi", () => {
  it("nouveau client_id quand le texte change après un échec, le même sinon", async () => {
    const state = setupMessaging({ sendError: { code: "XX000", message: "x" } });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await user.type(input, "Un");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(state.attempts).toHaveLength(2));
    await screen.findByRole("alert");
    await user.type(input, " deux");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(state.attempts).toHaveLength(3));
    expect(state.attempts[1]).toBe(state.attempts[0]);
    expect(state.attempts[2]).not.toBe(state.attempts[0]);
  });

  it("issue incertaine puis réessai : 23505 vaut succès (texte vidé, pas d'erreur, pas de doublon)", async () => {
    const state = setupMessaging({ sendError: { message: "TypeError: Failed to fetch" } });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    await user.type(input, "Coucou");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByRole("alert");

    // Le premier envoi était en fait arrivé jusqu'au serveur.
    state.sendError = null;
    state.sent.push({
      conversation_id: ID.conversation,
      body: "Coucou",
      client_id: state.attempts[0]!,
    });
    state.messages.push(messageRow(900, { sender_id: "user-1", body: "Coucou" }));
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText("Coucou", { selector: "p" })).toBeVisible();
    expect(state.sent).toHaveLength(1);
  });

  it("texte retapé pendant l'envoi : il n'est pas effacé à l'arrivée de la réponse", async () => {
    setupMessaging();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    fireEvent.change(input, { target: { value: "Premier" } });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
      fireEvent.change(input, { target: { value: "Deuxième" } });
    });
    await screen.findByText("Premier", { selector: "p" });
    expect(input).toHaveValue("Deuxième");
  });

  it("compte les caractères (points de code) : un emoji vaut 1", async () => {
    setupMessaging();
    renderApp(routes, CONVERSATION_PATH);
    const input = await textbox();
    fireEvent.change(input, { target: { value: "😀".repeat(1800) } });
    expect(screen.getByText("1800 / 2000 caractères")).toBeVisible();
    fireEvent.change(input, { target: { value: "😀".repeat(2000) } });
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled();
  });
});

describe("temps réel : une requête par besoin", () => {
  const topic = `conversation:${ID.conversation}`;

  async function open(state: ReturnType<typeof setupMessaging>) {
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() => expect(supabaseMock.activeChannels(topic)).toHaveLength(1));
    // Laisse passer la resynchronisation du premier abonnement.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return state.messageReads.length;
  }

  it("ignore mes propres événements (message_created, messages_read)", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const before = await open(state);
    act(() => {
      supabaseMock.emitBroadcast(topic, "message_created", { sender_id: "user-1" });
      supabaseMock.emitBroadcast(topic, "messages_read", { reader_id: "user-1", count: 1 });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.messageReads.length).toBe(before);
  });

  it("message de l'autre : relit seulement la première page du fil (une requête)", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const before = await open(state);
    incoming(state, 2, "Salut");
    await screen.findByText("Salut");
    expect(state.messageReads.length).toBe(before + 1);
    expect(state.messageReads.at(-1)?.some((call) => call.method === "or")).toBe(false);
  });

  it("inbox_changed ne relit pas le fil (liste, badge, en-tête seulement)", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const before = await open(state);
    const detailBefore = state.rpcCalls.get_conversation ?? 0;
    act(() =>
      supabaseMock.emitBroadcast("user:user-1", "inbox_changed", {
        conversation_id: ID.conversation,
        reason: "message",
      }),
    );
    await waitFor(() => expect(state.rpcCalls.get_conversation).toBe(detailBefore + 1));
    expect(state.messageReads.length).toBe(before);
  });

  /** Onglet caché puis redevenu visible `awayMs` plus tard (horloge avancée, sans attendre). */
  function hideThenShow(awayMs: number) {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const realNow = Date.now.bind(Date);
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + offset);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    offset = awayMs;
    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  it("retour d'onglet après une longue absence : relit l'en-tête, le fil et la boîte de réception", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const before = await open(state);
    const unreadBefore = state.rpcCalls.get_unread_count ?? 0;
    state.messages.push(messageRow(2, { body: "Manqué pendant la veille" }));
    hideThenShow(60_000);
    expect(await screen.findByText("Manqué pendant la veille")).toBeVisible();
    expect(state.messageReads.length).toBeGreaterThan(before);
    await waitFor(() => expect(state.rpcCalls.get_unread_count).toBeGreaterThan(unreadBefore));
  });

  it("retour d'onglet rapide (moins de 30 s) : rien n'est relu", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    const before = await open(state);
    const unreadBefore = state.rpcCalls.get_unread_count ?? 0;
    const detailBefore = state.rpcCalls.get_conversation ?? 0;
    hideThenShow(5_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.messageReads.length).toBe(before);
    expect(state.rpcCalls.get_unread_count ?? 0).toBe(unreadBefore);
    expect(state.rpcCalls.get_conversation ?? 0).toBe(detailBefore);
  });

  it("premier abonnement : le fil est toujours relu, même si la lecture initiale est récente", async () => {
    const state = setupMessaging({ messages: [messageRow(1)] });
    // Message arrivé entre la lecture initiale du fil et l'abonnement (la lecture initiale est faite
    // quand l'authentification du canal se termine).
    supabaseMock.realtime.setAuth.mockImplementation(async () => {
      await vi.waitFor(() => expect(state.messageReads.length).toBeGreaterThan(0));
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (!state.messages.some((m) => m.body === "Pendant l'abonnement")) {
        state.messages.push(messageRow(2, { body: "Pendant l'abonnement" }));
      }
    });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    expect(await screen.findByText("Pendant l'abonnement")).toBeVisible();
  });

  it("marquage « lu » en échec : réessayé au retour d'onglet", async () => {
    const state = setupMessaging({
      messages: [messageRow(1)],
      rpcErrors: { mark_conversation_read: { code: "XX000" } },
    });
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 1");
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(1));
    state.rpcErrors = {};
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(state.rpcCalls.mark_conversation_read).toBe(2));
  });
});

describe("focus et confirmations de prêt en erreur", () => {
  const owner = (overrides: Record<string, unknown> = {}) =>
    convRow({ role: "owner", listing_kind: "pret", other_display_name: "Bob", ...overrides });
  const messages = [messageRow(1, { body: "Je peux l'emprunter ?" })];

  it("« Oui, je le prête » en erreur : le focus revient au bouton", async () => {
    setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { start_loan: { code: "23514", hint: "loan_already_open", message: "x" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    await user.click(await screen.findByRole("button", { name: "Oui, je le prête" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Oui, je le prête" })).toHaveFocus(),
    );
  });

  it("« Oui, il est rendu » en erreur : le focus revient au bouton", async () => {
    setupMessaging({
      conversation: owner({ loan_id: "loan-1", listing_status: "pretee" }),
      messages,
      rpcErrors: { return_loan: { code: "XX000", message: "x" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Marquer comme rendu" }));
    await user.click(await screen.findByRole("button", { name: "Oui, il est rendu" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Oui, il est rendu" })).toHaveFocus(),
    );
  });

  it("la relecture change le statut pendant l'erreur : la confirmation reste ouverte avec son message", async () => {
    const state = setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { start_loan: { code: "23514", hint: "listing_not_available", message: "x" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    const dialog = await screen.findByRole("alertdialog");
    state.conversation = owner({ listing_status: "archivee" });
    await user.click(within(dialog).getByRole("button", { name: "Oui, je le prête" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("n'est plus disponible");
    await waitFor(() => expect(state.rpcCalls.get_conversation).toBeGreaterThan(1));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    // À la fermeture, plus de bouton dans le panneau : le focus se replie sur le titre de la page.
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Annuler" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  });

  it("prêt créé malgré une erreur réseau : la confirmation se ferme et le prêt est confirmé", async () => {
    const state = setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { start_loan: { message: "TypeError: Failed to fetch" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Prêter à Bob" }));
    state.conversation = owner({ loan_id: "loan-1", listing_status: "pretee" });
    await user.click(await screen.findByRole("button", { name: "Oui, je le prête" }));
    expect(await screen.findByRole("button", { name: "Marquer comme rendu" })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith("Le prêt est bien enregistré");
  });
});

describe("retour du matériel : issues incertaines", () => {
  const owner = (overrides: Record<string, unknown> = {}) =>
    convRow({
      role: "owner",
      listing_kind: "pret",
      other_display_name: "Bob",
      loan_id: "loan-1",
      listing_status: "pretee",
      ...overrides,
    });
  const messages = [messageRow(1)];

  it("rendu malgré une erreur réseau : la confirmation se ferme et le retour est confirmé", async () => {
    const state = setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { return_loan: { message: "TypeError: Failed to fetch" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Marquer comme rendu" }));
    state.conversation = owner({ loan_id: null, listing_status: "disponible" });
    await user.click(await screen.findByRole("button", { name: "Oui, il est rendu" }));
    expect(await screen.findByRole("button", { name: "Prêter à Bob" })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith("Matériel marqué comme rendu");
  });

  it("loan_not_found : l'erreur reste affichée même si la relecture ne montre plus de prêt", async () => {
    const state = setupMessaging({
      conversation: owner(),
      messages,
      rpcErrors: { return_loan: { code: "42501", hint: "loan_not_found", message: "x" } },
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await user.click(await screen.findByRole("button", { name: "Marquer comme rendu" }));
    const dialog = await screen.findByRole("alertdialog");
    state.conversation = owner({ loan_id: null, listing_status: "disponible" });
    await user.click(within(dialog).getByRole("button", { name: "Oui, il est rendu" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ce prêt n'existe plus");
    await waitFor(() => expect(state.rpcCalls.get_conversation).toBeGreaterThan(1));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("pagination : focus", () => {
  it("« Messages plus anciens » garde le focus pendant le chargement et après une erreur", async () => {
    const state = setupMessaging({
      messages: Array.from({ length: 31 }, (_, index) => messageRow(index + 1)),
    });
    const user = userEvent.setup();
    renderApp(routes, CONVERSATION_PATH);
    await screen.findByText("Message 31");
    const button = screen.getByRole("button", { name: "Messages plus anciens" });
    state.readError = { code: "XX000" };
    await user.click(button);
    await screen.findByText(/n'ont pas pu être chargés/);
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
  });
});
