import "@testing-library/jest-dom/vitest";

// jsdom n'implémente pas matchMedia (utilisé par sonner).
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom n'implémente pas scrollTo (ScrollRestoration).
window.scrollTo = () => {};
