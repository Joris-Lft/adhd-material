import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import imageCompression from "browser-image-compression";
import { fakeSession, queryHandler, queryResult, supabaseMock } from "@/test/supabase-mock";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: { success: toastSuccess, error: vi.fn() },
}));

const LYON = { id: "c-lyon", name: "Lyon", postal_codes: ["69001"] };
const ALBI = { id: "c-albi", insee_code: "81004", name: "Albi", postal_codes: ["81000"] };
const PATH = /^user-1\/[0-9a-f-]{36}\.webp$/;

let order: string[];
let upload: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let originalUrlFns: [typeof URL.createObjectURL, typeof URL.revokeObjectURL];
let releaseCity: () => void;
let activityInsert: ReturnType<typeof queryResult> | undefined;

type Result = { data: unknown; error: unknown };

interface Options {
  profileCityId?: string | null;
  /** Une réponse, ou une suite de réponses (la dernière se répète) pour simuler un réessai. */
  createResult?: Result | Result[];
  uploadResult?: { error: unknown };
  /** La lecture de la ville du profil ne répond qu'à l'appel de `releaseCity`. */
  holdCity?: boolean;
}

function setup(options: Options = {}) {
  const {
    profileCityId = null,
    holdCity = false,
    createResult = { data: "listing-1", error: null },
    uploadResult = { error: null },
  } = options;
  const creates = Array.isArray(createResult) ? createResult : [createResult];
  let createCalls = 0;
  order = [];
  activityInsert = undefined;
  releaseCity = () => {};
  upload = vi.fn(async () => {
    order.push("upload");
    return uploadResult;
  });
  remove = vi.fn(async () => {
    order.push("remove");
    return { error: null };
  });
  supabaseMock.storage.from.mockReturnValue({ upload, remove });
  supabaseMock.rpc.mockImplementation((fn: string) => {
    if (fn === "get_my_profile") {
      return {
        maybeSingle: () =>
          Promise.resolve({
            data: {
              id: "user-1",
              display_name: "Alex",
              display_name_confirmed: true,
              city_id: profileCityId,
            },
            error: null,
          }),
      };
    }
    if (fn === "search_activities") {
      return Promise.resolve({
        data: [{ id: "act-1", name: "Crochet", similarity: 1 }],
        error: null,
      });
    }
    if (fn === "create_listing") {
      order.push("rpc");
      return Promise.resolve(creates[Math.min(createCalls++, creates.length - 1)]);
    }
    return Promise.resolve({ data: [ALBI], error: null });
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "cities") {
      if (!holdCity) return queryResult({ data: LYON, error: null }).builder;
      const held = new Promise((resolve) => {
        releaseCity = () => resolve({ data: LYON, error: null });
      });
      const chain: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => (prop === "then" ? held.then.bind(held) : () => chain),
        },
      );
      return chain;
    }
    order.push("activity");
    activityInsert = queryResult({ data: { id: "act-new", name: "Macramé" }, error: null });
    return activityInsert.builder;
  });
  supabaseMock.setSession(fakeSession());
  return renderApp(routes, "/publier");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  supabaseMock.resetMocks();
  toastSuccess.mockReset();
  vi.mocked(imageCompression).mockReset();
  vi.mocked(imageCompression).mockImplementation(
    async (file: File) => new File(["x"], file.name, { type: "image/webp" }),
  );
  originalUrlFns = [URL.createObjectURL, URL.revokeObjectURL];
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  [URL.createObjectURL, URL.revokeObjectURL] = originalUrlFns;
});

const newUser = (applyAccept = true) =>
  userEvent.setup({ advanceTimers: vi.advanceTimersByTime, applyAccept });
type User = ReturnType<typeof newUser>;

const png = (name: string) => new File(["img"], name, { type: "image/png" });
const fileInput = () => document.querySelector<HTMLInputElement>("input[type=file]")!;

async function addPhotos(user: User, ...names: string[]) {
  await user.upload(await waitForFileInput(), names.map(png));
}
async function waitForFileInput() {
  await screen.findByRole("heading", { name: "Publier une annonce" });
  return fileInput();
}
async function chooseActivity(user: User) {
  await user.type(await screen.findByRole("combobox", { name: "Activité" }), "Cro");
  await user.click(await screen.findByRole("option", { name: "Crochet" }));
}
async function chooseCity(user: User) {
  await user.type(screen.getByRole("combobox", { name: "Ville" }), "Alb");
  await user.click(await screen.findByRole("option", { name: "Albi (81000)" }));
}
const submitButton = () => screen.getByRole("button", { name: "Publier l'annonce" });

