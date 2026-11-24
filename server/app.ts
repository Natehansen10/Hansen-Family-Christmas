import { canClaim, canEdit } from '../shared/permissions.js'
import { CLAIM_STATUSES, PRIORITIES, type ClaimStatus, type Priority, type WishInput } from '../shared/types.js'
import { checkVault, clearCookie, ConfigError, hashVault, isVaultCode, readSession, sessionCookie } from './session.js'
import { MemoryStore, type PersonRow, type Store } from './store.js'
import { SupabaseStore } from './supabaseStore.js'
import { unfurl, UnfurlError } from './unfurl.js'
import { boardFor, ledgerFor } from './views.js'

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

export interface AppOptions {
  store?: Store
  /** called after every write; production sends a payload-free realtime ping */
  onChange?: () => void | Promise<void>
  unfurl?: typeof unfurl
}

// The project URL and publishable key are public by design (the key ships to every browser and RLS
// denies it everything), so they live here as defaults. The secret key never does: it is env-only.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ghciuhfbjzgebnjuctnd.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_7rnFHzUmGhKSo8zfd179lA_j57y9ExE'

const g = globalThis as { __mnStore?: Store }

function defaultStore(): Store {
  if (g.__mnStore) return g.__mnStore
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) return (g.__mnStore = new SupabaseStore(SUPABASE_URL, key))
  // An in-memory store on serverless would forget everything between requests. Refuse.
  if (process.env.VERCEL) throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY is not set in Vercel.')
  return (g.__mnStore = new MemoryStore())
}

function realtimeConfig() {
  // local dev on the in-memory store has nothing to listen to
  return process.env.SUPABASE_SERVICE_ROLE_KEY ? { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } : null
}

/** Payload-free on purpose: no wish or claim data ever travels over realtime. */
async function broadcastChanged() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: 'board', event: 'changed', payload: {} }] }),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    /* clients also poll, so a missed ping only costs a few seconds */
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
  const text = await req.text()
  if (text.length > 20_000) throw new HttpError(413, 'Too much.')
  try {
    const v = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Bad JSON.')
}

/** SameSite=Lax already blocks cross-site POSTs; this is the belt to that pair of braces. */
function assertSameOrigin(req: Request, url: URL) {
  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, 'Cross-site request refused.')
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(403, 'Cross-site request refused.')
  }
}

const str = (v: unknown, max: number): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new HttpError(400, 'Bad field.')
  const t = v.trim()
  if (t.length > max) throw new HttpError(400, 'That is too long.')
  return t || null
}

const httpUrl = (v: unknown, httpsOnly = false): string | null => {
  const s = str(v, 2000)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol === 'https:' || (!httpsOnly && u.protocol === 'http:')) return u.href
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'That link does not look right.')
}

function wishFields(b: Record<string, unknown>, partial: boolean): Partial<Omit<WishInput, 'ownerId'>> {
  const out: Partial<Omit<WishInput, 'ownerId'>> = {}
  if (!partial || 'title' in b) {
    const title = str(b.title, 200)
    if (!title) throw new HttpError(400, 'A wish needs a title.')
    out.title = title
  }
  if (!partial || 'priority' in b) {
    if (!PRIORITIES.includes(b.priority as Priority)) throw new HttpError(400, 'Pick a priority.')
    out.priority = b.priority as Priority
  }
  if (!partial || 'url' in b) out.url = httpUrl(b.url)
  if (!partial || 'imageUrl' in b) out.imageUrl = httpUrl(b.imageUrl, true)
  if (!partial || 'store' in b) out.store = str(b.store, 80)
  if (!partial || 'notes' in b) out.notes = str(b.notes, 1000)
  if (!partial || 'priceCents' in b) {
    const p = b.priceCents
    if (p == null || p === '') out.priceCents = null
    else if (typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 10_000_000) out.priceCents = p
    else throw new HttpError(400, 'That price does not look right.')
  }
  return out
}

