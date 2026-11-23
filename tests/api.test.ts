import { beforeEach, describe, expect, it } from 'vitest'
import { PEOPLE, TOKENS } from '../shared/family.js'
import { canSeeStatus } from '../shared/permissions.js'
import { CODES, makeWorld } from './helpers.js'

const P = Object.fromEntries(PEOPLE.map((p) => [p.id, p]))
const ADULTS = Object.keys(CODES)
const KIDS = PEOPLE.filter((p) => p.role === 'kid').map((p) => p.id)
const NOT_SANTAS = PEOPLE.filter((p) => p.role !== 'santa').map((p) => p.id)

/** Any key anywhere in a JSON value that smells like claim data. */
function claimKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => claimKeys(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(/claim|status|bought|wrapped|removed/i.test(k) ? [`${path}.${k}`] : []),
      ...claimKeys(v, `${path}.${k}`),
    ])
  }
  return []
}

let w: ReturnType<typeof makeWorld>
const wishOf: Record<string, string> = {}

/**
 * A fully loaded Christmas: everyone has a wish, and EVERY wish has a claim
 * on it. If the shield leaks anywhere, there is something to find.
 */
beforeEach(async () => {
  w = makeWorld()
  await w.seatEveryone()
  for (const p of PEOPLE) {
    const author = p.role === 'grandkid' ? p.managers[0] : p.id
    wishOf[p.id] = await w.addWish(author, p.id, `${p.name} wish`)
  }
  // Jen buys for everyone but herself; Curtis claims on Jen's list.
  for (const p of PEOPLE) {
    const buyer = p.id === 'jen' ? 'curtis' : 'jen'
    const r = await w.call(buyer, 'POST', '/api/claims', { wishId: wishOf[p.id], action: 'status', status: 'bought' })
    expect(r.status).toBe(200)
  }
})

describe('GET /api/board: claim data never reaches a device that may not see it', () => {
  it('every wish in the fixture really does have a claim', async () => {
    expect((await w.store.claims()).size).toBe(12)
  })

  for (const kid of KIDS) {
    it(`${kid}'s board has zero claim fields for their own, sibling and grandkid lists`, async () => {
      const r = await w.call(kid, 'GET', '/api/board')
      expect(r.status).toBe(200)
      expect(r.json.viewerId).toBe(kid)
      expect(r.json.wishes).toHaveLength(12)
      for (const wish of r.json.wishes) {
        if (NOT_SANTAS.includes(wish.ownerId)) {
          expect(claimKeys(wish), `${kid} viewing ${wish.ownerId}`).toEqual([])
          expect('claim' in wish).toBe(false)
        } else {
          expect(wish.claim, `${kid} coordinates on ${wish.ownerId}`).toMatchObject({ status: 'bought' })
        }
      }
    })
  }

  it('matches the permission matrix for every signed-in viewer x owner', async () => {
    for (const viewer of ADULTS) {
      const { json } = await w.call(viewer, 'GET', '/api/board')
      for (const wish of json.wishes) {
        const allowed = canSeeStatus(P[viewer], P[wish.ownerId])
        expect('claim' in wish, `${viewer} -> ${wish.ownerId}`).toBe(allowed)
        if (!allowed) expect(claimKeys(wish)).toEqual([])
      }
    }
  })

  it('Jen and Curtis never see status on their own list, and do on each other', async () => {
    const jen = (await w.call('jen', 'GET', '/api/board')).json.wishes
    expect('claim' in jen.find((x: { ownerId: string }) => x.ownerId === 'jen')).toBe(false)
    expect(jen.find((x: { ownerId: string }) => x.ownerId === 'curtis').claim.claimerId).toBe('jen')
    const curtis = (await w.call('curtis', 'GET', '/api/board')).json.wishes
    expect('claim' in curtis.find((x: { ownerId: string }) => x.ownerId === 'curtis')).toBe(false)
  })

  it('a kid cannot tell a claimed sibling wish from an unclaimed one, byte for byte', async () => {
    const before = (await w.call('nate', 'GET', '/api/board')).text
    await w.call('jen', 'POST', '/api/claims', { wishId: wishOf.nate, action: 'release' })
    await w.call('jen', 'POST', '/api/claims', { wishId: wishOf.josh, action: 'release' })
    await w.call('jen', 'POST', '/api/claims', { wishId: wishOf.honey, action: 'release' })
    const after = (await w.call('nate', 'GET', '/api/board')).text
    expect(after).toBe(before)
  })

  it('with no session the board has people and tokens but no wishes at all', async () => {
    const { json } = await w.call(null, 'GET', '/api/board')
    expect(json.viewerId).toBeNull()
    expect(json.people).toHaveLength(12)
    expect(json.tokens).toHaveLength(16)
    expect(json.wishes).toEqual([])
    expect(claimKeys(json)).toEqual([])
  })

  it('never ships a vault hash', async () => {
    const { text } = await w.call('jen', 'GET', '/api/board')
    expect(text).not.toMatch(/scrypt|vault_hash|vaultHash/)
  })

  it('a forged or tampered cookie is nobody', async () => {
    w.cookies.fake = w.cookies.nate.replace('mn_session=nate', 'mn_session=jen')
    const { json } = await w.call('fake', 'GET', '/api/board')
    expect(json.viewerId).toBeNull()
    expect(json.wishes).toEqual([])
  })

  it('a wish the owner removed stays visible only to people tracking its claim', async () => {
    expect((await w.call('nate', 'DELETE', `/api/wishes?id=${wishOf.nate}`)).status).toBe(200)
    const forJen = (await w.call('jen', 'GET', '/api/board')).json.wishes.find((x: { id: string }) => x.id === wishOf.nate)
    expect(forJen).toMatchObject({ removed: true, claim: { status: 'bought' } })
    for (const viewer of ['nate', 'josh', 'lydia']) {
      const list = (await w.call(viewer, 'GET', '/api/board')).json.wishes
      expect(list.find((x: { id: string }) => x.id === wishOf.nate)).toBeUndefined()
    }
  })
})

