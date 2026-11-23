import { screen } from "@testing-library/react";
import { fakeSession, supabaseMock } from "@/test/supabase-mock";
import { profileRpc } from "@/test/listing-fixtures";
import { renderApp } from "@/test/render";
import { routes } from "@/routes/routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

afterEach(() => vi.unstubAllGlobals());

describe("profil : section de l'appli", () => {
  it("avec un service worker : propose la vérification de mise à jour et affiche la version", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ update: vi.fn() }) },
    });
    supabaseMock.resetMocks();
    supabaseMock.rpc.mockImplementation(() => profileRpc(null));
    supabaseMock.setSession(fakeSession());
    renderApp(routes, "/profil");

    expect(await screen.findByRole("heading", { name: "L'appli" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Vérifier les mises à jour" })).toBeEnabled();
    expect(screen.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  });

  it("sans service worker : pas de bouton de vérification, la version reste affichée", async () => {
    supabaseMock.resetMocks();
    supabaseMock.rpc.mockImplementation(() => profileRpc(null));
    supabaseMock.setSession(fakeSession());
    renderApp(routes, "/profil");

    expect(await screen.findByRole("heading", { name: "L'appli" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Vérifier les mises à jour" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  });
});
