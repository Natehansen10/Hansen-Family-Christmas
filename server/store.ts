import { PEOPLE, TOKENS, TOKEN_META } from '../shared/family.js'
import type { Claim, ClaimStatus, Person, Token, Wish, WishInput } from '../shared/types.js'

export interface PersonRow extends Person {
  vaultHash: string | null
}

export interface WishRow extends Wish {
  deletedAt: string | null
}

export type ClaimTokenResult = 'ok' | 'token_taken' | 'person_has_token' | 'code_exists' | 'not_found'

export const MAX_VAULT_ATTEMPTS = 5
export const LOCK_MINUTES = 15

/**
 * Everything the API needs from the database. Two implementations:
 * SupabaseStore (production, service-role key) and MemoryStore (tests, local dev).
 */
export interface Store {
  people(): Promise<PersonRow[]>
  tokens(): Promise<Token[]>
  wishes(): Promise<WishRow[]>
  wish(id: string): Promise<WishRow | null>
  claims(): Promise<Map<string, Claim>>
  claim(wishId: string): Promise<Claim | null>

  /** Atomic: one winner per token, one token per person, and the vault code is set in the same step. */
  claimToken(tokenId: string, personId: string, vaultHash: string | null): Promise<ClaimTokenResult>
  /** Only sets a code where none exists (the admin-reset path). */
  setVaultHashIfEmpty(personId: string, vaultHash: string): Promise<boolean>
  /** Atomically spends one vault attempt. False means locked out. */
  beginVaultAttempt(personId: string): Promise<boolean>
  clearVaultAttempts(personId: string): Promise<void>

  createWish(input: WishInput, addedBy: string): Promise<WishRow>
  updateWish(id: string, patch: Partial<Omit<WishInput, 'ownerId'>>): Promise<WishRow | null>
  /** Soft delete, so a gift someone already bought does not vanish from the Ledger. */
  deleteWish(id: string): Promise<void>

  /** False when someone else got there first. */
  insertClaim(wishId: string, claimerId: string, status: ClaimStatus): Promise<boolean>
  updateClaim(wishId: string, status: ClaimStatus): Promise<void>
  deleteClaim(wishId: string): Promise<void>
}

export const tokenMeta = (id: string) => TOKEN_META[id] ?? { mono: '?', num: '' }

export class MemoryStore implements Store {
  private _people: (PersonRow & { failed: number; lockedUntil: number })[] = PEOPLE.map((p) => ({
    ...p,
    managers: [...p.managers],
    vaultHash: null,
    failed: 0,
    lockedUntil: 0,
  }))
  private _tokens: Token[] = TOKENS.map((t) => ({ ...t }))
  private _wishes: WishRow[] = []
  private _claims = new Map<string, Claim>()
  private seq = 0
  /** test hook */
  now = () => Date.now()

  async people() {
    return this._people.map(({ failed: _f, lockedUntil: _l, ...p }) => ({ ...p }))
  }
  async tokens() {
    return this._tokens.map((t) => ({ ...t }))
  }
  async wishes() {
    return this._wishes.map((w) => ({ ...w }))
  }
  async wish(id: string) {
    const w = this._wishes.find((x) => x.id === id)
    return w ? { ...w } : null
  }
  async claims() {
    return new Map([...this._claims].map(([k, v]) => [k, { ...v }]))
  }
  async claim(wishId: string) {
    const c = this._claims.get(wishId)
    return c ? { ...c } : null
  }

  async claimToken(tokenId: string, personId: string, vaultHash: string | null): Promise<ClaimTokenResult> {
    const token = this._tokens.find((t) => t.id === tokenId)
    const person = this._people.find((p) => p.id === personId)
    if (!token || !person) return 'not_found'
    if (token.ownerId) return 'token_taken'
    if (this._tokens.some((t) => t.ownerId === personId)) return 'person_has_token'
    if (vaultHash) {
      if (person.vaultHash) return 'code_exists'
      person.vaultHash = vaultHash
    }
    token.ownerId = personId
    return 'ok'
  }
  async setVaultHashIfEmpty(personId: string, vaultHash: string) {
    const p = this._people.find((x) => x.id === personId)
    if (!p || p.vaultHash) return false
    p.vaultHash = vaultHash
    return true
  }
  async beginVaultAttempt(personId: string) {
    const p = this._people.find((x) => x.id === personId)
    if (!p || p.lockedUntil > this.now()) return false
    p.lockedUntil = 0
    p.failed += 1
    if (p.failed >= MAX_VAULT_ATTEMPTS) {
      p.failed = 0
      p.lockedUntil = this.now() + LOCK_MINUTES * 60_000
    }
    return true
  }
  async clearVaultAttempts(personId: string) {
    const p = this._people.find((x) => x.id === personId)
    if (p) {
      p.failed = 0
      p.lockedUntil = 0
    }
  }

  async createWish(input: WishInput, addedBy: string) {
    const w: WishRow = {
      id: `w${++this.seq}-${Math.random().toString(36).slice(2, 8)}`,
      ownerId: input.ownerId,
      addedBy,
      url: input.url ?? null,
      title: input.title,
      imageUrl: input.imageUrl ?? null,
      store: input.store ?? null,
      priceCents: input.priceCents ?? null,
      priority: input.priority,
      notes: input.notes ?? null,
      createdAt: new Date(this.now() + this.seq).toISOString(),
      deletedAt: null,
    }
    this._wishes.push(w)
    return { ...w }
  }
  async updateWish(id: string, patch: Partial<Omit<WishInput, 'ownerId'>>) {
    const w = this._wishes.find((x) => x.id === id)
    if (!w) return null
    Object.assign(w, patch)
    return { ...w }
  }
  async deleteWish(id: string) {
    const w = this._wishes.find((x) => x.id === id)
    if (w) w.deletedAt = new Date(this.now()).toISOString()
  }

  async insertClaim(wishId: string, claimerId: string, status: ClaimStatus) {
    if (this._claims.has(wishId)) return false
    this._claims.set(wishId, { claimerId, status })
    return true
  }
  async updateClaim(wishId: string, status: ClaimStatus) {
    const c = this._claims.get(wishId)
    if (c) c.status = status
  }
  async deleteClaim(wishId: string) {
    this._claims.delete(wishId)
  }
}