describe('POST /api/claims', () => {
  it('siblings cannot claim for each other, for grandkids, or on their own list', async () => {
    for (const target of ['josh', 'nate', 'honey', 'frankie']) {
      const r = await w.call('nate', 'POST', '/api/claims', { wishId: wishOf[target], action: 'claim' })
      expect(r.status, target).toBe(403)
      expect(claimKeys(r.json)).toEqual([])
    }
  })

  it('the refusal is identical whether or not the wish is claimed or even exists', async () => {
    const claimed = await w.call('nate', 'POST', '/api/claims', { wishId: wishOf.josh, action: 'claim' })
    await w.call('jen', 'POST', '/api/claims', { wishId: wishOf.josh, action: 'release' })
    const unclaimed = await w.call('nate', 'POST', '/api/claims', { wishId: wishOf.josh, action: 'claim' })
    const missing = await w.call('nate', 'POST', '/api/claims', { wishId: 'nope', action: 'claim' })
    expect(unclaimed.text).toBe(claimed.text)
    expect(missing.text).toBe(claimed.text)
    for (const action of ['release', 'status']) {
      const a = await w.call('nate', 'POST', '/api/claims', { wishId: wishOf.katie, action, status: 'bought' })
      expect(a.text).toBe(claimed.text)
    }
  })

  it('kids coordinate on the parents: one claim per wish, visible to the other kids', async () => {
    const gift = await w.addWish('curtis', 'curtis', 'Thermometer')
    expect((await w.call('gabriel', 'POST', '/api/claims', { wishId: gift, action: 'claim' })).status).toBe(200)
    const second = await w.call('josh', 'POST', '/api/claims', { wishId: gift, action: 'claim' })
    expect(second.status).toBe(409)
    const seen = (await w.call('katie', 'GET', '/api/board')).json.wishes.find((x: { id: string }) => x.id === gift)
    expect(seen.claim).toEqual({ claimerId: 'gabriel', status: 'claimed' })
    // Josh cannot release or advance Gabriel's claim
    expect((await w.call('josh', 'POST', '/api/claims', { wishId: gift, action: 'release' })).status).toBe(403)
    expect((await w.call('josh', 'POST', '/api/claims', { wishId: gift, action: 'status', status: 'bought' })).status).toBe(403)
    expect((await w.call('gabriel', 'POST', '/api/claims', { wishId: gift, action: 'status', status: 'bought' })).json.claim.status).toBe('bought')
    // and Curtis sees none of it
    const own = (await w.call('curtis', 'GET', '/api/board')).json.wishes.find((x: { id: string }) => x.id === gift)
    expect('claim' in own).toBe(false)
  })

  it('Jen and Curtis shop as a pair on the kids lists', async () => {
    const r = await w.call('curtis', 'POST', '/api/claims', { wishId: wishOf.nate, action: 'status', status: 'under_tree' })
    expect(r.json.claim).toEqual({ claimerId: 'jen', status: 'under_tree' })
  })

  it('needs a session', async () => {
    expect((await w.call(null, 'POST', '/api/claims', { wishId: wishOf.jen, action: 'claim' })).status).toBe(401)
  })
})

