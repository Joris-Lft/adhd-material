import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, queryHandler, supabaseMock } from "@/test/supabase-mock";
import { ID, detailRow, directRow, mockPublicStorage, profileRpc } from "@/test/listing-fixtures";
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

type Row = ReturnType<typeof directRow>;
const mine = (index: number, activity: string, status: string, kind = "don"): Row =>
  directRow(index, { activities: { name: activity }, status, kind, profiles: undefined });

interface Setup {
  rows?: Row[];
  updateResult?: { data: unknown; error: unknown };
  signedIn?: boolean;
}

function setup({ rows = [], updateResult, signedIn = true }: Setup = {}) {
  mockPublicStorage();
  let current = rows;
  const updates: { id: unknown; values: unknown }[] = [];
  const reads: { method: string; args: unknown[] }[][] = [];
  supabaseMock.rpc.mockImplementation((fn: string) =>
    fn === "get_my_profile" ? profileRpc(null) : Promise.resolve({ data: [], error: null }),
  );
  supabaseMock.from.mockImplementation(() => {
    const handler = queryHandler((calls) => {
      const update = calls.find((call) => call.method === "update");
      if (!update) {
        reads.push(calls);
        return { data: current, error: null };
      }
      const id = calls.find((call) => call.method === "eq")?.args[1];
      updates.push({ id, values: update.args[0] });
      if (updateResult) return updateResult;
      current = current.map((row) =>
        row.id === id ? { ...row, ...(update.args[0] as object) } : row,
      );
      return { data: [{ id }], error: null };
    });
    return handler.builder;
  });
  if (signedIn) supabaseMock.setSession(fakeSession());
  return { updates, reads };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  supabaseMock.resetMocks();
  toastSuccess.mockReset();
});
afterEach(() => vi.useRealTimers());

const newUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const card = (activity: string) =>
  screen.getByRole("heading", { name: activity }).closest("article") as HTMLElement;
const buttons = (activity: string) =>
  within(card(activity))
    .queryAllByRole("button")
    .map((button) => button.textContent);

const FIVE = [
  mine(1, "Crochet", "disponible", "don"),
  mine(2, "Aquarelle", "disponible", "pret"),
  mine(3, "Guitare", "reservee", "don"),
  mine(4, "Puzzle", "donnee", "don"),
  mine(5, "Tricot", "archivee", "don"),
  mine(6, "Vélo", "pretee", "pret"),
];

describe("route /mes-annonces", () => {
  it("renvoie un visiteur vers la connexion avec retour vers la page", async () => {
    setup({ signedIn: false });
    const { router } = renderApp(routes, "/mes-annonces");
    await waitFor(() => expect(router.state.location.pathname).toBe("/connexion"));
    expect(new URLSearchParams(router.state.location.search).get("suivant")).toBe("/mes-annonces");
  });

  it("le lien « Mes annonces » est dans la navigation des connectés seulement", async () => {
    setup({ signedIn: true });
    renderApp(routes, "/");
    const nav = within(await screen.findByRole("navigation", { name: "Navigation principale" }));
    expect(await nav.findByRole("link", { name: "Mes annonces" })).toHaveAttribute(
      "href",
      "/mes-annonces",
    );
  });

  it("pas de lien « Mes annonces » pour un visiteur", async () => {
    setup({ signedIn: false });
    renderApp(routes, "/");
    const nav = within(await screen.findByRole("navigation", { name: "Navigation principale" }));
    await nav.findByRole("link", { name: "Connexion" });
    expect(nav.queryByRole("link", { name: "Mes annonces" })).not.toBeInTheDocument();
  });
});

