import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeSelect } from "./ThemeSelect";
import { THEME_STORAGE_KEY } from "./theme";

type Listener = (event: { matches: boolean }) => void;

/** matchMedia simulé : permet de changer le thème de l'appareil pendant le test. */
function mockSystem(initialDark: boolean) {
  const listeners = new Set<Listener>();
  let dark = initialDark;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-color-scheme: dark)" && dark;
    },
    media: query,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  mockSystem.listeners = listeners;
  return (next: boolean) => {
    dark = next;
    act(() => listeners.forEach((l) => l({ matches: next })));
  };
}

mockSystem.listeners = new Set<Listener>();

function renderSelect() {
  return render(
    <ThemeProvider>
      <ThemeSelect />
    </ThemeProvider>,
  );
}

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#4f46e5" />';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  root.classList.remove("dark");
  root.style.colorScheme = "";
});

describe("ThemeSelect", () => {
  it("expose un groupe « Apparence » de trois choix, Automatique par défaut", () => {
    mockSystem(false);
    renderSelect();
    expect(screen.getByRole("group", { name: "Apparence" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Automatique" })).toBeChecked();
    expect(root).not.toHaveClass("dark");
    expect(root.style.colorScheme).toBe("light");
  });

  it("applique Sombre tout de suite et le mémorise", async () => {
    mockSystem(false);
    renderSelect();
    await userEvent.click(screen.getByRole("radio", { name: "Sombre" }));
    expect(root).toHaveClass("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#12131d",
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("relit le choix mémorisé au chargement", () => {
    mockSystem(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderSelect();
    expect(screen.getByRole("radio", { name: "Sombre" })).toBeChecked();
    expect(root).toHaveClass("dark");
  });

  it("ignore une valeur mémorisée invalide", () => {
    mockSystem(false);
    localStorage.setItem(THEME_STORAGE_KEY, "violet");
    renderSelect();
    expect(screen.getByRole("radio", { name: "Automatique" })).toBeChecked();
  });

  it("Automatique suit le thème de l'appareil, Clair l'ignore", async () => {
    const setSystemDark = mockSystem(false);
    renderSelect();
    setSystemDark(true);
    expect(root).toHaveClass("dark");
    setSystemDark(false);
    expect(root).not.toHaveClass("dark");

    await userEvent.click(screen.getByRole("radio", { name: "Clair" }));
    setSystemDark(true);
    expect(root).not.toHaveClass("dark");
    expect(root.style.colorScheme).toBe("light");
  });

  it("démarre en sombre si l'appareil l'est et que le choix est Automatique", () => {
    mockSystem(true);
    renderSelect();
    expect(root).toHaveClass("dark");
  });

  it("ne plante pas si localStorage lève une exception", async () => {
    mockSystem(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderSelect();
    expect(screen.getByRole("radio", { name: "Automatique" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Clair" }));
    expect(screen.getByRole("radio", { name: "Clair" })).toBeChecked();
    expect(root).not.toHaveClass("dark");
  });

  it("retire son écouteur matchMedia au démontage", () => {
    mockSystem(false);
    const { unmount } = renderSelect();
    expect(mockSystem.listeners.size).toBe(1);
    unmount();
    expect(mockSystem.listeners.size).toBe(0);
  });

  it("suit le choix fait dans un autre onglet", () => {
    mockSystem(false);
    renderSelect();
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(screen.getByRole("radio", { name: "Sombre" })).toBeChecked();
    expect(root).toHaveClass("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "autre-cle" }));
    });
    expect(screen.getByRole("radio", { name: "Sombre" })).toBeChecked();
  });

  it("les notifications suivent le thème effectif", async () => {
    mockSystem(false);
    const { container } = render(
      <ThemeProvider>
        <ThemeSelect />
        <Toaster />
      </ThemeProvider>,
    );
    act(() => {
      toast("Coucou");
    });
    const toaster = () => document.querySelector("[data-sonner-toaster]");
    await vi.waitFor(() => expect(toaster()).toHaveAttribute("data-sonner-theme", "light"));
    await userEvent.click(screen.getByRole("radio", { name: "Sombre" }));
    expect(toaster()).toHaveAttribute("data-sonner-theme", "dark");
    expect(container).toBeInTheDocument();
  });
});