describe('GET /api/ledger', () => {
  it('is locked for every kid and for visitors', async () => {
    for (const kid of KIDS) {
      const r = await w.call(kid, 'GET', '/api/ledger')
      expect(r.status).toBe(403)
      expect(claimKeys(r.json)).toEqual([])
    }
    expect((await w.call(null, 'GET', '/api/ledger')).status).toBe(401)
  })

  it('shows a santa every wish except their own', async () => {
    const jen = (await w.call('jen', 'GET', '/api/ledger')).json.rows
    expect(jen).toHaveLength(11)
    expect(jen.some((r: { ownerId: string }) => r.ownerId === 'jen')).toBe(false)
    expect(jen.every((r: { claim: unknown }) => r.claim)).toBe(true)
    const curtis = (await w.call('curtis', 'GET', '/api/ledger')).json.rows
    expect(curtis.some((r: { ownerId: string }) => r.ownerId === 'curtis')).toBe(false)
    expect(curtis.some((r: { ownerId: string }) => r.ownerId === 'jen')).toBe(true)
  })
})

describe('wishes', () => {
  it('you edit your own list; managers edit their grandkids; nobody else', async () => {
    expect((await w.call('nate', 'POST', '/api/wishes', { ownerId: 'honey', title: 'Bunny', priority: 'must' })).status).toBe(201)
    expect((await w.call('lydia', 'PATCH', `/api/wishes?id=${wishOf.honey}`, { title: 'Bigger bunny' })).json.wish.title).toBe('Bigger bunny')
    expect((await w.call('josh', 'POST', '/api/wishes', { ownerId: 'honey', title: 'x', priority: 'must' })).status).toBe(403)
    expect((await w.call('josh', 'POST', '/api/wishes', { ownerId: 'nate', title: 'x', priority: 'must' })).status).toBe(403)
    expect((await w.call('jen', 'PATCH', `/api/wishes?id=${wishOf.nate}`, { title: 'x' })).status).toBe(404)
    expect((await w.call('jen', 'DELETE', `/api/wishes?id=${wishOf.nate}`)).status).toBe(404)
    expect((await w.call(null, 'POST', '/api/wishes', { ownerId: 'nate', title: 'x', priority: 'must' })).status).toBe(401)
  })

  it('editing or deleting your own wish reveals nothing about claims', async () => {
    const patch = await w.call('nate', 'PATCH', `/api/wishes?id=${wishOf.nate}`, { notes: 'Size M' })
    expect(patch.status).toBe(200)
    expect(claimKeys(patch.json)).toEqual([])
    const del = await w.call('nate', 'DELETE', `/api/wishes?id=${wishOf.nate}`)
    expect(del.text).toBe('{"ok":true}')
  })

  it('validates input', async () => {
    const bad = [
      { ownerId: 'nate', title: '', priority: 'must' },
      { ownerId: 'nate', title: 'x', priority: 'urgent' },
      { ownerId: 'nate', title: 'x', priority: 'must', url: 'javascript:alert(1)' },
      { ownerId: 'nate', title: 'x', priority: 'must', imageUrl: 'http://insecure.example/a.png' },
      { ownerId: 'nate', title: 'x', priority: 'must', priceCents: -5 },
      { ownerId: 'nate', title: 'x'.repeat(300), priority: 'must' },
    ]
    for (const b of bad) expect((await w.call('nate', 'POST', '/api/wishes', b)).status, JSON.stringify(b).slice(0, 60)).toBe(400)
  })

  it('pings realtime with no payload on every write', async () => {
    const n = w.pings()
    await w.addWish('nate', 'nate', 'Sunglasses')
    expect(w.pings()).toBe(n + 1)
  })
})

