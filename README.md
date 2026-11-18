# adhd-material

Plateforme où des personnes TDAH donnent ou prêtent le matériel d'activités qu'elles ont testées puis abandonnées (remise en main propre, localisation par ville, messagerie). PWA en français.

Stack : React 19 + TypeScript + Vite, Tailwind CSS v4 + shadcn/ui, TanStack Query, React Router, Supabase (sécurité via RLS), hébergement Vercel.

## Prérequis

- Node 26 (voir `.nvmrc`) : `nvm install && nvm use`
- [Supabase CLI](https://supabase.com/docs/guides/cli) pour les migrations et la génération des types

## Installation

```bash
npm ci
cp .env.example .env.local   # puis renseigner les variables
npm run dev                  # http://localhost:5173
```

## Variables d'environnement

| Variable                        | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `VITE_SUPABASE_URL`             | URL du projet Supabase                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé publishable (publique). Jamais la clé `secret`. |

`.env.local` n'est pas versionné.

## Scripts

| Script                        | Rôle                                             |
| ----------------------------- | ------------------------------------------------ |
| `npm run dev`                 | Serveur de développement (port 5173)             |
| `npm run build`               | `tsc -b` puis build de production                |
| `npm run preview`             | Prévisualise le build                            |
| `npm run lint`                | ESLint                                           |
| `npm run typecheck`           | Vérification TypeScript                          |
| `npm test`                    | Tests Vitest (jsdom)                             |
| `npm run generate-pwa-assets` | Régénère les icônes PWA depuis `public/logo.svg` |

## Connexion

La connexion se fait par **Google uniquement** (décision 26) : sur Supabase cloud en offre gratuite, les modèles d'email personnalisés (code à 8 chiffres) sont refusés sans SMTP perso. Le flux email reste dans le code, désactivé par défaut, et actif sur la stack locale (`supabase start`).

Pour réactiver la connexion par email :

1. brancher un SMTP perso dans Supabase (Authentication > SMTP) ;
2. décommenter les modèles d'email dans `supabase/config.toml` (`[auth.email.template.*]`) et les pousser ;
3. définir `VITE_AUTH_EMAIL_ENABLED=true` (valeur exacte `true`) dans l'environnement du front.

## Déploiement (Vercel)

- Importer le dépôt dans Vercel (preset Vite). `vercel.json` gère la réécriture SPA, les en-têtes de sécurité (CSP en mode Report-Only) et le cache.
- Définir `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans Settings > Environment Variables pour **Production** et **Preview**.
- Dans Supabase (Authentication > URL Configuration), autoriser les redirect URLs :
  - `http://localhost:5173/**`
  - l'URL de production (`https://<domaine-prod>/**`)
  - les previews : uniquement des URLs explicites, jamais de joker du type `adhd-material-*-…vercel.app` (n'importe qui peut créer un projet Vercel dont le domaine correspond au motif et y détourner un magic link)
- Mise à jour de la PWA : à la sortie d'une nouvelle version, un toast « Nouvelle version disponible » propose de recharger. Il n'y a jamais de rechargement automatique, pour ne pas faire perdre un formulaire en cours.
