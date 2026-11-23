import { canSeeStatus } from '../shared/permissions.js'
import type { Board, BoardWish, Claim, LedgerRow, PublicPerson, Token } from '../shared/types.js'
import type { PersonRow, WishRow } from './store.js'

/**
 * THE SPOILER SHIELD LIVES HERE.
 * Every byte of claim data that leaves the server goes through one of these
 * two functions. Nothing else serializes a claim.
 */

const publicPerson = (p: PersonRow): PublicPerson => ({
  id: p.id,
  name: p.name,
  role: p.role,
  managers: p.managers,
  hasCode: p.vaultHash !== null,
})

const publicWish = ({ deletedAt: _d, ...w }: WishRow) => w

export function boardFor(
  viewer: PersonRow | null,
  people: PersonRow[],
  tokens: Token[],
  wishes: WishRow[],
  claims: Map<string, Claim>,
  realtime: Board['realtime'],
): Board {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out: BoardWish[] = []

  // No session, no wishes. The Token Case still needs people and tokens.
  if (viewer) {
    for (const w of wishes) {
      const owner = byId.get(w.ownerId)
      if (!owner) continue
      const visible = canSeeStatus(viewer, owner)
      const claim = claims.get(w.id) ?? null

      if (w.deletedAt) {
        // A removed wish survives only for people already tracking a claim on it.
        if (visible && claim) out.push({ ...publicWish(w), claim, removed: true })
        continue
      }
      // Hidden means the key is absent. Not null, not a placeholder.
      out.push(visible ? { ...publicWish(w), claim } : publicWish(w))
    }
  }

  return {
    viewerId: viewer?.id ?? null,
    people: people.map(publicPerson),
    tokens,
    wishes: out,
    realtime,
  }
}

/** Santas only (the caller checks the role). Every wish except the viewer's own. */
export function ledgerFor(viewer: PersonRow, people: PersonRow[], wishes: WishRow[], claims: Map<string, Claim>): LedgerRow[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows: LedgerRow[] = []
  for (const w of wishes) {
    const owner = byId.get(w.ownerId)
    if (!owner || !canSeeStatus(viewer, owner)) continue
    const claim = claims.get(w.id) ?? null
    if (w.deletedAt && !claim) continue
    rows.push({ ...publicWish(w), claim, removed: w.deletedAt !== null })
  }
  return rows
}