export function createApp(opts: AppOptions = {}) {
  const getStore = () => opts.store ?? defaultStore()
  const changed = async () => {
    await (opts.onChange ? opts.onChange() : broadcastChanged())
  }
  const doUnfurl = opts.unfurl ?? unfurl

  async function context(req: Request) {
    const store = getStore()
    const people = await store.people()
    const pid = readSession(req)
    const viewer = (pid && people.find((p) => p.id === pid)) || null
    return { store, people, viewer }
  }

  const need = (viewer: PersonRow | null): PersonRow => {
    if (!viewer) throw new HttpError(401, 'Claim your figurine first.')
    return viewer
  }

  async function session(req: Request, secure: boolean): Promise<Response> {
    if (req.method === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) })
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const b = await readBody(req)
    const { store, people, viewer } = await context(req)
    const person = people.find((p) => p.id === b.personId)
    if (!person) throw new HttpError(404, 'No such person.')

    if (b.action === 'claim') {
      const tokenId = String(b.tokenId ?? '')
      let hash: string | null = null
      let becomes = false

      if (person.role === 'grandkid') {
        // Grandkids have no code. A managing parent picks for them.
        if (!canEdit(viewer, person)) throw new HttpError(403, `Only ${person.name}'s parents can pick this one.`)
      } else if (viewer?.id === person.id) {
        becomes = true // already proven on this device, just missing a piece
      } else {
        if (person.vaultHash) throw new HttpError(409, `${person.name} already has a vault code. Tap their figurine to sign in.`, 'code_exists')
        if (!isVaultCode(b.code)) throw new HttpError(400, 'A vault code is 4 digits.')
        hash = hashVault(b.code)
        becomes = true
      }

      const result = await store.claimToken(tokenId, person.id, hash)
      if (result !== 'ok') {
        const msg: Record<string, string> = {
          token_taken: 'Someone just claimed that piece. Pick another.',
          person_has_token: `${person.name} already has a piece.`,
          code_exists: `${person.name} already has a vault code. Tap their figurine to sign in.`,
          not_found: 'No such piece.',
        }
        throw new HttpError(result === 'not_found' ? 404 : 409, msg[result], result)
      }
      await changed()
      return json({ ok: true, personId: person.id }, 200, becomes ? { 'set-cookie': sessionCookie(person.id, secure) } : {})
    }

    if (b.action === 'verify') {
      if (person.role === 'grandkid') throw new HttpError(400, `${person.name}'s list is kept by a parent.`)
      if (!isVaultCode(b.code)) throw new HttpError(400, 'A vault code is 4 digits.')
      if (!(await store.beginVaultAttempt(person.id))) {
        throw new HttpError(429, 'Too many tries. The vault is locked for 15 minutes.', 'locked')
      }
      if (!person.vaultHash) {
        // Admin reset path: the code was cleared in the database, the next entry sets a new one.
        const tokens = await store.tokens()
        if (!tokens.some((t) => t.ownerId === person.id)) throw new HttpError(400, `${person.name} has not claimed a piece yet.`)
        if (!(await store.setVaultHashIfEmpty(person.id, hashVault(b.code)))) throw new HttpError(409, 'Try again.')
      } else if (!checkVault(b.code, person.vaultHash)) {
        throw new HttpError(401, 'That is not the code.', 'wrong_code')
      }
      await store.clearVaultAttempts(person.id)
      return json({ ok: true, personId: person.id }, 200, { 'set-cookie': sessionCookie(person.id, secure) })
    }

    throw new HttpError(400, 'Unknown action.')
  }

  async function board(req: Request): Promise<Response> {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.')
    const { store, people, viewer } = await context(req)
    const [tokens, wishes, claims] = await Promise.all([
      store.tokens(),
      viewer ? store.wishes() : Promise.resolve([]),
      viewer ? store.claims() : Promise.resolve(new Map()),
    ])
    return json(boardFor(viewer, people, tokens, wishes, claims, realtimeConfig()))
  }

  async function wishes(req: Request, url: URL): Promise<Response> {
    const { store, people, viewer: v } = await context(req)
    const viewer = need(v)
    const ownerOf = (id: string) => people.find((p) => p.id === id)

    if (req.method === 'POST') {
      const b = await readBody(req)
      const owner = ownerOf(String(b.ownerId ?? ''))
      if (!owner) throw new HttpError(404, 'No such person.')
      if (!canEdit(viewer, owner)) throw new HttpError(403, `You cannot add to ${owner.name}'s list.`)
      const { deletedAt: _d, ...wish } = await store.createWish({ ...(wishFields(b, false) as Omit<WishInput, 'ownerId'>), ownerId: owner.id }, viewer.id)
      await changed()
      return json({ wish }, 201)
    }

    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const existing = await store.wish(url.searchParams.get('id') ?? '')
      const owner = existing && ownerOf(existing.ownerId)
      // Same answer for "missing" and "not yours", and never a word about claims.
      if (!existing || existing.deletedAt || !owner || !canEdit(viewer, owner)) throw new HttpError(404, 'No such wish on a list you keep.')
      if (req.method === 'DELETE') {
        await store.deleteWish(existing.id)
        await changed()
        return json({ ok: true })
      }
      const updated = await store.updateWish(existing.id, wishFields(await readBody(req), true))
      await changed()
      if (!updated) throw new HttpError(404, 'No such wish on a list you keep.')
      const { deletedAt: _d, ...wish } = updated
      return json({ wish })
    }
    throw new HttpError(405, 'Method not allowed.')
  }

  async function claims(req: Request): Promise<Response> {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { store, people, viewer: v } = await context(req)
    const viewer = need(v)
    const b = await readBody(req)
    const wish = await store.wish(String(b.wishId ?? ''))
    const owner = wish && people.find((p) => p.id === wish.ownerId)
    // One identical refusal whether the wish is missing, yours, or a sibling's.
    // The answer must not depend on whether a claim exists.
    if (!wish || !owner || !canClaim(viewer, owner)) throw new HttpError(403, 'You cannot claim on that list.')

    const existing = await store.claim(wish.id)
    const mayChange = (claimerId: string) => {
      if (claimerId === viewer.id) return true
      // Jen and Curtis shop as a pair.
      return viewer.role === 'santa' && people.find((p) => p.id === claimerId)?.role === 'santa'
    }

    if (b.action === 'claim' || b.action === 'status') {
      const status = (b.action === 'claim' ? 'claimed' : b.status) as ClaimStatus
      if (!CLAIM_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status.')
      if (!existing) {
        if (wish.deletedAt) throw new HttpError(409, 'That wish was removed.')
        if (!(await store.insertClaim(wish.id, viewer.id, status))) throw new HttpError(409, 'Someone just claimed that one.', 'taken')
      } else if (b.action === 'claim') {
        throw new HttpError(409, 'Someone already has that one.', 'taken')
      } else {
        if (!mayChange(existing.claimerId)) throw new HttpError(403, 'That claim is not yours to change.')
        await store.updateClaim(wish.id, status)
      }
    } else if (b.action === 'release') {
      if (existing) {
        if (!mayChange(existing.claimerId)) throw new HttpError(403, 'That claim is not yours to change.')
        await store.deleteClaim(wish.id)
      }
    } else {
      throw new HttpError(400, 'Unknown action.')
    }

    await changed()
    return json({ wishId: wish.id, claim: await store.claim(wish.id) })
  }

  async function ledger(req: Request): Promise<Response> {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.')
    const { store, people, viewer: v } = await context(req)
    const viewer = need(v)
    if (viewer.role !== 'santa') throw new HttpError(403, "Santa's Office is locked.")
    const [wishes, claims] = await Promise.all([store.wishes(), store.claims()])
    return json({ rows: ledgerFor(viewer, people, wishes, claims) })
  }

  async function unfurlRoute(req: Request): Promise<Response> {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
    const { viewer } = await context(req)
    need(viewer)
    const b = await readBody(req)
    const raw = str(b.url, 2000)
    if (!raw) throw new HttpError(400, 'Paste a link first.')
    try {
      return json(await doUnfurl(raw))
    } catch (e) {
      if (e instanceof UnfurlError) throw new HttpError(400, e.message)
      throw e
    }
  }

  return async function handle(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url)
      const route = url.searchParams.get('__route') ?? url.pathname.replace(/^\/api\/?/, '').split('/')[0]
      const secure = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')) === 'https'
      if (req.method !== 'GET') assertSameOrigin(req, url)
      switch (route) {
        case 'session':
          return await session(req, secure)
        case 'board':
          return await board(req)
        case 'wishes':
          return await wishes(req, url)
        case 'claims':
          return await claims(req)
        case 'ledger':
          return await ledger(req)
        case 'unfurl':
          return await unfurlRoute(req)
        default:
          throw new HttpError(404, 'This elf took a wrong turn.')
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status)
      if (e instanceof ConfigError) return json({ error: `The workshop is not set up yet: ${e.message}`, code: 'config' }, 503)
      console.error('[api]', e)
      return json({ error: 'The elves dropped something. Try again.' }, 500)
    }
  }
}

export const handle = createApp()
