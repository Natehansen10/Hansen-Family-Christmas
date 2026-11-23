interface Flake {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  layer: number
}

// far, mid, near
const LAYERS = [
  { share: 0.5, r: [0.5, 1.1], speed: [0.2, 0.4], alpha: 0.45 },
  { share: 0.33, r: [1.1, 2], speed: [0.45, 0.8], alpha: 0.7 },
  { share: 0.17, r: [2, 3.2], speed: [0.9, 1.5], alpha: 0.6 },
]

/** Snow in three depth layers on one cheap 2D canvas. Stops itself when hidden. */
export class Snow {
  private ctx: CanvasRenderingContext2D
  private flakes: Flake[] = []
  private w = 0
  private h = 0
  private raf = 0
  private last = 0
  /** driven by scroll: the snow gets closer and larger on the approach, and gusts through the doors */
  closeness = 0
  gust = 0
  alpha = 1

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
  }

  resize() {
    const dpr = Math.min(1.5, devicePixelRatio || 1)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = this.w * dpr
    this.canvas.height = this.h * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = Math.round(Math.min(220, Math.max(70, this.w / 7)))
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    this.flakes = Array.from({ length: count }, (_, i) => {
      const f = i / count
      const layer = f < LAYERS[0].share ? 0 : f < LAYERS[0].share + LAYERS[1].share ? 1 : 2
      const L = LAYERS[layer]
      return { x: Math.random() * this.w, y: Math.random() * this.h, r: rnd(L.r[0], L.r[1]), speed: rnd(L.speed[0], L.speed[1]), phase: Math.random() * 6.28, layer }
    })
  }

  start() {
    if (this.raf) return
    this.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - this.last) / 16.67
      this.last = now
      this.draw(dt)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private draw(dt: number) {
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)
    if (this.alpha <= 0.01) return
    ctx.fillStyle = '#f6efe0'
    for (const f of this.flakes) {
      const depth = 1 + this.closeness * (0.15 + f.layer * 0.3)
      f.phase += 0.012 * dt
      f.y += f.speed * depth * (1 + this.gust * 3) * dt
      f.x += (Math.sin(f.phase) * 0.35 + this.gust * ((w / 2 - f.x) / w) * 6) * dt
      if (f.y > h + 6) {
        f.y = -6
        f.x = Math.random() * w
      }
      ctx.globalAlpha = LAYERS[f.layer].alpha * this.alpha
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r * depth, 0, 6.2832)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}
