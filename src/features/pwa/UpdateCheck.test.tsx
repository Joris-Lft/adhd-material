import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PwaUpdateContext, type PwaUpdate } from "./pwa-update-context";
import { UpdateCheck } from "./UpdateCheck";

function stubServiceWorker(registration: unknown) {
  vi.stubGlobal("navigator", {
    ...navigator,
    onLine: true,
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
  });
}

function renderCheck(update: Partial<PwaUpdate> = {}) {
  const value: PwaUpdate = {
    needRefresh: false,
    updateServiceWorker: vi.fn().mockResolvedValue(undefined),
    ...update,
  };
  render(
    <PwaUpdateContext value={value}>
      <UpdateCheck />
    </PwaUpdateContext>,
  );
  return value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function check() {
  const user = userEvent.setup();
  const button = await screen.findByRole("button", { name: "Vérifier les mises à jour" });
  await user.click(button);
  return { button, user };
}

describe("UpdateCheck", () => {
  it("aucune nouvelle version : « Tu as la dernière version », focus rendu au bouton", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stubServiceWorker({ update, waiting: null, installing: null });
    renderCheck();
    const { button } = await check();
    expect(await screen.findByText("Tu as la dernière version.")).toBeVisible();
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Recharger" })).not.toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("nouvelle version en téléchargement : explication, pas encore de bouton Recharger", async () => {
    stubServiceWorker({
      update: vi.fn().mockResolvedValue(undefined),
      installing: {},
      waiting: null,
    });
    renderCheck();
    await check();
    expect(await screen.findByText(/se télécharge/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Recharger" })).not.toBeInTheDocument();
  });

  it("nouvelle version en attente mais needRefresh pas encore signalé : message d'attente, pas de Recharger", async () => {
    stubServiceWorker({
      update: vi.fn().mockResolvedValue(undefined),
      installing: null,
      waiting: {},
    });
    renderCheck();
    await check();
    expect(
      await screen.findByText("La nouvelle version se prépare, encore un instant."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Recharger" })).not.toBeInTheDocument();
  });

  it("registration disponible seulement plus tard (premier chargement) : le bouton apparaît via ready", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(undefined),
        ready: Promise.resolve({ update: vi.fn(), installing: null, waiting: null }),
      },
    });
    renderCheck();
    expect(await screen.findByRole("button", { name: "Vérifier les mises à jour" })).toBeVisible();
  });

  it("toast balayé : needRefresh suffit pour proposer Recharger, sans nouvelle vérification", async () => {
    stubServiceWorker({ update: vi.fn(), installing: null, waiting: null });
    const value = renderCheck({ needRefresh: true });
    const reload = await screen.findByRole("button", { name: "Recharger" });
    expect(screen.getByText("Une nouvelle version est prête.")).toBeVisible();
    await userEvent.setup().click(reload);
    expect(value.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("update() échoue : message d'erreur et focus rendu", async () => {
    stubServiceWorker({
      update: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      installing: null,
      waiting: null,
    });
    renderCheck();
    const { button } = await check();
    expect(await screen.findByText(/La vérification a échoué/)).toBeVisible();
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("hors connexion : échec immédiat, sans appeler update()", async () => {
    const update = vi.fn();
    stubServiceWorker({ update, installing: null, waiting: null });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderCheck();
    await check();
    expect(await screen.findByText(/La vérification a échoué/)).toBeVisible();
    expect(update).not.toHaveBeenCalled();
  });

  it("aucun service worker enregistré (développement) : pas de bouton", async () => {
    stubServiceWorker(undefined);
    renderCheck();
    await waitFor(() => expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("navigateur sans service worker : pas de bouton", () => {
    renderCheck();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
