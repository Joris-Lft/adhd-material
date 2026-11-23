import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetInstallPrompt, startInstallPromptCapture } from "@/lib/install-prompt";
import { InstallApp } from "./InstallApp";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

function stubStandalone(standalone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** jsdom ne définit pas maxTouchPoints : propriété propre, retirée après chaque test. */
const overridden: string[] = [];
function setNavigator(name: "platform" | "maxTouchPoints", value: string | number) {
  Object.defineProperty(navigator, name, { configurable: true, value });
  overridden.push(name);
}

/** Événement beforeinstallprompt simulé ; renvoie le mock de prompt(). */
function fireInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

beforeEach(() => {
  resetInstallPrompt();
  stubStandalone(false);
});
afterEach(() => {
  resetInstallPrompt();
  vi.unstubAllGlobals();
});

describe("InstallApp", () => {
  it("ordinateur ou navigateur sans invite : rien n'est affiché", () => {
    startInstallPromptCapture();
    render(<InstallApp />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Chrome : l'événement est mémorisé et bloque la mini-barre ; le bouton ouvre l'invite", async () => {
    startInstallPromptCapture();
    const user = userEvent.setup();
    render(<InstallApp />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    const { event, prompt } = fireInstallPrompt("accepted");
    expect(event.defaultPrevented).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Installer l'appli" }));

    expect(prompt).toHaveBeenCalledTimes(1);
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("C'est installé");
    await waitFor(() => expect(note).toHaveFocus());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Chrome : invite refusée, message rassurant", async () => {
    startInstallPromptCapture();
    const user = userEvent.setup();
    render(<InstallApp />);
    fireInstallPrompt("dismissed");
    await user.click(await screen.findByRole("button", { name: "Installer l'appli" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pas de souci");
  });

  it("l'événement arrivé avant le montage est retrouvé", async () => {
    startInstallPromptCapture();
    fireInstallPrompt();
    render(<InstallApp />);
    expect(await screen.findByRole("button", { name: "Installer l'appli" })).toBeVisible();
  });

  it("déjà installée (display-mode: standalone) : rien, même avec l'événement", () => {
    stubStandalone(true);
    startInstallPromptCapture();
    fireInstallPrompt();
    render(<InstallApp />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("appinstalled : le bouton disparaît", async () => {
    startInstallPromptCapture();
    render(<InstallApp />);
    fireInstallPrompt();
    await screen.findByRole("button", { name: "Installer l'appli" });
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
  });

  it("l'événement mémorisé ne fuit pas : après resetInstallPrompt, un nouveau rendu n'a rien", async () => {
    startInstallPromptCapture();
    const first = render(<InstallApp />);
    fireInstallPrompt();
    expect(await screen.findByRole("button", { name: "Installer l'appli" })).toBeVisible();
    // Ni appinstalled ni clic : seul le reset peut effacer l'événement.
    first.unmount();
    resetInstallPrompt();
    render(<InstallApp />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("iOS", () => {
    beforeEach(() => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE_UA));
    afterEach(() => {
      vi.restoreAllMocks();
      overridden.splice(0).forEach((name) => Reflect.deleteProperty(navigator, name));
    });

    it("instructions Partager → Sur l'écran d'accueil, seulement à la demande", async () => {
      const user = userEvent.setup();
      render(<InstallApp />);
      const button = screen.getByRole("button", { name: "Installer l'appli" });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(/Sur l'écran d'accueil/)).not.toBeInTheDocument();

      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(/Partager/)).toBeVisible();
      expect(screen.getByText(/Sur l'écran d'accueil/)).toBeVisible();

      await user.click(button);
      expect(screen.queryByText(/Sur l'écran d'accueil/)).not.toBeInTheDocument();
    });

    it("iPadOS (Mac tactile) : mêmes instructions", async () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      );
      setNavigator("platform", "MacIntel");
      setNavigator("maxTouchPoints", 5);
      render(<InstallApp />);
      await userEvent.setup().click(screen.getByRole("button", { name: "Installer l'appli" }));
      expect(screen.getByText(/Sur l'écran d'accueil/)).toBeVisible();
      expect(screen.getByText(/ouvre la page dans Safari/)).toBeVisible();
    });

    it("Mac non tactile : rien", () => {
      setNavigator("platform", "MacIntel");
      setNavigator("maxTouchPoints", 0);
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
      render(<InstallApp />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("déjà ajoutée à l'écran d'accueil (navigator.standalone) : rien", () => {
      vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { standalone: true }));
      render(<InstallApp />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
