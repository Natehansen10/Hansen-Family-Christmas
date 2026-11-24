import { clamp } from './util'

export interface Shot {
  /** focus point on the plate, 0..1 */
  fx: number
  fy: number
  /** zoom */
  s: number
  /** where on screen the focus point should sit, as a fraction of the viewport (default: center) */
  ax?: number
  ay?: number
}

export interface View {
  w: number
  h: number
  /** plate edge in px: the square art always covers the viewport */
  S: number
}

export const viewOf = (w: number, h: number): View => ({ w, h, S: Math.max(w, h) })

/**
 * The 2.5D "camera". A shot is a focus point on the square art plus a zoom;
 * this returns the plate transform, clamped so the art always fills the screen.
 * Milestone 2 replaces this with the real camera path, same shot timings.
 */
export function frame(v: View, shot: Shot, clampEdges = true) {
  const size = v.S * shot.s
  let x = (shot.ax ?? 0.5) * v.w - shot.fx * size
  let y = (shot.ay ?? 0.5) * v.h - shot.fy * size
  if (clampEdges) {
    x = clamp(x, v.w - size, 0)
    y = clamp(y, v.h - size, 0)
  }
  return { x, y, s: shot.s }
}

export const css = (t: { x: number; y: number; s: number }) => `translate3d(${t.x.toFixed(2)}px,${t.y.toFixed(2)}px,0) scale(${t.s.toFixed(4)})`

/** Zoom reads as constant speed when interpolated in log space. */
export const zoom = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t)

/** Hub establishing shot. The Arrival's last frame lands exactly here. */
export const HUB_SHOT: Shot = { fx: 0.5, fy: 0.45, s: 1 }

export const plateSrc = (name: 'exterior' | 'doors' | 'interior') => {
  const small = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) <= 700
  return `/img/${name}${small ? '-640' : ''}.webp`
}
