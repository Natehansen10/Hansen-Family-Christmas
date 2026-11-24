import { reducedMotion } from './util'

type Confetti = typeof import('canvas-confetti')
let lib: Promise<Confetti> | null = null
const load = () => (lib ??= import('canvas-confetti').then((m) => m.default ?? m))

const CANE = 'M9 40 L9 13 C9 5 15 0 22 0 C29 0 35 5 35 13 L35 17 L28 17 L28 13 C28 9 25.5 7 22 7 C18.5 7 16 9 16 13 L16 40 Z'
const star = (points: number, R: number, r: number) => {
  let d = ''
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2
    const rad = i % 2 ? r : R
    d += `${i ? 'L' : 'M'}${(20 + Math.cos(a) * rad).toFixed(2)} ${(20 + Math.sin(a) * rad).toFixed(2)} `
  }
  return d + 'Z'
}

/** Candy canes and snowflakes, fired from a point on screen. Silent under reduced motion. */
export async function burst(x: number, y: number, kind: 'cane' | 'flake' = 'cane') {
  if (reducedMotion()) return
  const confetti = await load()
  const origin = { x: x / innerWidth, y: y / innerHeight }
  const cane = confetti.shapeFromPath({ path: CANE })
  const flake = confetti.shapeFromPath({ path: star(6, 14, 2.6) })
  const sparkle = confetti.shapeFromPath({ path: star(4, 14, 3.2) })
  if (kind === 'cane') {
    confetti({ particleCount: 46, spread: 78, startVelocity: 38, gravity: 0.85, ticks: 260, scalar: 2.3, shapes: [cane], colors: ['#bc9c5c', '#ead39a', '#9b2a33', '#f3ede1'], origin, disableForReducedMotion: true, zIndex: 200 })
  }
  confetti({ particleCount: kind === 'cane' ? 22 : 34, spread: 100, startVelocity: kind === 'cane' ? 26 : 30, gravity: 0.5, drift: 0.2, ticks: 300, scalar: 1.6, shapes: [flake, sparkle], colors: ['#f6efe0', '#ead39a', '#bc9c5c'], origin, disableForReducedMotion: true, zIndex: 200 })
}

export function burstFrom(el: Element | null, kind: 'cane' | 'flake' = 'cane') {
  if (!el) return
  const r = el.getBoundingClientRect()
  void burst(r.left + r.width / 2, r.top + r.height / 2, kind)
}
