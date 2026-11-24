/**
 * The brass plaque engraves itself: MAISON NOËL letter by letter with a gold
 * shimmer sweep, then the translation, then "The House of Christmas".
 * Drawn to a canvas so Milestone 2 can use the same function as a
 * CanvasTexture on the `Plaque` mesh.
 */
const SERIF = '"Bodoni Moda Variable", Didot, Georgia, serif'
const ITAL = '"Crimson Pro Variable", Georgia, serif'
const SANS = '"Manrope Variable", system-ui, sans-serif'

export const PLAQUE_FONTS = [`700 40px ${SERIF}`, `italic 500 20px ${ITAL}`, `700 14px ${SANS}`]

function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number, reveal: number, ink: (alpha: number, draw: (dx: number, dy: number) => void) => void) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let x = cx - total / 2
  chars.forEach((c, i) => {
    // each letter is cut in over a short window, in order
    const a = Math.min(1, Math.max(0, reveal * (chars.length + 1.5) - i) / 1.5)
    if (a > 0 && c !== ' ') ink(a, (dx, dy) => ctx.fillText(c, x + dx, y + dy))
    x += widths[i] + tracking
  })
}

export function drawPlaque(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h)
  if (t <= 0) return
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const px = Math.max(1, h / 90)

  // chiselled: a light lip below-right, a dark lip above-left, then the cut itself
  const ink = (alpha: number, draw: (dx: number, dy: number) => void) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(255, 238, 190, 0.6)'
    draw(px, px)
    ctx.fillStyle = 'rgba(30, 16, 2, 0.75)'
    draw(-px * 0.6, -px * 0.6)
    ctx.fillStyle = '#2a1803'
    draw(0, 0)
    ctx.globalAlpha = 1
  }
  const phase = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))

  ctx.font = `700 ${h * 0.36}px ${SERIF}`
  spaced(ctx, 'MAISON NOËL', w / 2, h * 0.4, h * 0.06, phase(0, 0.52), ink)

  ctx.font = `italic 500 ${h * 0.215}px ${ITAL}`
  spaced(ctx, 'maison · house     Noël · Christmas', w / 2, h * 0.66, 0, phase(0.52, 0.8), ink)

  ctx.font = `700 ${h * 0.15}px ${SANS}`
  spaced(ctx, 'THE HOUSE OF CHRISTMAS', w / 2, h * 0.91, h * 0.045, phase(0.8, 1), ink)

  // gold shimmer that follows the engraving across, lighting only the letters
  if (t < 1) {
    const x = (phase(0, 0.52) < 1 ? phase(0, 0.52) : phase(0.52, 1)) * w * 1.3 - w * 0.15
    const g = ctx.createLinearGradient(x - w * 0.12, 0, x + w * 0.12, 0)
    g.addColorStop(0, 'rgba(255, 246, 214, 0)')
    g.addColorStop(0.5, 'rgba(255, 246, 214, 0.95)')
    g.addColorStop(1, 'rgba(255, 246, 214, 0)')
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
}
