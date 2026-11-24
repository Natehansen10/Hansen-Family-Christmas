import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Claim, ClaimStatus, Token, WishInput } from '../shared/types.js'
import { tokenMeta, type ClaimTokenResult, type PersonRow, type Store, type WishRow } from './store.js'

const WISH_COLS = 'id, owner_id, added_by, url, title, image_url, store, price_cents, priority, notes, created_at, deleted_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const toWish = (r: Row): WishRow => ({
  id: r.id,
  ownerId: r.owner_id,
  addedBy: r.added_by,
  url: r.url,
  title: r.title,
  imageUrl: r.image_url,
  store: r.store,
  priceCents: r.price_cents,
  priority: r.priority,
  notes: r.notes,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
})

const toRow = (p: Partial<Omit<WishInput, 'ownerId'>>): Row => {
  const out: Row = {}
  if ('url' in p) out.url = p.url ?? null
  if ('title' in p) out.title = p.title
  if ('imageUrl' in p) out.image_url = p.imageUrl ?? null
  if ('store' in p) out.store = p.store ?? null
  if ('priceCents' in p) out.price_cents = p.priceCents ?? null
  if ('priority' in p) out.priority = p.priority
  if ('notes' in p) out.notes = p.notes ?? null
  return out
}

function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`supabase: ${res.error.message}`)
  return res.data
}

/** Service-role access. Never construct this in the browser. */
export class SupabaseStore implements Store {
  private db: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  async people(): Promise<PersonRow[]> {
    const [people, managers] = await Promise.all([
      this.db.from('people').select('id, name, role, vault_hash, sort').order('sort'),
      this.db.from('managers').select('person_id, manager_id'),
    ])
    const m = ok(managers) as Row[]
    return (ok(people) as Row[]).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      vaultHash: p.vault_hash,
      managers: m.filter((x) => x.person_id === p.id).map((x) => x.manager_id),
    }))
  }

  async tokens(): Promise<Token[]> {
    const rows = ok(await this.db.from('tokens').select('id, name, owner_id, sort').order('sort')) as Row[]
    return rows.map((t) => ({ id: t.id, name: t.name, ownerId: t.owner_id, ...tokenMeta(t.id) }))
  }

  async wishes(): Promise<WishRow[]> {
    const rows = ok(await this.db.from('wishes').select(WISH_COLS).order('created_at')) as Row[]
    return rows.map(toWish)
  }

  async wish(id: string): Promise<WishRow | null> {
    const row = ok(await this.db.from('wishes').select(WISH_COLS).eq('id', id).maybeSingle()) as Row | null
    return row ? toWish(row) : null
  }

  async claims(): Promise<Map<string, Claim>> {
    const rows = ok(await this.db.from('claims').select('wish_id, claimer_id, status')) as Row[]
    return new Map(rows.map((c) => [c.wish_id, { claimerId: c.claimer_id, status: c.status }]))
  }

  async claim(wishId: string): Promise<Claim | null> {
    const c = ok(await this.db.from('claims').select('claimer_id, status').eq('wish_id', wishId).maybeSingle()) as Row | null
    return c ? { claimerId: c.claimer_id, status: c.status } : null
  }

  async claimToken(tokenId: string, personId: string, vaultHash: string | null): Promise<ClaimTokenResult> {
    return ok(await this.db.rpc('claim_token', { p_token: tokenId, p_person: personId, p_hash: vaultHash })) as ClaimTokenResult
  }

  async setVaultHashIfEmpty(personId: string, vaultHash: string): Promise<boolean> {
    const rows = ok(
      await this.db.from('people').update({ vault_hash: vaultHash }).eq('id', personId).is('vault_hash', null).select('id'),
    ) as Row[]
    return rows.length > 0
  }

  async beginVaultAttempt(personId: string): Promise<boolean> {
    return ok(await this.db.rpc('begin_vault_attempt', { p_person: personId })) as boolean
  }

  async clearVaultAttempts(personId: string): Promise<void> {
    ok(await this.db.from('people').update({ failed_attempts: 0, locked_until: null }).eq('id', personId))
  }

  async createWish(input: WishInput, addedBy: string): Promise<WishRow> {
    const row = ok(
      await this.db
        .from('wishes')
        .insert({ owner_id: input.ownerId, added_by: addedBy, ...toRow(input) })
        .select(WISH_COLS)
        .single(),
    ) as Row
    return toWish(row)
  }

  async updateWish(id: string, patch: Partial<Omit<WishInput, 'ownerId'>>): Promise<WishRow | null> {
    const row = ok(
      await this.db
        .from('wishes')
        .update({ ...toRow(patch), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(WISH_COLS)
        .maybeSingle(),
    ) as Row | null
    return row ? toWish(row) : null
  }

  async deleteWish(id: string): Promise<void> {
    ok(await this.db.from('wishes').update({ deleted_at: new Date().toISOString() }).eq('id', id))
  }

  async insertClaim(wishId: string, claimerId: string, status: ClaimStatus): Promise<boolean> {
    const res = await this.db.from('claims').insert({ wish_id: wishId, claimer_id: claimerId, status })
    if (res.error?.code === '23505') return false // primary key: someone else claimed first
    ok(res)
    return true
  }

  async updateClaim(wishId: string, status: ClaimStatus): Promise<void> {
    ok(await this.db.from('claims').update({ status, updated_at: new Date().toISOString() }).eq('wish_id', wishId))
  }

  async deleteClaim(wishId: string): Promise<void> {
    ok(await this.db.from('claims').delete().eq('wish_id', wishId))
  }
}
