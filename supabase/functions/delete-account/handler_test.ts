// Tests de la logique de delete-account avec Auth et Storage simulés :
//   deno test supabase/functions/delete-account
import { assertEquals } from 'jsr:@std/assert@1'
import { buildAllowedOrigins, handle, MAX_STORAGE_PAGES, PAGE_SIZE, type AdminClient } from './handler.ts'

const UID = '11111111-1111-1111-1111-111111111111'
const NOW = 1_800_000_000_000 // ms

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
// iat très ancien mais authentification récente (jeton rafraîchi) : doit être accepté.
const recentToken = jwt({ amr: [{ method: 'otp', timestamp: NOW / 1000 - 60 }], iat: NOW / 1000 - 99999 })
const staleToken = jwt({ amr: [{ method: 'otp', timestamp: NOW / 1000 - 601 }], iat: NOW / 1000 })

interface FakeOptions {
  files?: string[][] // pages successives renvoyées par list()
  failRemoveTimes?: number
  alwaysFull?: boolean
  getUserError?: boolean
  listError?: boolean
  deleteUserError?: boolean
}

function fakeAdmin(opts: FakeOptions = {}) {
  const calls: string[] = []
  let removeFailures = opts.failRemoveTimes ?? 0
  const pages = [...(opts.files ?? [])]
  const admin: AdminClient = {
    auth: {
      getUser: (_t) => {
        calls.push('getUser')
        return Promise.resolve(
          opts.getUserError
            ? { data: { user: null }, error: { message: 'bad jwt' } }
            : { data: { user: { id: UID } }, error: null },
        )
      },
      admin: {
        deleteUser: (id) => {
          calls.push(`deleteUser:${id}`)
          return Promise.resolve({ error: opts.deleteUserError ? { code: 'boom' } : null })
        },
      },
    },
    storage: {
      from: (_b) => ({
        list: (_p, _o) => {
          calls.push('list')
          if (opts.listError) return Promise.resolve({ data: null, error: { code: 'boom' } })
          const names = opts.alwaysFull
            ? Array.from({ length: PAGE_SIZE }, (_, i) => `f${i}.jpg`)
            : (pages.shift() ?? [])
          return Promise.resolve({ data: names.map((name) => ({ name })), error: null })
        },
        remove: (paths) => {
          calls.push(`remove:${paths.length}`)
          if (removeFailures > 0) {
            removeFailures--
            return Promise.resolve({ error: { code: 'boom' } })
          }
          return Promise.resolve({ error: null })
        },
      }),
    },
  }
  return { admin, calls }
}

const call = (admin: AdminClient, token: string | null, init: { method?: string; origin?: string } = {}) =>
  handle(
    new Request('http://localhost/delete-account', {
      method: init.method ?? 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.origin ? { Origin: init.origin } : {}),
      },
    }),
    { admin, allowedOrigins: buildAllowedOrigins('https://app.example.org'), now: () => NOW },
  )

Deno.test('401 sans jeton, aucun accès Auth/Storage', async () => {
  const { admin, calls } = fakeAdmin()
  const res = await call(admin, null)
  assertEquals(res.status, 401)
  assertEquals((await res.json()).error, 'unauthenticated')
  assertEquals(calls, [])
})

Deno.test('401 si le jeton est invalide', async () => {
  const { admin, calls } = fakeAdmin({ getUserError: true })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 401)
  assertEquals(calls, ['getUser'])
})

Deno.test('401 reauth_required si la dernière authentification a plus de 10 minutes (iat ignoré)', async () => {
  const { admin, calls } = fakeAdmin()
  const res = await call(admin, staleToken)
  assertEquals(res.status, 401)
  assertEquals((await res.json()).error, 'reauth_required')
  assertEquals(calls, ['getUser']) // ni Storage ni suppression
})

Deno.test('401 reauth_required si amr est absent', async () => {
  const { admin } = fakeAdmin()
  const res = await call(admin, jwt({ iat: NOW / 1000 }))
  assertEquals(res.status, 401)
  assertEquals((await res.json()).error, 'reauth_required')
})

Deno.test('Storage est vidé AVANT la suppression de l’utilisateur', async () => {
  const { admin, calls } = fakeAdmin({ files: [['a.jpg', 'b.jpg']] })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 200)
  assertEquals(calls, ['getUser', 'list', 'remove:2', `deleteUser:${UID}`])
})

Deno.test('pagination : plusieurs pages de fichiers', async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => `f${i}.jpg`)
  const { admin, calls } = fakeAdmin({ files: [full, ['z.jpg']] })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 200)
  assertEquals(calls, ['getUser', 'list', `remove:${PAGE_SIZE}`, 'list', 'remove:1', `deleteUser:${UID}`])
})

Deno.test('échec partiel puis rejeu : le compte n’est pas supprimé au premier échec, supprimé au rejeu', async () => {
  const { admin, calls } = fakeAdmin({ files: [['a.jpg'], ['a.jpg']], failRemoveTimes: 1 })
  const first = await call(admin, recentToken)
  assertEquals(first.status, 500)
  assertEquals((await first.json()).error, 'storage_remove_failed')
  assertEquals(calls.some((c) => c.startsWith('deleteUser')), false)
  const second = await call(admin, recentToken)
  assertEquals(second.status, 200)
  assertEquals(calls.filter((c) => c.startsWith('deleteUser')).length, 1)
  assertEquals(calls.at(-1), `deleteUser:${UID}`)
})