async function fillValidForm(user: User) {
  await chooseActivity(user);
  await user.click(screen.getByRole("radio", { name: /Don/ }));
  await addPhotos(user, "a.png", "b.png");
  await screen.findByRole("button", { name: "Retirer la photo 2" });
}

describe("page Publier une annonce", () => {
  it("renvoie un visiteur vers la connexion avec retour vers /publier", async () => {
    supabaseMock.setSession(null);
    const { router } = renderApp(routes, "/publier");
    await waitFor(() => expect(router.state.location.pathname).toBe("/connexion"));
    expect(new URLSearchParams(router.state.location.search).get("suivant")).toBe("/publier");
  });

  it("affiche le lien Publier dans la navigation", async () => {
    setup();
    const nav = within(await screen.findByRole("navigation", { name: "Navigation principale" }));
    expect(nav.getByRole("link", { name: "Publier" })).toHaveAttribute("href", "/publier");
  });

  it("valide les 4 champs obligatoires et place le focus sur le premier en erreur", async () => {
    setup();
    const user = newUser();
    await screen.findByRole("heading", { name: "Publier une annonce" });
    await user.click(submitButton());
    expect(
      await screen.findByText("Choisis une activité dans la liste ou propose-en une."),
    ).toBeVisible();
    expect(screen.getByText("Dis-nous si tu donnes ou si tu prêtes.")).toBeVisible();
    expect(screen.getByText("Ajoute au moins une photo.")).toBeVisible();
    expect(screen.getByText("Choisis une ville dans la liste.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Activité" })).toHaveFocus());
    expect(supabaseMock.storage.from).not.toHaveBeenCalled();

    await chooseActivity(user);
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByRole("radio", { name: /Don/ })).toHaveFocus());

    await user.click(screen.getByRole("radio", { name: /Prêt/ }));
    await user.click(submitButton());
    await waitFor(() => expect(document.getElementById("listing-photos")).toHaveFocus());

    await addPhotos(user, "a.png");
    await screen.findByRole("button", { name: "Retirer la photo 1" });
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Ville" })).toHaveFocus());
  });

  it("ajoute et retire des photos, limite à 3, indique la couverture", async () => {
    setup();
    const user = newUser();
    await addPhotos(user, "a.png", "b.png", "c.png", "d.png");
    expect(await screen.findByRole("button", { name: "Retirer la photo 3" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retirer la photo 4" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Tu peux ajouter 3 photos au maximum : les autres ont été ignorées."),
    ).toBeVisible();
    expect(imageCompression).toHaveBeenCalledTimes(3);
    expect(imageCompression).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        fileType: "image/webp",
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        // Script du worker hébergé chez nous, jamais sur un CDN.
        libURL: expect.stringMatching(/^https?:\/\/[^/]+\/.*browser-image-compression.*\.js/),
      }),
    );
    expect(screen.getAllByText("Couverture")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ajouter une photo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retirer la photo 2" }));
    expect(screen.queryByRole("button", { name: "Retirer la photo 3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une photo" })).toHaveFocus();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("refuse un format non pris en charge et une image trop lourde", async () => {
    setup();
    const user = newUser(false);
    const input = await waitForFileInput();
    await user.upload(input, new File(["x"], "doc.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/« doc\.pdf » : format non pris en charge/)).toBeVisible();
    expect(imageCompression).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retirer la photo 1" })).not.toBeInTheDocument();

    const heavy = new File(["x"], "gros.webp", { type: "image/webp" });
    Object.defineProperty(heavy, "size", { value: 6 * 1024 * 1024 });
    vi.mocked(imageCompression).mockResolvedValueOnce(heavy);
    await user.upload(input, png("gros.png"));
    expect(
      await screen.findByText(/« gros\.png » est trop lourde, même après compression/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retirer la photo 1" })).not.toBeInTheDocument();
  });

  it("pré-remplit la ville du profil et permet de la changer", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveAccessibleDescription(
      "C'est la ville de ton profil. Tu peux la changer pour cette annonce.",
    );
    await user.clear(screen.getByRole("combobox", { name: "Ville" }));
    await chooseCity(user);
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Albi");
  });

  it("publie : activité, envoi des photos puis RPC, avec les chemins {uid}/….webp", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    expect(await screen.findByRole("heading", { name: "Annonce publiée" })).toHaveFocus();
    expect(toastSuccess).toHaveBeenCalledWith("Annonce publiée");
    // Activité existante : aucune création ; photos envoyées avant la RPC.
    expect(order).toEqual(["upload", "upload", "rpc"]);
    const paths = upload.mock.calls.map((call) => call[0]);
    paths.forEach((path) => expect(path).toMatch(PATH));
    expect(upload.mock.calls[0]?.[2]).toEqual({ contentType: "image/webp", upsert: false });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("create_listing", {
      p_activity_id: "act-1",
      p_kind: "don",
      p_city_id: "c-lyon",
      p_photo_paths: paths,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("déduit extension et contentType du type réel du fichier compressé (JPEG non converti)", async () => {
    setup({ profileCityId: "c-lyon" });
    vi.mocked(imageCompression).mockImplementation(
      async (file: File) => new File(["x"], file.name, { type: "image/jpeg" }),
    );
    const user = newUser();
    await chooseActivity(user);
    await user.click(screen.getByRole("radio", { name: /Don/ }));
    await addPhotos(user, "a.png");
    await screen.findByRole("button", { name: "Retirer la photo 1" });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(upload.mock.calls[0]?.[0]).toMatch(/^user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(upload.mock.calls[0]?.[2]).toEqual({ contentType: "image/jpeg", upsert: false });
  });

  it("refuse un fichier compressé dont le type n'est pas pris en charge", async () => {
    setup();
    vi.mocked(imageCompression).mockResolvedValue(new File(["x"], "a.gif", { type: "image/gif" }));
    const user = newUser();
    await addPhotos(user, "a.png");
    expect(await screen.findByText(/« a\.png » : format non pris en charge/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retirer la photo 1" })).not.toBeInTheDocument();
  });

  it("envoie la description et l'expérience saisies, et crée l'activité à la soumission seulement", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await user.type(await screen.findByRole("combobox", { name: "Activité" }), "Macramé");
    await user.click(await screen.findByRole("option", { name: "Créer « Macramé »" }));
    expect(activityInsert).toBeUndefined();
    await user.click(screen.getByRole("radio", { name: /Prêt/ }));
    await addPhotos(user, "a.png");
    await screen.findByRole("button", { name: "Retirer la photo 1" });
    await user.click(screen.getByText("Ajouter des détails (facultatif)"));
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Kit complet");
    await user.type(screen.getByRole("textbox", { name: "Ton expérience" }), "Trop long à finir");
    expect(screen.getByText("11 / 2000")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(order).toEqual(["activity", "upload", "rpc"]);
    expect(activityInsert?.calls[0]).toEqual({ method: "insert", args: [{ name: "Macramé" }] });
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "create_listing",
      expect.objectContaining({
        p_activity_id: "act-new",
        p_kind: "pret",
        p_description: "Kit complet",
        p_experience: "Trop long à finir",
      }),
    );
  });

  it("échec de la RPC : supprime les photos envoyées et affiche l'erreur sur le champ", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: {
        data: null,
        error: { code: "23503", hint: "city_not_found", message: "Ville introuvable" },
      },
    });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    expect(
      await screen.findByText("Cette ville n'existe pas. Choisis-en une dans la liste."),
    ).toBeVisible();
    expect(order).toEqual(["upload", "upload", "rpc", "remove"]);
    expect(remove).toHaveBeenCalledWith(upload.mock.calls.map((call) => call[0]));
    expect(screen.queryByRole("heading", { name: "Annonce publiée" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Ville" })).toHaveFocus());
    expect(submitButton()).toBeEnabled();
  });

  it("limite quotidienne (PT429) : message du serveur en alerte globale", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: {
        data: null,
        error: {
          code: "PT429",
          hint: "listing_rate_limit",
          message: "Limite de 20 nouvelles annonces par jour atteinte",
        },
      },
    });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    const alert = await screen.findByText("Limite de 20 nouvelles annonces par jour atteinte");
    // Annoncé par le focus programmatique, sans role="alert" en plus.
    expect(alert).not.toHaveAttribute("role");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(remove).toHaveBeenCalled();
  });

  it("échec de l'envoi d'une photo : pas de RPC, fichiers nettoyés", async () => {
    setup({ profileCityId: "c-lyon", uploadResult: { error: { message: "boom", status: 500 } } });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    expect(
      await screen.findByText("L'envoi des photos a échoué. Réessaie dans un instant."),
    ).toBeVisible();
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("create_listing", expect.anything());
    expect(remove).toHaveBeenCalled();
  });

  it("affiche la progression et empêche une double soumission", async () => {
    setup({ profileCityId: "c-lyon" });
    const releases: ((value: { error: null }) => void)[] = [];
    upload.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    const busy = await screen.findByRole("button", { name: "Envoi des photos…" });
    expect(busy).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Envoi des photos…")).toBe(
      true,
    );
    // Vrai submit (touche Entrée, double envoi) pendant l'envoi : ignoré.
    const form = busy.closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(order.filter((step) => step === "rpc")).toHaveLength(0);
    releases.forEach((release) => release({ error: null }));
    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(order.filter((step) => step === "rpc")).toHaveLength(1);
  });

  it("l'écran de succès propose « Voir mon annonce » vers la fiche créée", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(screen.getByRole("link", { name: "Voir mon annonce" })).toHaveAttribute(
      "href",
      "/annonces/listing-1",
    );
  });

  it("« Publier une autre annonce » réinitialise complètement le formulaire", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: "Publier une autre annonce" }));
    expect(await screen.findByRole("heading", { name: "Publier une annonce" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Activité" })).toHaveValue("");
    expect(screen.getByRole("radio", { name: /Don/ })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Retirer la photo 1" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
  });

  it("ne demande rien quand le formulaire n'a pas été modifié (ville du profil comprise)", async () => {
    setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(screen.getByRole("link", { name: "adhd-material" }));
    expect(await screen.findByRole("heading", { name: "Annonces" })).toBeVisible();
  });

  it("formulaire modifié : confirmation, rester ou quitter", async () => {
    const { router } = setup({ profileCityId: "c-lyon" });
    const user = newUser();
    await user.click(await screen.findByRole("radio", { name: /Don/ }));
    await user.click(screen.getByRole("link", { name: "adhd-material" }));
    expect(await screen.findByText("Quitter sans publier ?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Rester sur la page" }));
    expect(router.state.location.pathname).toBe("/publier");
    expect(screen.getByRole("radio", { name: /Don/ })).toBeChecked();

    await user.click(screen.getByRole("link", { name: "adhd-material" }));
    await user.click(await screen.findByRole("button", { name: "Quitter la page" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("issue incertaine de la RPC (réseau) : photos conservées et message dédié", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: { data: null, error: { message: "Failed to fetch" } },
    });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    const alert = await screen.findByText(/On n'a pas pu confirmer la publication/);
    expect(alert).toHaveTextContent("l'annonce est peut-être déjà en ligne");
    expect(within(alert).getByRole("link", { name: "Voir mes annonces" })).toHaveAttribute(
      "href",
      "/mes-annonces",
    );
    expect(remove).not.toHaveBeenCalled();
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("publication réussie : les listes d'annonces sont invalidées", async () => {
    const { queryClient } = setup({ profileCityId: "c-lyon" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["listings"] });
  });

  it("issue incertaine : « Voir mes annonces » n'est pas bloqué et relit la liste (cache périmé invalidé)", async () => {
    const { queryClient } = setup({
      profileCityId: "c-lyon",
      createResult: { data: null, error: { message: "Failed to fetch" } },
    });
    // Cache jamais périmé par le temps : seule l'invalidation peut le rafraîchir.
    queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
    queryClient.setQueryData(["listings", "mine", "user-1"], []);
    let created = false;
    const rpc = supabaseMock.rpc.getMockImplementation()!;
    supabaseMock.rpc.mockImplementation((fn: string, args: unknown) => {
      if (fn === "create_listing") created = true;
      return rpc(fn, args);
    });
    const from = supabaseMock.from.getMockImplementation()!;
    supabaseMock.from.mockImplementation((table: string) =>
      table === "listings"
        ? queryHandler(() => ({
            data: created
              ? [
                  {
                    id: "listing-1",
                    kind: "don",
                    status: "disponible",
                    created_at: new Date().toISOString(),
                    activities: { name: "Crochet" },
                    cities: { name: "Lyon" },
                    listing_photos: [],
                  },
                ]
              : [],
            error: null,
          })).builder
        : from(table),
    );
    supabaseMock.storage.from.mockReturnValue({
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://img.test/${path}` } }),
    });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    const alert = await screen.findByText(/On n'a pas pu confirmer la publication/);
    await user.click(within(alert).getByRole("link", { name: "Voir mes annonces" }));
    // Pas de dialogue « Ton annonce n'est pas publiée » : on arrive directement sur la page.
    expect(await screen.findByRole("heading", { level: 1, name: "Mes annonces" })).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Crochet" })).toBeVisible();
  });

  it("requête RPC interrompue (rejet) : traité comme une issue incertaine", async () => {
    setup({ profileCityId: "c-lyon" });
    const rpc = supabaseMock.rpc.getMockImplementation()!;
    supabaseMock.rpc.mockImplementation((fn: string, args: unknown) =>
      fn === "create_listing" ? Promise.reject(new TypeError("Failed to fetch")) : rpc(fn, args),
    );
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    expect(await screen.findByText(/On n'a pas pu confirmer la publication/)).toBeVisible();
    expect(remove).not.toHaveBeenCalled();
  });

  it("upload partiel (un réussi, un refusé) : suppression des chemins, pas de RPC", async () => {
    setup({ profileCityId: "c-lyon" });
    let calls = 0;
    upload.mockImplementation(async () =>
      ++calls === 1 ? { error: null } : { error: { message: "boom", status: 500 } },
    );
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());

    expect(
      await screen.findByText("L'envoi des photos a échoué. Réessaie dans un instant."),
    ).toBeVisible();
    expect(remove).toHaveBeenCalledWith(upload.mock.calls.map((call) => call[0]));
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("create_listing", expect.anything());
  });

  it("un nettoyage qui échoue ne masque pas l'erreur d'origine", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: {
        data: null,
        error: { code: "23503", hint: "city_not_found", message: "x" },
      },
    });
    remove.mockRejectedValue(new Error("remove KO"));
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    expect(
      await screen.findByText("Cette ville n'existe pas. Choisis-en une dans la liste."),
    ).toBeVisible();
    expect(remove).toHaveBeenCalled();
  });

  it("réessai après échec : l'activité créée est réutilisée, sans nouvel INSERT", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: [
        { data: null, error: { code: "23503", hint: "photo_missing", message: "x" } },
        { data: "listing-2", error: null },
      ],
    });
    const user = newUser();
    await user.type(await screen.findByRole("combobox", { name: "Activité" }), "Macramé");
    await user.click(await screen.findByRole("option", { name: "Créer « Macramé »" }));
    await user.click(screen.getByRole("radio", { name: /Don/ }));
    await addPhotos(user, "a.png");
    await screen.findByRole("button", { name: "Retirer la photo 1" });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    expect(
      await screen.findByText("Une photo n'a pas été envoyée : réessaie l'envoi."),
    ).toBeVisible();
    expect(supabaseMock.from.mock.calls.filter(([table]) => table === "activities")).toHaveLength(
      1,
    );

    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Annonce publiée" });
    expect(supabaseMock.from.mock.calls.filter(([table]) => table === "activities")).toHaveLength(
      1,
    );
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith(
      "create_listing",
      expect.objectContaining({ p_activity_id: "act-new" }),
    );
  });

  it("text_too_long : ouvre les détails et place l'erreur sur Description", async () => {
    setup({
      profileCityId: "c-lyon",
      createResult: {
        data: null,
        error: { code: "22023", hint: "text_too_long", message: "x" },
      },
    });
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    expect(await screen.findByText(/limitées à 2000 caractères chacune/)).toBeVisible();
    expect(screen.getByText("Ajouter des détails (facultatif)").closest("details")).toHaveAttribute(
      "open",
    );
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus());
  });

  it("garde de sortie pendant l'envoi : texte adapté, pas de bouton pour quitter", async () => {
    const { router } = setup({ profileCityId: "c-lyon" });
    const releases: ((value: { error: null }) => void)[] = [];
    upload.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const user = newUser();
    await fillValidForm(user);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Lyon"),
    );
    await user.click(submitButton());
    await screen.findByRole("button", { name: "Envoi des photos…" });

    await user.click(screen.getByRole("link", { name: "adhd-material" }));
    expect(await screen.findByText("Publication en cours…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Quitter la page" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rester sur la page" }));
    expect(router.state.location.pathname).toBe("/publier");
    releases.forEach((release) => release({ error: null }));
    await screen.findByRole("heading", { name: "Annonce publiée" });
  });

  it("n'efface pas une saisie de ville en cours quand la ville du profil arrive", async () => {
    setup({ profileCityId: "c-lyon", holdCity: true });
    const user = newUser();
    await user.type(await screen.findByRole("combobox", { name: "Ville" }), "Al");
    await act(async () => releaseCity());
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledWith("cities"));
    await act(async () => {});
    expect(screen.getByRole("combobox", { name: "Ville" })).toHaveValue("Al");
  });

  it("deux ajouts de photos simultanés ne s'écrasent pas", async () => {
    setup();
    const resolvers: (() => void)[] = [];
    vi.mocked(imageCompression).mockImplementation(
      (file: File) =>
        new Promise((resolve) =>
          resolvers.push(() => resolve(new File(["x"], file.name, { type: "image/webp" }))),
        ),
    );
    const user = newUser();
    await addPhotos(user, "a.png");
    await addPhotos(user, "b.png");
    expect(resolvers).toHaveLength(2);
    await act(async () => resolvers.forEach((resolve) => resolve()));
    expect(await screen.findByRole("button", { name: "Retirer la photo 2" })).toBeVisible();
  });
});
