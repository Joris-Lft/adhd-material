import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version: string };
// Commit déployé par Vercel : distingue deux builds de même version pendant les tests.
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(commit ? `${version} (${commit})` : version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // INTERDIT : runtime caching de *.supabase.co (/auth, /rest) : ne jamais mettre
        // en cache les sessions ni les réponses de l'API.
      },
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: "adhd-material",
        short_name: "adhd-mat",
        description:
          "Donne ou emprunte le matériel d'activités testées puis abandonnées, près de chez toi.",
        categories: ["lifestyle", "social"],
        lang: "fr",
        theme_color: "#4f46e5",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