describe("Mes annonces", () => {
  it("lit les annonces de l'utilisateur (tous statuts) et les regroupe", async () => {
    const { reads } = setup({ rows: FIVE });
    renderApp(routes, "/mes-annonces");

    expect(await screen.findByRole("heading", { level: 2, name: "En ligne (4)" })).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Terminées et archivées (2)" }),
    ).toBeVisible();
    expect(within(card("Vélo")).getByText("Prêtée en ce moment")).toBeVisible();
    const call = (method: string) => reads[0]!.find((entry) => entry.method === method)?.args;
    expect(call("eq")).toEqual(["owner_id", "user-1"]);
    expect(reads[0]!.some((entry) => entry.method === "in")).toBe(false);
  });

  it("propose les actions selon le statut et le type", async () => {
    setup({ rows: FIVE });
    renderApp(routes, "/mes-annonces");
    await screen.findByRole("heading", { name: "Crochet" });

    expect(buttons("Crochet")).toEqual(["Marquer réservée", "Marquer donnée", "Archiver"]);
    expect(buttons("Aquarelle")).toEqual(["Marquer réservée", "Archiver"]);
    expect(buttons("Guitare")).toEqual(["Remettre disponible", "Marquer donnée", "Archiver"]);
    expect(buttons("Puzzle")).toEqual(["Remettre disponible", "Archiver"]);
    expect(buttons("Tricot")).toEqual(["Republier"]);
    expect(buttons("Vélo")).toEqual([]);
    expect(
      within(card("Vélo")).getByText("Le prêt se gère depuis la conversation (bientôt)."),
    ).toBeVisible();
    // Les boutons se distinguent d'une carte à l'autre pour les lecteurs d'écran.
    expect(
      within(card("Crochet")).getByRole("button", { name: /^Archiver : Crochet, / }),
    ).toBeVisible();
  });

  it("état vide rassurant avec lien Publier", async () => {
    setup({ rows: [] });
    renderApp(routes, "/mes-annonces");
    expect(await screen.findByText(/Tu n'as pas encore d'annonce/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Publier une annonce" })).toHaveAttribute(
      "href",
      "/publier",
    );
  });

  it("« Marquer réservée » met à jour sans confirmation, invalide les listes et rend le focus", async () => {
    const { updates, reads } = setup({ rows: [mine(1, "Crochet", "disponible")] });
    const user = newUser();
    const { queryClient } = renderApp(routes, "/mes-annonces");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: /^Marquer réservée : Crochet, / }));
    await waitFor(() =>
      expect(updates).toEqual([{ id: "listing-1", values: { status: "reservee" } }]),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["listings"] });
    await waitFor(() => expect(reads.length).toBeGreaterThan(1));
    expect(toastSuccess).toHaveBeenCalledWith("Annonce marquée comme réservée");

    const next = await screen.findByRole("button", { name: /^Remettre disponible : Crochet, / });
    await waitFor(() => expect(next).toHaveFocus());
  });

  it("« Marquer donnée » demande confirmation ; Annuler ne change rien et rend le focus au bouton", async () => {
    const { updates } = setup({ rows: [mine(1, "Crochet", "disponible")] });
    const user = newUser();
    renderApp(routes, "/mes-annonces");

    const trigger = await screen.findByRole("button", { name: /^Marquer donnée : Crochet, / });
    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Marquer cette annonce comme donnée ?",
    });
    expect(dialog).toHaveTextContent("Déjà donnée");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(updates).toEqual([]);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("« Archiver » confirmé : la carte passe dans « Terminées et archivées » et garde le focus sur son action", async () => {
    const { updates } = setup({
      rows: [mine(1, "Crochet", "disponible"), mine(2, "Guitare", "reservee")],
    });
    const user = newUser();
    renderApp(routes, "/mes-annonces");

    await user.click(await screen.findByRole("button", { name: /^Archiver : Crochet, / }));
    const dialog = await screen.findByRole("alertdialog", { name: "Archiver cette annonce ?" });
    expect(dialog).toHaveTextContent("Tu pourras la republier");
    await user.click(within(dialog).getByRole("button", { name: "Oui, archiver" }));

    await waitFor(() =>
      expect(updates).toEqual([{ id: "listing-1", values: { status: "archivee" } }]),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Terminées et archivées (1)" }),
    ).toBeVisible();
    const republish = await screen.findByRole("button", { name: /^Republier : Crochet, / });
    await waitFor(() => expect(republish).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Annonce archivée");
  });

  it("« Republier » remet l'annonce disponible sans confirmation", async () => {
    const { updates } = setup({ rows: [mine(5, "Tricot", "archivee")] });
    const user = newUser();
    renderApp(routes, "/mes-annonces");
    await user.click(await screen.findByRole("button", { name: /^Republier : Tricot, / }));
    await waitFor(() =>
      expect(updates).toEqual([{ id: "listing-5", values: { status: "disponible" } }]),
    );
    expect(await screen.findByRole("heading", { level: 2, name: "En ligne (1)" })).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Annonce republiée");
  });

  it.each([
    [
      "photo manquante",
      {
        code: "23514",
        hint: "listing_photo_required",
        message: "Une annonce doit avoir au moins une photo",
      },
      "elle ne peut pas être remise en ligne",
    ],
    [
      "garde « prêtée »",
      { code: "23514", message: "Un prêt est en cours sur cette annonce" },
      "est prêtée en ce moment",
    ],
    ["réseau", { message: "TypeError: Failed to fetch" }, "Pas de connexion"],
    ["serveur", { code: "XX000", message: "boom" }, "Le changement n'a pas abouti"],
  ])("erreur %s : message clair, annonce inchangée, focus conservé", async (_name, error, text) => {
    setup({ rows: [mine(5, "Tricot", "archivee")], updateResult: { data: null, error } });
    const user = newUser();
    renderApp(routes, "/mes-annonces");
    const button = await screen.findByRole("button", { name: /^Republier : Tricot, / });
    await user.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeEnabled());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("aucune ligne modifiée (annonce disparue) : message dédié", async () => {
    setup({ rows: [mine(5, "Tricot", "archivee")], updateResult: { data: [], error: null } });
    const user = newUser();
    renderApp(routes, "/mes-annonces");
    await user.click(await screen.findByRole("button", { name: /^Republier : Tricot, / }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "n'existe plus ou ne t'appartient pas",
    );
  });

  it("action puis navigation immédiate vers la fiche : le titre garde le focus (pas de vol de focus)", async () => {
    mockPublicStorage();
    let status = "disponible";
    supabaseMock.rpc.mockImplementation((fn: string) =>
      fn === "get_my_profile" ? profileRpc(null) : Promise.resolve({ data: [], error: null }),
    );
    supabaseMock.from.mockImplementation(
      () =>
        queryHandler(async (calls) => {
          if (calls.some((call) => call.method === "update")) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            status = "reservee";
            return { data: [{ id: ID.listing }], error: null };
          }
          if (calls.some((call) => call.method === "maybeSingle")) {
            return { data: detailRow({ owner_id: "user-1", status }), error: null };
          }
          return { data: [{ ...mine(1, "Crochet", status), id: ID.listing }], error: null };
        }).builder,
    );
    supabaseMock.setSession(fakeSession());
    const user = newUser();
    renderApp(routes, "/mes-annonces");

    await user.click(await screen.findByRole("button", { name: /^Marquer réservée : Crochet, / }));
    await user.click(screen.getByRole("link", { name: "Crochet" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Crochet" });
    await waitFor(() => expect(heading).toHaveFocus());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Annonce marquée comme réservée"),
    );
    await screen.findByRole("button", { name: /^Remettre disponible : Crochet, / });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heading).toHaveFocus();
  });
});
