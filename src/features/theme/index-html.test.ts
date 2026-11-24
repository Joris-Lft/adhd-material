import html from "../../../index.html?raw";

describe("index.html : anti-flash du thème", () => {
  it("charge /theme-init.js de façon bloquante, après la meta theme-color", () => {
    const tag = html.match(/<script\b[^>]*src="\/theme-init\.js"[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).not.toMatch(/\b(type|async|defer)\b/);
    expect(html.indexOf('name="theme-color"')).toBeGreaterThan(-1);
    expect(html.indexOf('name="theme-color"')).toBeLessThan(html.indexOf("/theme-init.js"));
    expect(html.indexOf("/theme-init.js")).toBeLessThan(html.indexOf("/src/main.tsx"));
  });
});
