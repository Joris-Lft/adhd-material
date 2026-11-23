import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, queryHandler, supabaseMock } from "@/test/supabase-mock";
import { ID, directRow, mockPublicStorage, profileRpc, rpcRow } from "@/test/listing-fixtures";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

const LYON = { id: ID.lyon, name: "Lyon", postal_codes: ["69001"] };
const ALBI = {
  id: "44444444-4444-4444-8444-444444444444",
  insee_code: "81004",
  name: "Albi",
  postal_codes: ["81000"],
};
const PAGE = 24;

const rows = (count: number, make: (index: number) => unknown, from = 0) =>
  Array.from({ length: count }, (_, index) => make(from + index));

interface Options {
  signedIn?: boolean;
  profileCityId?: string | null;
  /** Pages de la RPC search_listings, selon p_offset (0, 24, …) ; ou une erreur. */
  searchPages?: unknown[][] | { error: unknown };
  /** Pages de la lecture directe, selon l'offset de `range`. */
  recentPages?: unknown[][];
  /** Nombre de lectures de ville (`fetchCity`) qui échouent avant de répondre. */
  cityFailures?: number;
  activityFailures?: number;
}

function setup({
  signedIn = false,
  profileCityId = null,
  searchPages = [[]],
  recentPages = [[]],
  cityFailures = 0,
  activityFailures = 0,
}: Options = {}) {
  let cityReads = 0;
  let activityReads = 0;
  mockPublicStorage();
  supabaseMock.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === "get_my_profile") return profileRpc(profileCityId);
    if (fn === "search_cities") return Promise.resolve({ data: [ALBI], error: null });
    if (fn === "search_activities") {
      return Promise.resolve({
        data: [{ id: ID.crochet, name: "Crochet", similarity: 1 }],
        error: null,
      });
    }
    if (fn === "search_listings") {
      if ("error" in searchPages) return Promise.resolve({ data: null, error: searchPages.error });
      const data = searchPages[Number(args.p_offset) / PAGE] ?? [];
      return Promise.resolve({ data, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  const listingCalls: { method: string; args: unknown[] }[][] = [];
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "cities") {
      return queryHandler((calls) => {
        if (cityReads++ < cityFailures)
          return { data: null, error: { message: "Failed to fetch" } };
        const id = calls.find((call) => call.method === "eq")?.args[1];
        return { data: id === ID.lyon ? LYON : null, error: null };
      }).builder;
    }
    if (table === "activities") {
      return queryHandler(() =>
        activityReads++ < activityFailures
          ? { data: null, error: { message: "Failed to fetch" } }
          : { data: { id: ID.crochet, name: "Crochet" }, error: null },
      ).builder;
    }
    const { builder, calls } = queryHandler((recorded) => {
      const offset = Number(recorded.find((call) => call.method === "range")?.args[0] ?? 0);
      return { data: recentPages[offset / PAGE] ?? [], error: null };
    });
    listingCalls.push(calls);
    return builder;
  });
  if (signedIn) supabaseMock.setSession(fakeSession());
  return { listingCalls };
}

// Les sélecteurs (combobox) ont leurs propres zones de statut : on isole celle de la liste.
const listStatus = () =>
  screen.getAllByRole("status").find((element) => !element.closest("[role=search]"))!;

const searchCalls = () =>
  supabaseMock.rpc.mock.calls.filter(([fn]) => fn === "search_listings").map(([, args]) => args);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  supabaseMock.resetMocks();
});
afterEach(() => vi.useRealTimers());

const newUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("accueil : liste des annonces", () => {
  it("sans ville : affiche les annonces récentes de France (lecture directe) et invite à choisir sa ville", async () => {
    const { listingCalls } = setup({
      recentPages: [[directRow(1, { activities: { name: "Crochet" } })]],
    });
    renderApp(routes, "/");

    expect(screen.getByRole("heading", { level: 1, name: "Annonces" })).toBeVisible();
    const link = await screen.findByRole("link", { name: "Crochet" });
    expect(link).toHaveAttribute("href", "/annonces/listing-1");
    expect(screen.getByText(/Choisis ta ville pour voir ce qui est proche/)).toBeVisible();
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("search_listings", expect.anything());

    const calls = listingCalls[0]!;
    const call = (method: string) => calls.find((entry) => entry.method === method)?.args;
    expect(call("select")?.[0]).toContain("profiles!listings_owner_id_fkey(display_name)");
    expect(call("in")).toEqual(["status", ["disponible", "reservee"]]);
    expect(call("range")).toEqual([0, 23]);
    expect(calls.filter((entry) => entry.method === "order").map((entry) => entry.args[0])).toEqual(
      ["created_at", "id", "position"],
    );
    expect(calls.find((entry) => entry.method === "order")?.args[1]).toEqual({ ascending: false });

    const image = screen.getByRole("img", { name: "Photo : matériel de crochet" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("src", "https://img.test/u/photo-1.webp");
  });

  it("applique activité et type à la liste récente", async () => {
    const { listingCalls } = setup({ recentPages: [[directRow(1)]] });
    renderApp(routes, `/?activite=${ID.crochet}&type=pret`);
    await screen.findByRole("link", { name: "Activité 1" });
    const calls = listingCalls.at(-1)!;
    expect(calls).toContainEqual({ method: "eq", args: ["activity_id", ID.crochet] });
    expect(calls).toContainEqual({ method: "eq", args: ["kind", "pret"] });
  });

  it("avec une ville dans l'URL : appelle search_listings avec les bons paramètres et recharge les noms", async () => {
    setup({
      searchPages: [
        [
          rpcRow(1, { distance_km: 0 }),
          rpcRow(2, { distance_km: 17.6, status: "reservee", kind: "pret" }),
        ],
      ],
    });
    renderApp(routes, `/?ville=${ID.lyon}&rayon=50&activite=${ID.crochet}&type=don`);

    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([
      {
        p_city_id: ID.lyon,
        p_radius_km: 50,
        p_limit: 24,
        p_offset: 0,
        p_activity_id: ID.crochet,
        p_kind: "don",
      },
    ]);
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon");
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveValue("Crochet");
    expect(screen.getByRole("combobox", { name: "Distance" })).toHaveValue("50");
    expect(screen.getByRole("radio", { name: "Don" })).toBeChecked();
    expect(screen.getByText("Lyon · Dans la commune")).toBeVisible();
    expect(screen.getByText("Lyon · À 18 km")).toBeVisible();
    expect(screen.getByText("Réservée")).toBeVisible();
    expect(screen.queryByText(/Choisis ta ville/)).not.toBeInTheDocument();
  });

  it("ignore proprement les valeurs invalides de l'URL", async () => {
    setup({ recentPages: [[directRow(1)]] });
    renderApp(routes, "/?ville=nimporte&rayon=7&activite=%27%3B&type=troc");

    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([]);
    expect(screen.getByRole("radio", { name: "Tout" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveValue("");
    expect(supabaseMock.from).not.toHaveBeenCalledWith("activities");
  });

  it("rayon invalide avec une ville : 25 km par défaut", async () => {
    setup({ searchPages: [[rpcRow(1)]] });
    renderApp(routes, `/?ville=${ID.lyon}&rayon=abc`);
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()[0]).toMatchObject({ p_radius_km: 25 });
    expect(screen.getByRole("combobox", { name: "Distance" })).toHaveValue("25");
    expect(
      within(screen.getByRole("combobox", { name: "Distance" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Ma commune seulement", "10 km", "25 km", "50 km", "100 km"]);
  });

  it("ville inconnue dans l'URL : ignorée, repli sur les annonces récentes", async () => {
    setup({ recentPages: [[directRow(1)]] });
    renderApp(routes, "/?ville=99999999-9999-4999-8999-999999999999");
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([]);
  });

  it("connecté avec une ville de profil : l'utilise par défaut, sans l'écrire dans l'URL", async () => {
    setup({ signedIn: true, profileCityId: ID.lyon, searchPages: [[rpcRow(1)]] });
    const { router } = renderApp(routes, "/");

    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([
      { p_city_id: ID.lyon, p_radius_km: 25, p_limit: 24, p_offset: 0 },
    ]);
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon");
    expect(router.state.location.search).toBe("");
    expect(supabaseMock.from).not.toHaveBeenCalledWith("listings");
  });

  it("la ville de l'URL l'emporte sur celle du profil", async () => {
    setup({ signedIn: true, profileCityId: "autre-ville", searchPages: [[rpcRow(1)]] });
    renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()[0]).toMatchObject({ p_city_id: ID.lyon });
  });

  it("connecté sans ville de profil : annonces récentes", async () => {
    setup({ signedIn: true, profileCityId: null, recentPages: [[directRow(1)]] });
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([]);
    expect(screen.getByText(/Choisis ta ville/)).toBeVisible();
  });

  it("écrit les filtres dans l'URL et retire les valeurs par défaut", async () => {
    setup({ searchPages: [[rpcRow(1)]], recentPages: [[directRow(1)]] });
    const user = newUser();
    const { router } = renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 1" });

    await user.type(screen.getByRole("combobox", { name: "Ville" }), "Alb");
    await user.click(await screen.findByRole("option", { name: "Albi (81000)" }));
    await waitFor(() => expect(router.state.location.search).toBe(`?ville=${ALBI.id}`));

    await user.type(screen.getByRole("combobox", { name: "Activité" }), "Cro");
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Crochet" }));
    await waitFor(() => expect(router.state.location.search).toContain(`activite=${ID.crochet}`));

    await user.click(screen.getByRole("radio", { name: "Prêt" }));
    await waitFor(() => expect(router.state.location.search).toContain("type=pret"));
    await user.click(screen.getByRole("radio", { name: "Tout" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("type"));
  });

  it("changer la distance met à jour l'URL (25 km = valeur par défaut, absente)", async () => {
    setup({ searchPages: [[rpcRow(1)], [rpcRow(1)], [rpcRow(1)]] });
    const user = newUser();
    const { router } = renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 1" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Distance" }), "100 km");
    await waitFor(() => expect(router.state.location.search).toContain("rayon=100"));
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ p_radius_km: 100 }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Distance" }),
      "Ma commune seulement",
    );
    await waitFor(() => expect(router.state.location.search).toContain("rayon=0"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Distance" }), "25 km");
    await waitFor(() => expect(router.state.location.search).not.toContain("rayon"));
  });

  it("« Voir plus » charge la page suivante avec le bon offset et déplace le focus sur la première nouvelle annonce", async () => {
    setup({
      searchPages: [rows(24, (i) => rpcRow(i)), rows(2, (i) => rpcRow(i), 24)],
    });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 0" });
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(listStatus()).toHaveTextContent("24 annonces affichées");

    await user.click(screen.getByRole("button", { name: "Voir plus" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(26));
    expect(searchCalls().map((args) => (args as { p_offset: number }).p_offset)).toEqual([0, 24]);
    expect(screen.queryByRole("button", { name: "Voir plus" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "Activité 24" })).toHaveFocus());
    expect(listStatus()).toHaveTextContent("26 annonces");
  });

  it("« Voir plus » fonctionne aussi sans ville (offset de range)", async () => {
    const { listingCalls } = setup({
      recentPages: [rows(24, (i) => directRow(i)), [directRow(24)]],
    });
    const user = newUser();
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 0" });
    await user.click(screen.getByRole("button", { name: "Voir plus" }));
    await screen.findByRole("link", { name: "Activité 24" });
    expect(listingCalls.at(-1)!.find((call) => call.method === "range")?.args).toEqual([24, 47]);
  });

  it("liste vide : message rassurant, suggestions et lien Publier", async () => {
    setup({ searchPages: [[]] });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}&rayon=10&type=pret`);

    expect(
      await screen.findByRole("heading", { name: "Rien pour l'instant autour de toi" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Publier une annonce" })).toHaveAttribute(
      "href",
      "/publier",
    );
    expect(screen.getByRole("button", { name: "Retirer les filtres" })).toBeVisible();

    setup({ searchPages: [[rpcRow(1)]] });
    await user.click(screen.getByRole("button", { name: "Élargir à 25 km" }));
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls().at(-1)).toMatchObject({ p_radius_km: 25, p_kind: "pret" });
  });

  it("erreur : message et bouton Réessayer", async () => {
    setup({ searchPages: { error: { code: "XX000", message: "boom" } } });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("La recherche n'a pas abouti");

    setup({ searchPages: [[rpcRow(1)]] });
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("link", { name: "Activité 1" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("n'a qu'une seule zone aria-live propre à la page", async () => {
    setup({ searchPages: [[rpcRow(1)]] });
    renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 1" });
    const pageStatus = screen.getAllByRole("status").filter((el) => !el.closest("[role=search]"));
    expect(pageStatus).toHaveLength(1);
  });

  it("« Toute la France » force les annonces récentes malgré la ville du profil, via ville=toutes", async () => {
    setup({
      signedIn: true,
      profileCityId: ID.lyon,
      searchPages: [[rpcRow(1)]],
      recentPages: [[directRow(2)]],
    });
    const user = newUser();
    const { router } = renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 1" });

    await user.click(screen.getByRole("button", { name: "Voir toute la France" }));
    await screen.findByRole("link", { name: "Activité 2" });
    expect(router.state.location.search).toBe("?ville=toutes");
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("");
    expect(screen.queryByRole("combobox", { name: "Distance" })).not.toBeInTheDocument();
    expect(searchCalls()).toHaveLength(1);
  });

  it("ville=toutes dans l'URL : pas de recherche par ville, état vide neutre", async () => {
    setup({ signedIn: true, profileCityId: ID.lyon, recentPages: [[]] });
    renderApp(routes, "/?ville=toutes");
    expect(await screen.findByRole("heading", { name: "Rien pour l'instant" })).toBeVisible();
    expect(searchCalls()).toEqual([]);
  });

  it("ville du profil : « Dans ta commune » (et non « Dans la commune »)", async () => {
    setup({ signedIn: true, profileCityId: ID.lyon, searchPages: [[rpcRow(1)]] });
    renderApp(routes, "/");
    expect(await screen.findByText("Lyon · Dans ta commune")).toBeVisible();
  });

  it("choisir une ville préremplit le cache : pas de relecture de la ville", async () => {
    setup({ searchPages: [[rpcRow(1)]] });
    const user = newUser();
    renderApp(routes, "/");
    await user.type(screen.getByRole("combobox", { name: "Ville" }), "Alb");
    await user.click(await screen.findByRole("option", { name: "Albi (81000)" }));
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toEqual([
      { p_city_id: ALBI.id, p_radius_km: 25, p_limit: 24, p_offset: 0 },
    ]);
    expect(supabaseMock.from).not.toHaveBeenCalledWith("cities");
  });

  it("taper dans le filtre activité ne touche pas l'URL ; vider le champ retire le filtre", async () => {
    setup({ recentPages: [[directRow(1)]] });
    const user = newUser();
    const { router } = renderApp(routes, `/?activite=${ID.crochet}`);
    const input = await screen.findByRole("combobox", { name: "Activité" });
    await waitFor(() => expect(input).toHaveValue("Crochet"));
    await screen.findByRole("link", { name: "Activité 1" });
    const readsBefore = supabaseMock.from.mock.calls.length;

    await user.type(input, "x");
    expect(router.state.location.search).toBe(`?activite=${ID.crochet}`);
    expect(supabaseMock.from.mock.calls.length).toBe(readsBefore);
    expect(router.state.historyAction).toBe("POP");

    await user.clear(input);
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("choisir une activité préremplit le cache : pas de relecture de l'activité", async () => {
    setup({ recentPages: [[directRow(1)]] });
    const user = newUser();
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 1" });
    await user.type(screen.getByRole("combobox", { name: "Activité" }), "Cro");
    await user.click(await screen.findByRole("option", { name: "Crochet" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Activité" })).toHaveValue("Crochet"),
    );
    expect(supabaseMock.from).not.toHaveBeenCalledWith("activities");
  });

  it("échec réseau de la lecture de la ville de l'URL : erreur et Réessayer, pas d'ignorance silencieuse", async () => {
    setup({ cityFailures: 1, searchPages: [[rpcRow(1)]], recentPages: [[directRow(9)]] });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("La recherche n'a pas abouti");
    expect(searchCalls()).toEqual([]);
    expect(screen.queryByRole("link", { name: "Activité 9" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("link", { name: "Activité 1" });
    expect(searchCalls()).toHaveLength(1);
  });

  it("échec réseau de la lecture de l'activité de l'URL : erreur et Réessayer", async () => {
    setup({ activityFailures: 1, recentPages: [[directRow(1)]] });
    const user = newUser();
    renderApp(routes, `/?activite=${ID.crochet}`);
    expect(await screen.findByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("link", { name: "Activité 1" });
  });

  it("« Voir plus » sans nouvelle annonce : message dans la zone de statut et focus sur la dernière carte", async () => {
    setup({ searchPages: [rows(24, (i) => rpcRow(i)), []] });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 0" });
    await user.click(screen.getByRole("button", { name: "Voir plus" }));

    await waitFor(() => expect(listStatus()).toHaveTextContent("Plus d'autres annonces"));
    expect(screen.queryByRole("button", { name: "Voir plus" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "Activité 23" })).toHaveFocus());

    // Le focus n'est plus « volé » plus tard.
    screen.getByRole("combobox", { name: "Activité" }).focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveFocus();
  });

  it("« Voir plus » en échec : erreur affichée, focus rendu au bouton, pas de vol ultérieur", async () => {
    setup({ searchPages: [rows(24, (i) => rpcRow(i))] });
    const user = newUser();
    renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 0" });
    const original = supabaseMock.rpc.getMockImplementation()!;
    supabaseMock.rpc.mockImplementation((fn: string, args: Record<string, unknown>) =>
      fn === "search_listings" && args.p_offset === 24
        ? Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } })
        : original(fn, args),
    );
    await user.click(screen.getByRole("button", { name: "Voir plus" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La recherche n'a pas abouti");
    await waitFor(() => expect(screen.getByRole("button", { name: "Voir plus" })).toHaveFocus());
  });

  it("« Voir plus » vide puis navigation dans l'historique : ni message périmé, ni vol de focus", async () => {
    setup({ searchPages: [rows(24, (i) => rpcRow(i)), []] });
    const user = newUser();
    const { router } = renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 0" });
    await user.click(screen.getByRole("button", { name: "Voir plus" }));
    await waitFor(() => expect(listStatus()).toHaveTextContent("Plus d'autres annonces"));

    const input = screen.getByRole("combobox", { name: "Activité" });
    input.focus();
    await act(() => router.navigate(`/?ville=${ID.lyon}&type=don`));
    await screen.findByRole("link", { name: "Activité 0" });
    expect(listStatus()).not.toHaveTextContent("Plus d'autres annonces");
    await act(() => router.navigate(-1));
    await screen.findByRole("link", { name: "Activité 0" });
    expect(listStatus()).not.toHaveTextContent("Plus d'autres annonces");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveFocus();
  });

  it("« Voir plus » vide puis rafraîchissement de la liste : le focus n'est pas redonné à la dernière carte", async () => {
    const pages: unknown[][] = [rows(24, (i) => rpcRow(i)), []];
    setup({ searchPages: pages });
    const user = newUser();
    const { queryClient } = renderApp(routes, `/?ville=${ID.lyon}`);
    await screen.findByRole("link", { name: "Activité 0" });
    await user.click(screen.getByRole("button", { name: "Voir plus" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Activité 23" })).toHaveFocus());

    screen.getByRole("combobox", { name: "Activité" }).focus();
    pages[0] = rows(24, (i) => rpcRow(i + 100));
    await act(() => queryClient.invalidateQueries({ queryKey: ["listings"] }));
    await screen.findByRole("link", { name: "Activité 123" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveFocus();
  });

  it("vider le champ activité alors qu'aucun filtre n'est actif ne fait rien", async () => {
    setup({ recentPages: [[directRow(1)]] });
    const user = newUser();
    const { router } = renderApp(routes, "/");
    await screen.findByRole("link", { name: "Activité 1" });
    const input = screen.getByRole("combobox", { name: "Activité" });
    await user.type(input, "c");
    await user.clear(input);
    expect(router.state.historyAction).toBe("POP");
  });
});