describe('identity: figurines and vault codes', () => {
  it('a figurine can be claimed once, and a person holds one piece', async () => {
    const fresh = makeWorld()
    const a = await fresh.call(null, 'POST', '/api/session', { action: 'claim', tokenId: 'rudolph', personId: 'nate', code: '1234' })
    expect(a.status).toBe(200)
    expect(a.setCookie).toMatch(/^mn_session=nate\..*HttpOnly; SameSite=Lax.*Secure/)
    const b = await fresh.call(null, 'POST', '/api/session', { action: 'claim', tokenId: 'rudolph', personId: 'josh', code: '1234' })
    expect(b.status).toBe(409)
    expect(b.json.code).toBe('token_taken')
    // nobody can re-claim as Nate from another device to peek: his code is set
    const c = await fresh.call(null, 'POST', '/api/session', { action: 'claim', tokenId: 'frosty', personId: 'nate', code: '0000' })
    expect(c.status).toBe(409)
    expect(c.setCookie).toBeNull()
  })

  it('two people tapping the same piece at once: exactly one wins', async () => {
    const fresh = makeWorld()
    const results = await Promise.all(
      ['nate', 'josh', 'katie'].map((id) => fresh.call(null, 'POST', '/api/session', { action: 'claim', tokenId: 'grinch', personId: id, code: '1234' })),
    )
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect((await fresh.store.tokens()).find((t) => t.id === 'grinch')!.ownerId).not.toBeNull()
  })

  it('a new device needs the vault code, and five misses lock the vault', async () => {
    expect((await w.call(null, 'POST', '/api/session', { action: 'verify', personId: 'jen', code: CODES.jen })).setCookie).toMatch(/^mn_session=jen\./)
    for (let i = 0; i < 5; i++) {
      const r = await w.call(null, 'POST', '/api/session', { action: 'verify', personId: 'curtis', code: '0000' })
      expect(r.status).toBe(401)
      expect(r.setCookie).toBeNull()
    }
    // locked: even the right code is refused now
    const locked = await w.call(null, 'POST', '/api/session', { action: 'verify', personId: 'curtis', code: CODES.curtis })
    expect(locked.status).toBe(429)
    expect(locked.setCookie).toBeNull()
    w.store.now = () => Date.now() + 16 * 60_000
    expect((await w.call(null, 'POST', '/api/session', { action: 'verify', personId: 'curtis', code: CODES.curtis })).status).toBe(200)
  })

  it('grandkids have no code: only a managing parent picks their figurine', async () => {
    const free = TOKENS[12].id
    expect((await w.call('josh', 'POST', '/api/session', { action: 'claim', tokenId: free, personId: 'honey' })).status).toBe(403)
    expect((await w.call(null, 'POST', '/api/session', { action: 'claim', tokenId: free, personId: 'honey', code: '1234' })).status).toBe(403)
    const ok = await w.call('lydia', 'POST', '/api/session', { action: 'claim', tokenId: free, personId: 'honey' })
    expect(ok.status).toBe(200)
    expect(ok.setCookie).toBeNull() // Lydia stays Lydia
    expect((await w.call(null, 'POST', '/api/session', { action: 'verify', personId: 'honey', code: '1234' })).status).toBe(400)
  })

  it('switch person clears the cookie', async () => {
    expect((await w.call('nate', 'DELETE', '/api/session')).setCookie).toMatch(/Max-Age=0/)
  })

  it('refuses cross-site writes', async () => {
    const r = await w.call('nate', 'POST', '/api/wishes', { ownerId: 'nate', title: 'x', priority: 'must' }, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
  })
})

describe('POST /api/unfurl', () => {
  it('needs a session', async () => {
    expect((await w.call(null, 'POST', '/api/unfurl', { url: 'https://example.com' })).status).toBe(401)
    expect((await w.call('nate', 'POST', '/api/unfurl', { url: 'https://example.com' })).json.title).toBe('Stub')
  })
})
