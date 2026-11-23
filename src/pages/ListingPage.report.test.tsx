import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, queryHandler, rpcResult, supabaseMock } from "@/test/supabase-mock";
import { ID, detailRow, mockPublicStorage, profileRpc } from "@/test/listing-fixtures";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";
import {
  REPORT_ALREADY_DONE,
  REPORT_CATEGORY_REQUIRED,
  REPORT_DETAILS_REQUIRED,
  REPORT_DETAILS_TOO_LONG,
  REPORT_DETAILS_TOO_SHORT,
  REPORT_FAILED,
  REPORT_LISTING_UNAVAILABLE,
  REPORT_OWN_LISTING,
  REPORT_RATE_LIMIT,
  REPORT_THANKS,
} from "@/lib/messages";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

const PATH = `/annonces/${ID.listing}`;

type RpcOutcome = { error: unknown } | "pending";

function setup({
  row = detailRow(),
  signedIn = true,
  report = { error: null },
}: {
  row?: Record<string, unknown>;
  signedIn?: boolean;
  report?: RpcOutcome;
} = {}) {
  mockPublicStorage();
  let release: (value: { data: null; error: unknown }) => void = () => {};
  supabaseMock.rpc.mockImplementation((fn: string) => {
    if (fn === "get_my_profile") return profileRpc(null);
    if (fn === "report_listing") {
      if (report !== "pending") return rpcResult({ data: null, error: report.error });
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return rpcResult({ data: [], error: null });
  });
  supabaseMock.from.mockImplementation(
    () => queryHandler(() => ({ data: row, error: null })).builder,
  );
  if (signedIn) supabaseMock.setSession(fakeSession());
  return { release: (error: unknown = null) => release({ data: null, error }) };
}

beforeEach(() => supabaseMock.resetMocks());

const reportCalls = () =>
  supabaseMock.rpc.mock.calls.filter((call) => call[0] === "report_listing");

/** Confirmation « Annonce signalée » (la page a aussi la zone de statut du bandeau hors ligne). */
const reportNote = () =>
  screen.getByText("Annonce signalée.").closest<HTMLElement>("[role=status]")!;

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Signaler cette annonce" }));
  return screen.findByRole("dialog", { name: "Signaler cette annonce" });
}

