// Suppression du compte de l'appelant (RGPD) : vide son dossier Storage puis supprime l'utilisateur.
// Les données SQL sont purgées/anonymisées par le trigger profiles_purge_listings et les FK set null.
// La clé service_role est lue depuis l'environnement de la fonction, jamais exposée au client.
// Variables : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectées par la plateforme),
// ALLOWED_ORIGINS (facultatif, origines de production séparées par des virgules).
import { createClient } from 'npm:@supabase/supabase-js@2.119'
import { buildAllowedOrigins, handle } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const allowedOrigins = buildAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))

Deno.serve((req) => {
  if (!url || !serviceKey) {
    console.error(JSON.stringify({ fn: 'delete-account', step: 'config', code: 'missing_env', uid: null }))
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return handle(req, { admin: admin as never, allowedOrigins })
})
