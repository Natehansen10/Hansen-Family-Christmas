import { createApp } from '../server/app.js'
import { MemoryStore } from '../server/store.js'
import { TOKENS } from '../shared/family.js'

export const CODES: Record<string, string> = {
  jen: '1111', curtis: '2222', lindsay: '3333', aj: '4444', nate: '5555', lydia: '6666', josh: '7777', katie: '8888', gabriel: '9999',
}

export function makeWorld() {
  const store = new MemoryStore()
  let pings = 0
  const handle = createApp({ store, onChange: () => void pings++, unfurl: async (url) => ({ url, title: 'Stub', imageUrl: null, store: 'Stub', priceCents: 1000 }) })
  const cookies: Record<string, string> = {}

  async function call(as: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await handle(
      new Request(`https://maison.test${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(as && cookies[as] ? { cookie: cookies[as] } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    )
    const text = await res.text()
    return { status: res.status, text, json: text ? JSON.parse(text) : null, setCookie: res.headers.get('set-cookie') }
  }

  /** Every adult claims a figurine and sets a code, like Thanksgiving dinner. */
  async function seatEveryone() {
    const adults = Object.keys(CODES)
    for (const [i, id] of adults.entries()) {
      const r = await call(null, 'POST', '/api/session', { action: 'claim', tokenId: TOKENS[i].id, personId: id, code: CODES[id] })
      if (r.status !== 200) throw new Error(`seat ${id}: ${r.text}`)
      cookies[id] = r.setCookie!.split(';')[0]
    }
  }

  async function addWish(as: string, ownerId: string, title: string, extra: Record<string, unknown> = {}) {
    const r = await call(as, 'POST', '/api/wishes', { ownerId, title, priority: 'love', priceCents: 2500, store: 'Shop', ...extra })
    if (r.status !== 201) throw new Error(`addWish: ${r.text}`)
    return r.json.wish.id as string
  }

  return { store, handle, call, cookies, seatEveryone, addWish, pings: () => pings }
}
