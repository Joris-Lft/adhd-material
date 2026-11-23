import { act, render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

const MESSAGE =
  "Tu es hors connexion : les annonces et messages ne se mettent plus à jour. Ça reprendra tout seul au retour du réseau.";

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

afterEach(() => vi.restoreAllMocks());

describe("OfflineBanner", () => {
  it("en ligne : la zone de statut existe mais reste vide", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("apparaît quand la connexion tombe, disparaît au retour", () => {
    render(<OfflineBanner />);
    setOnline(false);
    expect(screen.getByRole("status")).toHaveTextContent(MESSAGE);
    setOnline(true);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("déjà hors connexion au chargement : affiché tout de suite", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(MESSAGE);
  });
});