describe("fiche : signalement", () => {
  it("visiteur : lien vers la connexion avec retour à la fiche, sans dialogue", async () => {
    setup({ signedIn: false });
    renderApp(routes, PATH);
    const link = await screen.findByRole("link", { name: "Signaler cette annonce" });
    expect(link).toHaveAttribute("href", `/connexion?suivant=${encodeURIComponent(PATH)}`);
  });

  it.each([true, false])("annonce sans auteur (connecté : %s) : pas de lien", async (signedIn) => {
    setup({ row: detailRow({ owner_id: null, profiles: null }), signedIn });
    renderApp(routes, PATH);
    await screen.findByRole("heading", { level: 1, name: "Crochet" });
    expect(screen.queryByText("Signaler cette annonce")).not.toBeInTheDocument();
  });

  it("propriétaire : aucun lien pour signaler sa propre annonce", async () => {
    setup({ row: detailRow({ owner_id: "user-1" }) });
    renderApp(routes, PATH);
    await screen.findByRole("link", { name: "Gérer dans Mes annonces" });
    expect(screen.queryByText("Signaler cette annonce")).not.toBeInTheDocument();
  });

  it("dialogue : cinq raisons dans un groupe nommé, précisions facultatives", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    const dialog = await openDialog(user);

    expect(screen.getByRole("group", { name: "Raison du signalement" })).toBeVisible();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent),
    ).toEqual([
      "Arnaque ou demande d'argent",
      "Contenu choquant ou inapproprié",
      "Objet dangereux ou interdit",
      "Données personnelles exposées",
      "Autre raison",
    ]);
    expect(screen.getByLabelText("Précisions (facultatif)")).toBeVisible();
    expect(dialog).toHaveAccessibleDescription(/Ton signalement reste privé/);
    await user.click(screen.getByRole("radio", { name: "Autre raison" }));
    expect(screen.getByLabelText("Précisions")).toBeRequired();
  });

  it("focus initial sur la première raison ; Échap ferme et rend le focus au lien", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await waitFor(() => expect(screen.getAllByRole("radio")[0]).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Signaler cette annonce" })).toHaveFocus();
    expect(reportCalls()).toHaveLength(0);
  });

  it.each([
    [{ code: "23514", hint: "details_too_short" }, REPORT_DETAILS_TOO_SHORT],
    [{ code: "23514", hint: "details_too_long" }, REPORT_DETAILS_TOO_LONG],
    [{ code: "23514", hint: "details_required" }, REPORT_DETAILS_REQUIRED],
  ])("erreur serveur %j : posée sur le champ précisions, avec le focus", async (error, message) => {
    setup({ report: { error } });
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Autre raison" }));
    await user.type(screen.getByLabelText("Précisions"), "abc");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    const field = screen.getByLabelText("Précisions");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toBeInvalid();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(field).toHaveAccessibleDescription(message);
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.type(field, "d");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("envoi réussi : appelle la RPC, ferme, confirme et rend le focus à la confirmation", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);

    await user.click(screen.getByRole("radio", { name: "Arnaque ou demande d'argent" }));
    await user.type(screen.getByLabelText("Précisions (facultatif)"), "  Il demande un virement  ");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(reportCalls()).toEqual([
      [
        "report_listing",
        { p_listing_id: ID.listing, p_category: "arnaque", p_details: "Il demande un virement" },
      ],
    ]);
    const note = reportNote();
    expect(note).toHaveTextContent(`Annonce signalée. ${REPORT_THANKS}`);
    await waitFor(() => expect(note).toHaveFocus());
    expect(
      screen.queryByRole("button", { name: "Signaler cette annonce" }),
    ).not.toBeInTheDocument();
  });

  it("sans précisions : p_details n'est pas envoyé", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Objet dangereux ou interdit" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText(REPORT_THANKS, { exact: false });
    expect(reportCalls()[0]![1]).toEqual({ p_listing_id: ID.listing, p_category: "dangereux" });
  });

  it("sans raison : message près du groupe, focus sur la première raison, aucun envoi", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(REPORT_CATEGORY_REQUIRED);
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    expect(reportCalls()).toHaveLength(0);
  });

  it("« Autre raison » sans précisions, ou précisions trop courtes : message et focus, aucun envoi", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Autre raison" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(REPORT_DETAILS_REQUIRED);
    const field = screen.getByLabelText("Précisions");
    expect(field).toHaveFocus();
    expect(field).toBeInvalid();

    await user.type(field, "ab");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(REPORT_DETAILS_TOO_SHORT);
    expect(reportCalls()).toHaveLength(0);
  });

  it("compteur de caractères seulement près de la limite", async () => {
    setup();
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    const field = screen.getByLabelText("Précisions (facultatif)");
    expect(field).toHaveAttribute("maxlength", "1000");
    await user.type(field, "abc");
    expect(screen.queryByText(/caractères$/)).not.toBeInTheDocument();
    await user.click(field);
    await user.paste("x".repeat(900));
    const counter = screen.getByText("903 / 1 000 caractères");
    expect(counter).toBeVisible();
    expect(counter).not.toHaveAttribute("aria-live");
    expect(field).toHaveAccessibleDescription(/903 \/ 1\s000 caractères/);
  });

  it("double envoi impossible : bouton désactivé, un seul appel, Annuler désactivé, Échap sans effet", async () => {
    const { release } = setup({ report: "pending" });
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Autre raison" }));
    await user.type(screen.getByLabelText("Précisions"), "Louche");
    const send = screen.getByRole("button", { name: "Envoyer" });
    await user.click(send);
    await waitFor(() => expect(send).toBeDisabled());
    await user.click(send);
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(reportCalls()).toHaveLength(1);

    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([
    [{ code: "23514", hint: "listing_unavailable" }, REPORT_LISTING_UNAVAILABLE],
    [{ code: "23514", hint: "own_listing" }, REPORT_OWN_LISTING],
    [{ code: "PT429", hint: "report_rate_limit" }, REPORT_RATE_LIMIT],
    [{ code: "XX000" }, REPORT_FAILED],
  ])(
    "erreur %j : message dans le dialogue, dialogue ouvert, focus rendu à Envoyer",
    async (error, message) => {
      setup({ report: { error } });
      const user = userEvent.setup();
      renderApp(routes, PATH);
      await openDialog(user);
      await user.click(screen.getByRole("radio", { name: "Contenu choquant ou inapproprié" }));
      await user.click(screen.getByRole("button", { name: "Envoyer" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("dialog")).toBeVisible();
      await waitFor(() => expect(screen.getByRole("button", { name: "Envoyer" })).toHaveFocus());
      expect(screen.getByRole("radio", { name: "Contenu choquant ou inapproprié" })).toBeChecked();
    },
  );

  it("already_reported : message doux, pas d'alerte, lien remplacé", async () => {
    setup({ report: { error: { code: "23505", hint: "already_reported" } } });
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Arnaque ou demande d'argent" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const note = reportNote();
    expect(note).toHaveTextContent(`Annonce signalée. ${REPORT_ALREADY_DONE}`);
    await waitFor(() => expect(note).toHaveFocus());
  });

  it("Annuler : ferme et rend le focus au lien, rien n'est envoyé ; la réouverture repart sans erreur", async () => {
    setup({ report: { error: { code: "XX000" } } });
    const user = userEvent.setup();
    renderApp(routes, PATH);
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Arnaque ou demande d'argent" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const link = screen.getByRole("button", { name: "Signaler cette annonce" });
    await waitFor(() => expect(link).toHaveFocus());

    await user.click(link);
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
