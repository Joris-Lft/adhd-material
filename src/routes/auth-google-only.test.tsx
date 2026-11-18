import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, supabaseMock } from "@/test/supabase-mock";
import { renderApp } from "@/test/render";
import { CODE_WAIT_MS } from "@/pages/AuthConfirmationPage";
import { routes } from "./routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

function mockProfile() {
  supabaseMock.rpc.mockReturnValue({
    maybeSingle: () =>
      Promise.resolve({
        data: { id: "user-1", city_id: null, display_name: "Alex", display_name_confirmed: true },
        error: null,
      }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs(); // flux email désactivé par défaut
  supabaseMock.resetMocks();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("flux email désactivé (Google uniquement)", () => {
  it("n'est actif que si la valeur vaut exactement « true »", async () => {
    vi.stubEnv("VITE_AUTH_EMAIL_ENABLED", "1");
    renderApp(routes, "/connexion");
    expect(await screen.findByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    expect(screen.queryByLabelText("Ton email")).not.toBeInTheDocument();
  });

  it("/connexion n'affiche que le bouton Google et une phrase rassurante", async () => {
    renderApp(routes, "/connexion");
    expect(await screen.findByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    expect(screen.queryByLabelText("Ton email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recevoir un code" })).not.toBeInTheDocument();
    expect(screen.getByText(/ton nom n'est jamais affiché/)).toBeInTheDocument();
  });

  const oldAuth = () => Math.floor(Date.now() / 1000) - 3600;

  it("ré-authentification : Google seulement, pas d'option code", async () => {
    supabaseMock.setSession(fakeSession({ amrTimestamp: oldAuth(), providers: ["google"] }));
    mockProfile();
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    expect(await screen.findByRole("button", { name: "Passer par Google" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Recevoir un code par email" }),
    ).not.toBeInTheDocument();
  });

  it("compte sans identité Google : message clair, aucun parcours impossible", async () => {
    supabaseMock.setSession(fakeSession({ amrTimestamp: oldAuth(), providers: ["email"] }));
    mockProfile();
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    expect(await screen.findByText(/Contacte-nous/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer par Google" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recevoir un code par email" }),
    ).not.toBeInTheDocument();
  });
});

describe("/auth/confirmation?code= (lien PKCE du modèle par défaut)", () => {
  it("attend la session échangée par supabase-js puis redirige", async () => {
    const { router } = renderApp(routes, "/auth/confirmation?code=abc");
    expect(await screen.findByText("On te connecte…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeNull();
    mockProfile();
    await act(async () => supabaseMock.setSession(fakeSession(), "SIGNED_IN"));
    expect(await screen.findByRole("heading", { name: "Annonces" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(supabaseMock.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("n'affiche l'erreur que si aucune session n'arrive", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(routes, "/auth/confirmation?code=abc");
    expect(await screen.findByText("On te connecte…")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(CODE_WAIT_MS + 100);
    });
    expect(
      await screen.findByRole("heading", { name: "Ce lien ne fonctionne plus" }),
    ).toBeInTheDocument();
  });
});
