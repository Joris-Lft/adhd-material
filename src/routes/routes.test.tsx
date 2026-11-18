import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { routes } from "./routes";
import { RootErrorBoundary } from "@/components/layout/RootErrorBoundary";

function renderRoutes(routeObjects: RouteObject[], path: string) {
  render(<RouterProvider router={createMemoryRouter(routeObjects, { initialEntries: [path] })} />);
}

describe("routes", () => {
  it("affiche l'accueil dans le layout", () => {
    renderRoutes(routes, "/");
    expect(screen.getByRole("heading", { name: "Annonces" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connexion" })).toBeInTheDocument();
  });

  it("affiche la 404 pour une route inconnue", () => {
    renderRoutes(routes, "/n-importe-quoi");
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
