import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, queryHandler, supabaseMock } from "@/test/supabase-mock";
import { ID, detailRow, mockPublicStorage, profileRpc } from "@/test/listing-fixtures";
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

const PATH = `/annonces/${ID.listing}`;

interface Setup {
  row?: Record<string, unknown> | null;
  error?: unknown;
  signedIn?: boolean;
}

function setup({ row = detailRow(), error = null, signedIn = false }: Setup = {}) {
  mockPublicStorage();
  let current = row;
  const calls: { method: string; args: unknown[] }[][] = [];
  const updates: unknown[] = [];
  supabaseMock.rpc.mockImplementation((fn: string) =>
    fn === "get_my_profile" ? profileRpc(null) : Promise.resolve({ data: [], error: null }),
  );
  supabaseMock.from.mockImplementation(() => {
    const handler = queryHandler((recorded) => {
      const update = recorded.find((call) => call.method === "update");
      if (update && current) {
        updates.push(update.args[0]);
        current = { ...current, ...(update.args[0] as object) };
        return { data: [{ id: ID.listing }], error: null };
      }
      return { data: current, error };
    });
    calls.push(handler.calls);
    return handler.builder;
  });
  if (signedIn) supabaseMock.setSession(fakeSession());
  return { calls, updates };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  supabaseMock.resetMocks();
  toastSuccess.mockReset();
});
afterEach(() => vi.useRealTimers());

const newUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("fiche d'une annonce", () => {
  it("affiche la fiche complète, publique, avec les sauts de ligne conservés", async () => {
    const { calls } = setup({ row: detailRow({ status: "reservee" }) });
    renderApp(routes, PATH);

    expect(await screen.findByRole("heading", { level: 1, name: "Crochet" })).toBeVisible();
    expect(screen.getByText("Don")).toBeVisible();
    expect(screen.getByText("Réservée")).toBeVisible();
    expect(screen.getByText(/Paris \(75001, 75002…\)/)).toBeVisible();
    expect(screen.getByText(/par Alice/)).toBeVisible();
    expect(screen.getByText("avant-hier")).toBeVisible();
    expect(document.title).toBe("Crochet · adhd-material");

    const description = screen.getByText(/Crochets et laine\./);
    expect(description).toHaveClass("whitespace-pre-line");
    expect(description.textContent).toBe("Crochets et laine.\nPatrons débutant inclus.");
    expect(screen.getByRole("heading", { name: "Description" })).toBeVisible();
    const experience = screen.getByText(/Arrêté après 3 semaines/);
    expect(experience).toHaveClass("whitespace-pre-line");
    expect(experience.textContent).toBe("Arrêté après 3 semaines.\n\nTrop de comptage.");
    expect(screen.getByRole("heading", { name: "Son expérience" })).toBeVisible();

    const call = (method: string) => calls[0]!.find((entry) => entry.method === method)?.args;
    expect(call("select")?.[0]).toContain("profiles!listings_owner_id_fkey(display_name)");
    expect(call("select")?.[0]).toContain("listing_photos(id, storage_path, position)");
    expect(call("eq")).toEqual(["id", ID.listing]);
    expect(call("order")).toEqual(["position", { referencedTable: "listing_photos" }]);
  });

  it("n'affiche ni description ni expérience quand elles sont vides, et pas de badge pour « disponible »", async () => {
    setup({ row: detailRow({ description: null, experience: "  " }) });
    renderApp(routes, PATH);
    await screen.findByRole("heading", { level: 1, name: "Crochet" });
    expect(screen.queryByRole("heading", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Son expérience" })).not.toBeInTheDocument();
    expect(screen.queryByText("Disponible")).not.toBeInTheDocument();
  });

  it("libellés de statut : donnée et prêtée", async () => {
    setup({ row: detailRow({ status: "donnee" }) });
    renderApp(routes, PATH);
    expect(await screen.findByText("Déjà donnée")).toBeVisible();
  });

  it("galerie : une photo sans vignettes ; trois photos pilotables au clavier", async () => {
    setup({
      row: detailRow({
        listing_photos: [
          { id: "p3", storage_path: "u/c.webp", position: 3 },
          { id: "p1", storage_path: "u/a.webp", position: 1 },
          { id: "p2", storage_path: "u/b.webp", position: 2 },
        ],
      }),
    });
    const user = newUser();
    renderApp(routes, PATH);

    const main = await screen.findByRole("img", { name: "Photo : matériel de crochet (1 sur 3)" });
    expect(main).toHaveAttribute("src", "https://img.test/u/a.webp");
    const second = screen.getByRole("button", { name: "Voir la photo 2 sur 3" });
    expect(screen.getByRole("button", { name: "Voir la photo 1 sur 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    second.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("img", { name: "Photo : matériel de crochet (2 sur 3)" }),
    ).toHaveAttribute("src", "https://img.test/u/b.webp");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveFocus();

    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("img", { name: /3 sur 3/ })).toHaveAttribute(
      "src",
      "https://img.test/u/c.webp",
    );
  });

  it("une seule photo : pas de vignettes", async () => {
    setup();
    renderApp(routes, PATH);
    const image = await screen.findByRole("img", { name: "Photo : matériel de crochet" });
    expect(image).toBeVisible();
    expect(screen.queryByRole("button", { name: /Voir la photo/ })).not.toBeInTheDocument();
  });

  it("annonce absente ou invisible : message clair avec lien vers l'accueil, pas une erreur", async () => {
    setup({ row: null });
    renderApp(routes, PATH);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Cette annonce n'existe plus ou n'est plus visible",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir les annonces" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("identifiant invalide : même message, sans requête", async () => {
    setup();
    renderApp(routes, "/annonces/abc");
    expect(
      await screen.findByRole("heading", { name: /n'existe plus ou n'est plus visible/ }),
    ).toBeVisible();
    expect(supabaseMock.from).not.toHaveBeenCalledWith("listings");
  });

  it("erreur de chargement : message et bouton Réessayer", async () => {
    setup({ error: { code: "XX000", message: "boom" } });
    renderApp(routes, PATH);
    expect(await screen.findByRole("alert")).toHaveTextContent("Quelque chose n'a pas marché");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

describe("fiche : action Contacter", () => {
  it("visiteur : lien « Se connecter pour contacter » qui ramène à la fiche", async () => {
    setup();
    renderApp(routes, PATH);
    const link = await screen.findByRole("link", { name: "Se connecter pour contacter" });
    expect(link).toHaveAttribute("href", `/connexion?suivant=${encodeURIComponent(PATH)}`);
  });

  it("connecté non propriétaire : bouton désactivé « La messagerie arrive bientôt »", async () => {
    setup({ signedIn: true });
    renderApp(routes, PATH);
    expect(
      await screen.findByRole("button", { name: "La messagerie arrive bientôt" }),
    ).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Gérer dans Mes annonces" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Se connecter pour contacter" }),
    ).not.toBeInTheDocument();
  });

  it("propriétaire : pas de Contacter, lien vers Mes annonces et actions de statut", async () => {
    setup({ row: detailRow({ owner_id: "user-1" }), signedIn: true });
    renderApp(routes, PATH);
    expect(await screen.findByRole("link", { name: "Gérer dans Mes annonces" })).toHaveAttribute(
      "href",
      "/mes-annonces",
    );
    expect(
      screen.queryByRole("button", { name: "La messagerie arrive bientôt" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Marquer réservée",
      "Marquer donnée",
      "Archiver",
    ]);
  });

  it("propriétaire : changer le statut met la fiche à jour et rend le focus au premier bouton d'action", async () => {
    const { updates } = setup({ row: detailRow({ owner_id: "user-1" }), signedIn: true });
    const user = newUser();
    renderApp(routes, PATH);

    await user.click(await screen.findByRole("button", { name: /^Marquer réservée/ }));
    await waitFor(() => expect(updates).toEqual([{ status: "reservee" }]));
    const back = await screen.findByRole("button", { name: /^Remettre disponible/ });
    await waitFor(() => expect(back).toHaveFocus());
    expect(screen.getByText("Réservée")).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Annonce marquée comme réservée");
  });

  it("propriétaire d'une annonce prêtée : aucune action, seulement la note", async () => {
    setup({
      row: detailRow({ owner_id: "user-1", status: "pretee", kind: "pret" }),
      signedIn: true,
    });
    renderApp(routes, PATH);
    expect(
      await screen.findByText("Le prêt se gère depuis la conversation (bientôt)."),
    ).toBeVisible();
    expect(screen.getByText("Prêtée en ce moment")).toBeVisible();
    expect(within(screen.getByRole("article")).queryAllByRole("button")).toHaveLength(0);
  });

  it("annonce donnée : pas de Contacter (ni visiteur, ni connecté), seulement le badge", async () => {
    setup({ row: detailRow({ status: "donnee" }) });
    renderApp(routes, PATH);
    expect(await screen.findByText("Déjà donnée")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Se connecter pour contacter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "La messagerie arrive bientôt" }),
    ).not.toBeInTheDocument();
  });

  it("annonce donnée, connecté non propriétaire : pas de Contacter", async () => {
    setup({ row: detailRow({ status: "donnee" }), signedIn: true });
    renderApp(routes, PATH);
    expect(await screen.findByText("Déjà donnée")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "La messagerie arrive bientôt" }),
    ).not.toBeInTheDocument();
  });

  it("annonce donnée, propriétaire : « Remettre disponible » et « Archiver »", async () => {
    setup({ row: detailRow({ owner_id: "user-1", status: "donnee" }), signedIn: true });
    renderApp(routes, PATH);
    await screen.findByRole("link", { name: "Gérer dans Mes annonces" });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Remettre disponible",
      "Archiver",
    ]);
  });
});
