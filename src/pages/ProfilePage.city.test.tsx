import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, queryResult, supabaseMock } from "@/test/supabase-mock";
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

const LYON = { id: "c-lyon", name: "Lyon", postal_codes: ["69001", "69002", "69003"] };
const ALBI = { id: "c-albi", insee_code: "81004", name: "Albi", postal_codes: ["81000"] };

let cityUpdate: ReturnType<typeof queryResult> | undefined;
let profileCityId: string | null;

interface Options {
  /** Réponse de la lecture de la ville enregistrée. */
  cityRead?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  /** city_id renvoyé par le profil une fois la mise à jour faite. */
  cityIdAfterUpdate?: string | null;
}

function setup(cityId: string | null, options: Options = {}) {
  const { cityRead = { data: LYON, error: null }, cityIdAfterUpdate = null } = options;
  const updateResult = options.updateResult ?? { data: [{ id: "user-1" }], error: null };
  profileCityId = cityId;
  cityUpdate = undefined;
  supabaseMock.rpc.mockImplementation((fn: string) =>
    fn === "get_my_profile"
      ? {
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
        }
      : Promise.resolve({ data: [ALBI], error: null }),
  );
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "cities") return queryResult(cityRead).builder;
    cityUpdate = queryResult(updateResult);
    if (!updateResult.error) profileCityId = cityIdAfterUpdate;
    return cityUpdate.builder;
  });
  supabaseMock.setSession(fakeSession());
  renderApp(routes, "/profil");
}

async function cityRegion() {
  return within(await screen.findByRole("region", { name: "Ma ville" }));
}

async function chooseAlbi(user: ReturnType<typeof userEvent.setup>) {
  const region = await cityRegion();
  await user.type(await region.findByRole("combobox", { name: "Ville" }), "Alb");
  await user.click(await screen.findByRole("option", { name: "Albi (81000)" }));
  return region;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  supabaseMock.resetMocks();
  toastSuccess.mockReset();
});
afterEach(() => vi.useRealTimers());

const newUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("section « Ma ville » du profil", () => {
  it("affiche la ville enregistrée, Enregistrer désactivé tant qu'elle est inchangée", async () => {
    setup("c-lyon");
    const region = await cityRegion();
    const input = await region.findByRole("combobox", { name: "Ville" });
    expect(input).toHaveValue("Lyon");
    expect(input).toHaveAccessibleDescription(
      "Visible par toi seulement. Elle pré-remplit la ville de tes annonces.",
    );
    expect(region.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("enregistre une nouvelle ville et garde le focus dans le champ", async () => {
    setup(null, { cityIdAfterUpdate: "c-albi" });
    const user = newUser();
    const region = await chooseAlbi(user);
    const save = region.getByRole("button", { name: "Enregistrer" });
    expect(region.queryByRole("button", { name: "Retirer ma ville" })).not.toBeInTheDocument();

    await user.click(save);
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Ville enregistrée"));
    expect(cityUpdate?.calls[0]).toEqual({ method: "update", args: [{ city_id: "c-albi" }] });

    const input = await region.findByRole("combobox", { name: "Ville" });
    // Pas de remontage ni d'écran de chargement : le champ garde sa valeur et le focus.
    expect(screen.queryByText("Chargement de ta ville…")).not.toBeInTheDocument();
    expect(input).toHaveValue("Albi");
    expect(input).toHaveFocus();
    expect(await region.findByRole("button", { name: "Retirer ma ville" })).toBeVisible();
    expect(region.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("retire la ville et garde le focus dans le champ", async () => {
    setup("c-lyon", { cityIdAfterUpdate: null });
    const user = newUser();
    const region = await cityRegion();
    await user.click(await region.findByRole("button", { name: "Retirer ma ville" }));
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Ville retirée"));
    expect(cityUpdate?.calls[0]).toEqual({ method: "update", args: [{ city_id: null }] });

    const input = await region.findByRole("combobox", { name: "Ville" });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(region.queryByRole("button", { name: "Retirer ma ville" })).not.toBeInTheDocument();
  });

  it("n'enregistre pas une saisie partielle : le bouton reste désactivé", async () => {
    setup("c-lyon");
    const user = newUser();
    const region = await cityRegion();
    await user.type(await region.findByRole("combobox", { name: "Ville" }), "x");
    expect(region.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("affiche l'erreur serveur sans toast", async () => {
    setup(null, { updateResult: { data: null, error: { code: "23503", message: "fk" } } });
    const user = newUser();
    const region = await chooseAlbi(user);
    await user.click(region.getByRole("button", { name: "Enregistrer" }));
    expect(await region.findByRole("alert")).toHaveTextContent("Cette ville n'existe pas");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(region.getByRole("combobox", { name: "Ville" })).toHaveFocus();
  });

  it("échec du retrait : erreur affichée et focus rendu au champ", async () => {
    setup("c-lyon", { updateResult: { data: null, error: { code: "XX000" } } });
    const user = newUser();
    const region = await cityRegion();
    await user.click(await region.findByRole("button", { name: "Retirer ma ville" }));
    expect(await region.findByRole("alert")).toHaveTextContent("L'enregistrement a échoué");
    expect(region.getByRole("combobox", { name: "Ville" })).toHaveFocus();
  });

  it("désactive Enregistrer et Retirer pendant l'envoi", async () => {
    setup("c-lyon");
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "cities") return queryResult({ data: LYON, error: null }).builder;
      // Requête qui ne se termine jamais : la mutation reste en cours.
      const pending: unknown = new Proxy(
        {},
        { get: (_target, prop) => (prop === "then" ? () => {} : () => pending) },
      );
      return pending;
    });
    const user = newUser();
    const region = await cityRegion();
    await user.click(await region.findByRole("button", { name: "Retirer ma ville" }));
    expect(region.getByRole("button", { name: "Retirer ma ville" })).toBeDisabled();
    expect(region.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("ville introuvable : message, formulaire et retrait restent disponibles", async () => {
    setup("c-lyon", { cityRead: { data: null, error: null } });
    const region = await cityRegion();
    expect(await region.findByRole("alert")).toHaveTextContent("Ta ville n'a pas été retrouvée.");
    expect(region.getByRole("combobox", { name: "Ville" })).toHaveValue("");
    expect(region.getByRole("button", { name: "Retirer ma ville" })).toBeEnabled();
    expect(region.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("depuis « ville introuvable », enregistrer garde le focus dans le champ", async () => {
    setup("c-lyon", { cityRead: { data: null, error: null }, cityIdAfterUpdate: "c-albi" });
    const user = newUser();
    const region = await chooseAlbi(user);
    await user.click(region.getByRole("button", { name: "Enregistrer" }));
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Ville enregistrée"));
    const input = await region.findByRole("combobox", { name: "Ville" });
    expect(input).toHaveValue("Albi");
    await vi.waitFor(() => expect(input).toHaveFocus());
    expect(region.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("depuis « ville introuvable », retirer garde le focus dans le champ", async () => {
    setup("c-lyon", { cityRead: { data: null, error: null }, cityIdAfterUpdate: null });
    const user = newUser();
    const region = await cityRegion();
    await user.click(await region.findByRole("button", { name: "Retirer ma ville" }));
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Ville retirée"));
    const input = await region.findByRole("combobox", { name: "Ville" });
    await vi.waitFor(() => expect(input).toHaveFocus());
    expect(region.queryByRole("button", { name: "Retirer ma ville" })).not.toBeInTheDocument();
  });

  it("erreur de chargement : message, réessai et retrait disponibles", async () => {
    setup("c-lyon", { cityRead: { data: null, error: { code: "XX000" } } });
    const region = await cityRegion();
    expect(await region.findByRole("alert")).toHaveTextContent("Quelque chose n'a pas marché");
    expect(region.getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(region.getByRole("button", { name: "Retirer ma ville" })).toBeEnabled();
  });
});
