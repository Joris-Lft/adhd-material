/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_AUTH_EMAIL_ENABLED?: string;
}

/** Version de l'appli (package.json + commit du déploiement), injectée par vite.config.ts. */
declare const __APP_VERSION__: string;
