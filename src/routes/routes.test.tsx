vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { supabaseMock } from "@/test/supabase-mock";
import { renderApp } from "@/test/render";
import { routes } from "./routes";

import { RootErrorBoundary } from "@/components/layout/RootErrorBoundary";

function renderRoutes(routeObjects: RouteObject[], path: string) {
  render(<RouterProvider router={createMemoryRouter(routeObjects, { initialEntries: [path] })} />);
}

describe("routes", () => {
  beforeEach(() => supabaseMock.resetMocks());

  it("affiche l'accueil dans le layout", async () => {
    renderApp(routes, "/");
    expect(screen.getByRole("heading", { name: "Annonces" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toBeInTheDocument();
    expect(document.title).toBe("Annonces · adhd-material");
  });

  it("déplace le focus sur le h1 à chaque changement de route", async () => {
    const { router } = renderApp(routes, "/");
    await screen.findByRole("link", { name: "Connexion" });
    await act(() => router.navigate("/n-importe-quoi"));
    expect(screen.getByRole("heading", { name: "Page introuvable" })).toHaveFocus();
  });

  it("affiche la 404 pour une route inconnue", () => {
    renderApp(routes, "/n-importe-quoi");
    expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
  });

  it("affiche l'errorElement quand une page plante", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("boom");
    };
    renderRoutes([{ path: "/", element: <Boom />, errorElement: <RootErrorBoundary /> }], "/");
    expect(
      screen.getByRole("heading", { name: /quelque chose s'est mal passé/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
  });
});