Deno.test('boucle Storage plafonnée : le compte n’est pas supprimé si le dossier ne se vide jamais', async () => {
  const { admin, calls } = fakeAdmin({ alwaysFull: true })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 500)
  assertEquals((await res.json()).error, 'storage_cleanup_incomplete')
  assertEquals(calls.filter((c) => c === 'list').length, MAX_STORAGE_PAGES)
  assertEquals(calls.some((c) => c.startsWith('deleteUser')), false)
})

Deno.test('CORS : origine inconnue refusée, origines autorisées reflétées', async () => {
  assertEquals((await call(fakeAdmin().admin, recentToken, { origin: 'https://evil.example' })).status, 403)
  assertEquals(
    (await call(fakeAdmin().admin, recentToken, { origin: 'https://adhd-material-evil.vercel.app' })).status,
    403,
  )
  // le motif est ancré : hash de 9 caractères exactement, pas de suffixe ni de préfixe
  for (
    const origin of [
      'https://adhd-material-4hfzdq0a5-joris-lfts-projects.vercel.app.evil.example',
      'https://evil.example/https://adhd-material-4hfzdq0a5-joris-lfts-projects.vercel.app',
      'https://adhd-material-4hfzdq0a-joris-lfts-projects.vercel.app', // 8 caractères
      'https://adhd-material-4hfzdq0a5x-joris-lfts-projects.vercel.app', // 10 caractères
      'https://adhd-material-4hfzdq0a5-other-projects.vercel.app',
    ]
  ) {
    assertEquals((await call(fakeAdmin().admin, recentToken, { origin })).status, 403, origin)
  }
  for (
    const origin of [
      'http://localhost:5173',
      'https://adhd-material-4hfzdq0a5-joris-lfts-projects.vercel.app',
      'https://app.example.org',
    ]
  ) {
    const res = await call(fakeAdmin({ files: [[]] }).admin, recentToken, { origin })
    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin)
  }
  const pre = await call(fakeAdmin().admin, null, { method: 'OPTIONS', origin: 'http://localhost:5173' })
  assertEquals(pre.status, 204)
})

Deno.test('Vary: Origin présent (origine autorisée, refusée, absente, préflight)', async () => {
  const allowed = await call(fakeAdmin({ files: [[]] }).admin, recentToken, { origin: 'http://localhost:5173' })
  assertEquals(allowed.headers.get('Vary'), 'Origin')
  const denied = await call(fakeAdmin().admin, recentToken, { origin: 'https://evil.example' })
  assertEquals(denied.headers.get('Vary'), 'Origin')
  assertEquals(denied.headers.get('Access-Control-Allow-Origin'), null)
  const none = await call(fakeAdmin({ files: [[]] }).admin, recentToken)
  assertEquals(none.headers.get('Vary'), 'Origin')
  const pre = await call(fakeAdmin().admin, null, { method: 'OPTIONS', origin: 'http://localhost:5173' })
  assertEquals(pre.headers.get('Vary'), 'Origin')
})

Deno.test('405 pour une méthode autre que POST/OPTIONS, sans accès Auth/Storage', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { admin, calls } = fakeAdmin()
    const res = await call(admin, recentToken, { method })
    assertEquals(res.status, 405, method)
    assertEquals((await res.json()).error, 'method_not_allowed')
    assertEquals(calls, [])
  }
})

Deno.test('500 storage_list_failed si list() échoue : le compte n’est pas supprimé', async () => {
  const { admin, calls } = fakeAdmin({ listError: true })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 500)
  assertEquals((await res.json()).error, 'storage_list_failed')
  assertEquals(calls, ['getUser', 'list'])
})

Deno.test('500 delete_user_failed si deleteUser échoue', async () => {
  const { admin, calls } = fakeAdmin({ files: [[]], deleteUserError: true })
  const res = await call(admin, recentToken)
  assertEquals(res.status, 500)
  assertEquals((await res.json()).error, 'delete_user_failed')
  assertEquals(calls.at(-1), `deleteUser:${UID}`)
})

Deno.test('payload JWT en base64 invalide ou non JSON → reauth_required', async () => {
  for (const token of ['a.%%%.c', `a.${btoa('pas du json')}.c`, 'sans-point', 'a..c']) {
    const { admin, calls } = fakeAdmin()
    const res = await call(admin, token)
    assertEquals(res.status, 401, token)
    assertEquals((await res.json()).error, 'reauth_required')
    assertEquals(calls, ['getUser']) // ni Storage ni suppression
  }
})

Deno.test('borne à 600 s : acceptée à exactement 600 s, refusée à 601 s', async () => {
  const at = (age: number) => jwt({ amr: [{ method: 'otp', timestamp: NOW / 1000 - age }] })
  const exact = await call(fakeAdmin({ files: [[]] }).admin, at(600))
  assertEquals(exact.status, 200)
  const over = await call(fakeAdmin().admin, at(601))
  assertEquals(over.status, 401)
  assertEquals((await over.json()).error, 'reauth_required')
})

Deno.test('amr à plusieurs entrées : on retient la plus récente, quel que soit l’ordre', async () => {
  const old = { method: 'password', timestamp: NOW / 1000 - 99999 }
  const recent = { method: 'otp', timestamp: NOW / 1000 - 30 }
  for (const amr of [[old, recent], [recent, old]]) {
    const res = await call(fakeAdmin({ files: [[]] }).admin, jwt({ amr }))
    assertEquals(res.status, 200)
  }
  // toutes les entrées anciennes → refus ; entrées sans timestamp numérique ignorées
  const stale = await call(fakeAdmin().admin, jwt({ amr: [old, { method: 'otp', timestamp: 'x' }, {}] }))
  assertEquals(stale.status, 401)
})
