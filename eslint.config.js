import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "supabase", "src/types/database.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // zod doit être configuré (jitless, CSP) avant le premier schéma : on n'importe que `@/lib/zod`.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^zod($|/)",
              message: 'Importe `z` depuis "@/lib/zod" (configuration jitless pour la CSP).',
            },
          ],
        },
      ],
    },
  },
  // Composants shadcn générés : exportent aussi des variants/hooks.
  { files: ["src/components/ui/**"], rules: { "react-refresh/only-export-components": "off" } },
);
