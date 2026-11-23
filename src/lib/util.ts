import type { ClaimStatus, Priority } from '../../shared/types'

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const haptic = (pattern: number | number[] = 10) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported, not a problem */
  }
}

export const money = (cents: number | null | undefined) =>
  cents == null ? '' : '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

export const parsePrice = (text: string): number | null => {
  const n = Number(text.replace(/[^0-9.]/g, ''))
  return text.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export const PRIORITY: Record<Priority, { label: string; ribbon: string }> = {
  must: { label: 'Must have', ribbon: '#bc9c5c' },
  love: { label: 'Would love', ribbon: '#9b2a33' },
  stocking: { label: 'Stocking stuffer', ribbon: '#efe6d2' },
}

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  claimed: 'Claimed',
  bought: 'Bought',
  wrapped: 'Wrapped',
  under_tree: 'Under the tree',
}

const PAPERS = ['#0d4724', '#5a0d12', '#13261c', '#efe6d2', '#0a3a1d', '#3d0a0e']
/** Wrapping paper is picked from the wish id, so a gift looks the same on every device. */
export function wrapping(id: string, priority: Priority) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const paper = PAPERS[h % PAPERS.length]
  const ribbon = paper === '#efe6d2' && priority === 'stocking' ? '#bc9c5c' : PRIORITY[priority].ribbon
  return { paper, ribbon }
}

export const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* private mode */
    }
  },
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** 0 before `a`, 1 after `b`, eased in between. This is what makes the camera dwell on key frames. */
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
