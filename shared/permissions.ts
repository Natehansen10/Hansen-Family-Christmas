import type { Person } from './types.js'

/**
 * The spoiler shield. This file is the single source of truth and is imported
 * by both the server (which enforces it) and the client (which only uses it to
 * decide what to draw). tests/permissions.test.ts checks all 12 x 12 pairs.
 */
type P = Pick<Person, 'id' | 'role' | 'managers'>

export function canSeeStatus(viewer: P | null | undefined, owner: P): boolean {
  if (!viewer) return false
  if (viewer.id === owner.id || viewer.role === 'grandkid') return false
  if (owner.role === 'santa') return true // kids + the other parent coordinate on Jen/Curtis
  return viewer.role === 'santa' // only parents see kids' and grandkids' status
}

export const canClaim = canSeeStatus

export function canEdit(viewer: P | null | undefined, owner: P): boolean {
  if (!viewer) return false
  return viewer.id === owner.id || owner.managers.includes(viewer.id)
}
