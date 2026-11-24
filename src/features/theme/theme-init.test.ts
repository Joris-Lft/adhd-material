import script from "../../../public/theme-init.js?raw";
import {
  applyTheme,
  readThemeChoice,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
} from "./theme";

const root = document.documentElement;

function stubSystem(dark: boolean | "absent") {
  vi.stubGlobal(
    "matchMedia",
    dark === "absent" ? undefined : (query: string) => ({ matches: dark, media: query }),
  );
}

function snapshot() {
  return {
    dark: root.classList.contains("dark"),
    colorScheme: root.style.colorScheme,
    meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  };
}

function reset() {
  root.classList.remove("dark");
  root.style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#4f46e5" />';
}

/** Résultat du script externe, puis résultat attendu par le code de l'appli : ils doivent coïncider. */
function runBoth() {
  reset();
  new Function(script)();
  const fromScript = snapshot();
  reset();
  applyTheme(resolveTheme(readThemeChoice(), systemPrefersDark()));
  return { fromScript, fromApp: snapshot() };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reset();
  root.style.colorScheme = "";
});

describe("public/theme-init.js", () => {
  it.each([
    ["light", false],
    ["dark", false],
    ["auto", true],
    ["auto", false],
    ["violet", true],
    [null, true],
    [null, false],
  ])("choix %s, appareil sombre=%s : même résultat que l'appli", (choice, systemDark) => {
    if (choice !== null) localStorage.setItem(THEME_STORAGE_KEY, choice);
    stubSystem(systemDark);
    const { fromScript, fromApp } = runBoth();
    expect(fromScript).toEqual(fromApp);
  });

  it("applique bien le sombre (classe, color-scheme, meta)", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    stubSystem(false);
    reset();
    new Function(script)();
    expect(snapshot()).toEqual({ dark: true, colorScheme: "dark", meta: "#12131d" });
  });

  it("localStorage qui lève : repli sur l'appareil", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    stubSystem(true);
    const { fromScript, fromApp } = runBoth();
    expect(fromScript.dark).toBe(true);
    expect(fromScript).toEqual(fromApp);
  });

  it("matchMedia absent : clair, sans erreur", () => {
    stubSystem("absent");
    const { fromScript, fromApp } = runBoth();
    expect(fromScript.dark).toBe(false);
    expect(fromScript).toEqual(fromApp);
  });
});
