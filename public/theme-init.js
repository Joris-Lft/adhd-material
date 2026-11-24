// Appliqué avant le premier rendu (script externe : la CSP interdit les scripts inline).
// Garder en phase avec src/features/theme/theme.ts (clé, couleurs).
(function () {
  var dark = false;
  try {
    var choice = localStorage.getItem("adhd-material-theme");
    dark =
      choice === "dark" ||
      (choice !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) {
    try {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e2) {
      dark = false;
    }
  }
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#12131d" : "#4f46e5");
})();
