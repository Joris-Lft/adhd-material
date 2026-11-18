// Logique de la fonction delete-account, sans dépendance réseau : le client admin Supabase est injecté
// (voir index.ts) pour pouvoir être simulé dans handler_test.ts.

export const BUCKET = 'listing-photos'
export const PAGE_SIZE = 100
export const MAX_STORAGE_PAGES = 20 // plafond de la boucle de purge (2 000 fichiers) ; 3 photos max par annonce
export const REAUTH_WINDOW_SECONDS = 600

type SupabaseError = { message?: string; code?: string | number; status?: number } | null

export interface AdminClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: SupabaseError }>
    admin: { deleteUser(id: string): Promise<{ error: SupabaseError }> }
  }
  storage: {
    from(bucket: string): {
      list(path: string, options: { limit: number }): Promise<{ data: { name: string }[] | null; error: SupabaseError }>
      remove(paths: string[]): Promise<{ error: SupabaseError }>
    }
  }
}

export interface Deps {
  admin: AdminClient
  allowedOrigins: (string | RegExp)[]
  now?: () => number // millisecondes, injectable pour les tests
}

/** Origines autorisées : localhost (dev), les previews Vercel du projet, plus ALLOWED_ORIGINS (liste séparée par des virgules). */
export function buildAllowedOrigins(envValue?: string | null): (string | RegExp)[] {
  const extra = (envValue ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  return [
    'http://localhost:5173',
    /^https:\/\/adhd-material-[a-z0-9]{9}-joris-lfts-projects\.vercel\.app$/,
    ...extra,
  ]
}

const isAllowed = (origin: string, allowed: (string | RegExp)[]) =>
  allowed.some((a) => (typeof a === 'string' ? a === origin : a.test(origin)))

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Lit le claim amr d'un JWT déjà validé par Auth : [{ method, timestamp }] (timestamp en secondes). */
function lastAuthenticationTimestamp(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    const stamps = (Array.isArray(claims.amr) ? claims.amr : [])
      .map((a: { timestamp?: unknown }) => a?.timestamp)
      .filter((t: unknown): t is number => typeof t === 'number')
    return stamps.length > 0 ? Math.max(...stamps) : null
  } catch {
    return null
  }
}

// Journal : étape, code d'erreur et uid uniquement (jamais d'email).
const logError = (step: string, error: SupabaseError, uid?: string) =>
  console.error(JSON.stringify({ fn: 'delete-account', step, code: error?.code ?? error?.status ?? null, uid: uid ?? null }))

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { admin, allowedOrigins } = deps
  const now = deps.now ?? Date.now

  const origin = req.headers.get('Origin')
  // La réponse dépend de l'en-tête Origin : Vary: Origin toujours présent (caches, CDN).
  const cors: Record<string, string> = { Vary: 'Origin' }
  if (origin) {
    if (!isAllowed(origin, allowedOrigins)) return jsonResponse({ error: 'origin_not_allowed' }, 403, cors)
    cors['Access-Control-Allow-Origin'] = origin
    cors['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type'
    cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthenticated' }, 401, cors)

  // Identité = celle du jeton validé par Auth, jamais celle du corps de la requête.
  const { data, error: authError } = await admin.auth.getUser(token)
  if (authError || !data.user) return jsonResponse({ error: 'unauthenticated' }, 401, cors)
  const uid = data.user.id

  // Ré-authentification récente : on lit amr (et non iat, qui change à chaque rafraîchissement du jeton).
  const lastAuth = lastAuthenticationTimestamp(token)
  if (lastAuth === null || now() / 1000 - lastAuth > REAUTH_WINDOW_SECONDS) {
    return jsonResponse({ error: 'reauth_required' }, 401, cors)
  }

  // 1. Vide le dossier {uid}/ du bucket (borné à MAX_STORAGE_PAGES pages).
  const bucket = admin.storage.from(BUCKET)
  let emptied = false
  for (let page = 0; page < MAX_STORAGE_PAGES; page++) {
    const { data: files, error: listError } = await bucket.list(uid, { limit: PAGE_SIZE })
    if (listError) {
      logError('storage_list', listError, uid)
      return jsonResponse({ error: 'storage_list_failed' }, 500, cors)
    }
    if (!files || files.length === 0) {
      emptied = true
      break
    }
    const { error: removeError } = await bucket.remove(files.map((f) => `${uid}/${f.name}`))
    if (removeError) {
      logError('storage_remove', removeError, uid)
      return jsonResponse({ error: 'storage_remove_failed' }, 500, cors)
    }
    if (files.length < PAGE_SIZE) {
      emptied = true
      break
    }
  }
  if (!emptied) {
    logError('storage_cleanup_incomplete', null, uid)
    return jsonResponse({ error: 'storage_cleanup_incomplete' }, 500, cors)
  }

  // 2. Supprime le compte (les triggers/cascades SQL purgent et anonymisent les données).
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
  if (deleteError) {
    logError('delete_user', deleteError, uid)
    return jsonResponse({ error: 'delete_user_failed' }, 500, cors)
  }
  return jsonResponse({ deleted: true }, 200, cors)
}
