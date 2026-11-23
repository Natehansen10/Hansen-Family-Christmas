import { create } from 'zustand'
import { canClaim, canEdit, canSeeStatus } from '../../shared/permissions'
import type { Board, BoardWish, Claim, PublicPerson, Token } from '../../shared/types'
import { api, ApiError } from './api'
import { store as local } from './util'

export type StationId = 'case' | 'desk' | 'gallery' | 'office'
export type Phase = 'arrival' | 'hub'

interface Toast {
  id: number
  text: string
  ok?: boolean
}

interface State {
  board: Board | null
  loadError: string | null
  phase: Phase
  quick: boolean
  station: StationId | null
  /** who the Wish Desk is adding for */
  deskOwner: string | null
  /** wish being edited at the Wish Desk */
  editing: BoardWish | null
  toast: Toast | null
  /** token that just got engraved, for the ceremony */
  celebrate: string | null

  refresh: () => Promise<void>
  setBoard: (fn: (b: Board) => Board) => void
  open: (station: StationId | null) => void
  openDesk: (ownerId: string, editing?: BoardWish | null) => void
  enterHub: () => void
  replay: () => void
  setQuick: (quick: boolean) => void
  say: (text: string, ok?: boolean) => void
  fail: (e: unknown) => void
}

let toastSeq = 0
let toastTimer = 0
let inflight: Promise<void> | null = null

export const useApp = create<State>((set, get) => ({
  board: null,
  loadError: null,
  // returning visitors skip the entrance; `?hub` does the same for a direct link
  phase: local.get('mn_entered') === '1' || new URLSearchParams(location.search).has('hub') ? 'hub' : 'arrival',
  quick: local.get('mn_quick') === '1',
  station: null,
  deskOwner: null,
  editing: null,
  toast: null,
  celebrate: null,

  refresh: () =>
    (inflight ??= api
      .board()
      .then((board) => set({ board, loadError: null }))
      .catch((e: unknown) => {
        if (!get().board) set({ loadError: e instanceof ApiError ? e.message : 'Could not reach the workshop.' })
      })
      .finally(() => {
        inflight = null
      })),
  setBoard: (fn) => set((s) => (s.board ? { board: fn(s.board) } : s)),
  open: (station) => set({ station, ...(station === 'desk' ? {} : { editing: null }) }),
  openDesk: (ownerId, editing = null) => set({ station: 'desk', deskOwner: ownerId, editing }),
  enterHub: () => {
    local.set('mn_entered', '1')
    set({ phase: 'hub' })
  },
  replay: () => {
    window.scrollTo(0, 0)
    set({ phase: 'arrival', station: null, quick: false })
    local.set('mn_quick', null)
  },
  setQuick: (quick) => {
    local.set('mn_quick', quick ? '1' : null)
    if (quick) local.set('mn_entered', '1')
    set({ quick, station: null, ...(quick ? { phase: 'hub' as Phase } : {}) })
  },
  say: (text, ok) => {
    window.clearTimeout(toastTimer)
    set({ toast: { id: ++toastSeq, text, ok } })
    toastTimer = window.setTimeout(() => set({ toast: null }), 2800)
  },
  fail: (e) => get().say(e instanceof Error ? e.message : 'Something went wrong.'),
}))

/* ---------- selectors ---------- */

const EMPTY_PEOPLE: PublicPerson[] = []
export const usePeople = () => useApp((s) => s.board?.people ?? EMPTY_PEOPLE)
export const useViewer = (): PublicPerson | null =>
  useApp((s) => (s.board?.viewerId ? (s.board.people.find((p) => p.id === s.board!.viewerId) ?? null) : null))

export function lookups(board: Board | null) {
  const people = new Map<string, PublicPerson>((board?.people ?? []).map((p) => [p.id, p]))
  const tokenOf = new Map<string, Token>()
  for (const t of board?.tokens ?? []) if (t.ownerId) tokenOf.set(t.ownerId, t)
  const viewer = board?.viewerId ? (people.get(board.viewerId) ?? null) : null
  return {
    people,
    tokenOf,
    viewer,
    name: (id: string) => people.get(id)?.name ?? 'Someone',
    /** UI hints only. The server is what actually enforces these. */
    sees: (ownerId: string) => !!people.get(ownerId) && canSeeStatus(viewer, people.get(ownerId)!),
    claims: (ownerId: string) => !!people.get(ownerId) && canClaim(viewer, people.get(ownerId)!),
    edits: (ownerId: string) => !!people.get(ownerId) && canEdit(viewer, people.get(ownerId)!),
  }
}

/** Optimistic claim change: draw it now, confirm with the server, re-sync either way. */
export async function changeClaim(wish: BoardWish, action: 'claim' | 'release' | 'status', next: Claim | null) {
  const { setBoard, refresh, fail } = useApp.getState()
  const patch = (claim: Claim | null | undefined) =>
    setBoard((b) => ({ ...b, wishes: b.wishes.map((w) => (w.id === wish.id && 'claim' in w ? { ...w, claim } : w)) }))
  const before = wish.claim
  patch(next)
  try {
    await api.claim(wish.id, action, next?.status)
    void refresh()
    return true
  } catch (e) {
    patch(before)
    fail(e)
    void refresh()
    return false
  }
}
