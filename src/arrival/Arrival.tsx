import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { BLUR } from '../lib/blur'
import { css, frame, HUB_SHOT, plateSrc, viewOf, zoom, type View } from '../lib/camera'
import { useApp } from '../lib/state'
import { clamp, lerp, reducedMotion, smooth } from '../lib/util'
import { drawPlaque, PLAQUE_FONTS } from './plaque'
import { Snow } from './snow'

/**
 * Act I: The Arrival. Milestone 1 is the 2.5D version built from the concept
 * art, with the same frame timings as design/PROMPT.md section 6:
 *   0.00-0.10 Estate   0.10-0.38 Approach   0.38-0.55 Doors (plaque engraves)
 *   0.55-0.80 Opening  0.80-1.00 Workshop
 * One normalized progress value lives in a zustand store and is read
 * non-reactively in the frame loop, so scrolling never re-renders React.
 */
export const useArrival = create(() => ({ progress: 0 }))

const WELCOME = ['Welcome', 'in,', 'Hansens.']
// lantern posts on the exterior plate; each brightens as the camera passes it
const LANTERNS = [
  { x: 11.5, y: 76.5, from: 0.06, to: 0.18 },
  { x: 88.7, y: 76.5, from: 0.06, to: 0.18 },
  { x: 28.1, y: 76.2, from: 0.12, to: 0.24 },
  { x: 72.3, y: 76.2, from: 0.12, to: 0.24 },
]
// plaque as a fraction of the doors plate
const PLAQUE = { fx: 0.5, fy: 0.089, width: 0.24 }

export default function Arrival() {
  const enterHub = useApp((s) => s.enterHub)
  const reduce = reducedMotion()
  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const el = useRef<Record<string, HTMLElement | null>>({})
  const put = (name: string) => (node: HTMLElement | null) => void (el.current[name] = node)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    window.scrollTo(0, 0)
    useArrival.setState({ progress: 0 })

    const e = el.current
    const $ = (name: string) => e[name] as HTMLElement
    const canvas = $('plaque') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const snow = reduce ? null : new Snow($('snow') as HTMLCanvasElement)
    const lanterns = [...stage.current!.querySelectorAll<HTMLElement>('.lantern-glow')]
    const words = [...stage.current!.querySelectorAll<HTMLElement>('[data-word]')]
    let view: View = viewOf(1, 1)
    let drawn = -1
    let engraved = -1
    let done = false

    const size = () => {
      view = viewOf(stage.current!.clientWidth, stage.current!.clientHeight)
      for (const name of ['ext', 'fg', 'doors', 'interior']) {
        $(name).style.width = $(name).style.height = `${view.S}px`
      }
      snow?.resize()
      drawn = -1
    }

    const engrave = (t: number) => {
      const q = Math.round(t * 240) / 240
      if (q === engraved) return
      engraved = q
      drawPlaque(ctx, canvas.width, canvas.height, q)
    }

    /** Everything on screen is a pure function of scroll progress. */
    const apply = (p: number) => {
      // Frames 1 and 2: the estate, then the approach, curving right past the tree
      const approach = smooth(0.1, 0.38, p)
      const drift = smooth(0, 0.1, p)
      const ext = {
        fx: 0.5 + 0.065 * Math.sin(Math.PI * approach),
        fy: lerp(lerp(0.5, 0.56, drift), 0.695, approach),
        s: zoom(lerp(1, 1.08, drift), 5.2, approach),
      }
      const extOpacity = 1 - smooth(0.345, 0.395, p)
      $('ext').style.opacity = String(extOpacity)
      $('ext').style.visibility = extOpacity <= 0 ? 'hidden' : 'visible'
      if (extOpacity > 0) {
        $('ext').style.transform = css(frame(view, ext))
        // foreground pines move faster than the house, and slide out of frame
        $('fg').style.transform = css(frame(view, { ...ext, s: Math.pow(ext.s, 1.3) * (1 + 0.04 * drift) }, false))
        $('fg').style.opacity = String((1 - smooth(0.2, 0.32, p)) * extOpacity)
        lanterns.forEach((n, i) => (n.style.opacity = String(smooth(LANTERNS[i].from, LANTERNS[i].to, p))))
      }

      // Frame 3: the doors. Tilt up to the plaque, hold still while it engraves, tilt back down.
      const up = smooth(0.385, 0.425, p) - smooth(0.515, 0.56, p)
      const push = smooth(0.6, 0.8, p)
      const plaqueZoom = Math.min(0.92 * view.w, 680) / (PLAQUE.width * view.S)
      const doors = {
        fx: 0.5,
        fy: lerp(lerp(0.525, PLAQUE.fy, up), 0.56, push),
        s: zoom(1, Math.max(1, plaqueZoom), up) * zoom(1, 3, push),
        ay: lerp(0.5, 0.4, up),
      }
      const doorsOpacity = 1 - smooth(0.72, 0.8, p)
      const doorsOn = p > 0.33 && doorsOpacity > 0
      $('doors').style.visibility = doorsOn ? 'visible' : 'hidden'
      if (doorsOn) {
        $('doors').style.opacity = String(doorsOpacity)
        $('doors').style.transform = css(frame(view, doors))
        engrave(clamp((p - 0.425) / (0.515 - 0.425), 0, 1))
        $('seam').style.opacity = String(1 - smooth(0.56, 0.62, p))

        // Frame 4: scroll opens the doors, inward on their hinges
        const angle = smooth(0.56, 0.76, p) * 100
        $('leafL').style.transform = `rotateY(${angle.toFixed(2)}deg)`
        $('leafR').style.transform = `rotateY(${(-angle).toFixed(2)}deg)`
        $('leafL').style.setProperty('--shade', (angle / 170).toFixed(3))
        $('leafR').style.setProperty('--shade', (angle / 170).toFixed(3))
      }
      // golden light floods out, then settles once we are inside
      $('flood').style.opacity = String(smooth(0.57, 0.74, p) * (1 - smooth(0.8, 0.9, p)))

      // Frame 5: inside, easing from slightly zoomed in back to the establishing shot
      const settle = smooth(0.74, 0.985, p)
      $('interior').style.visibility = p > 0.5 ? 'visible' : 'hidden'
      $('interior').style.transform = css(frame(view, { ...HUB_SHOT, s: lerp(1.32, 1, settle) }))
      // the room settles into the calmer hub lighting as the camera pulls back
      $('calm').style.opacity = String(smooth(0.86, 0.985, p))

      const reveal = clamp((p - 0.835) / 0.07, 0, 1)
      words.forEach((w, i) => {
        const t = smooth(i / (words.length + 1), (i + 2) / (words.length + 1), reveal)
        w.style.transform = `translate3d(0,${((1 - t) * 115).toFixed(1)}%,0)`
      })
      $('welcome').style.opacity = String(p < 0.82 ? 0 : 1 - smooth(0.95, 0.985, p))

      $('cue').style.opacity = String(1 - smooth(0, 0.02, p))
      $('hint').style.opacity = String(smooth(0.5, 0.53, p) * (1 - smooth(0.56, 0.6, p)))

      if (snow) {
        snow.closeness = approach * 1.6
        snow.gust = smooth(0.56, 0.66, p) * (1 - smooth(0.7, 0.8, p))
        snow.alpha = 1 - smooth(0.7, 0.8, p)
      }
    }

    /** prefers-reduced-motion: three cross-faded stills, no camera flight. */
    const applyStill = (p: number) => {
      $('ext').style.transform = css(frame(view, { fx: 0.5, fy: 0.5, s: 1 }))
      $('ext').style.opacity = String(1 - smooth(0.28, 0.38, p))
      $('fg').style.display = 'none'
      $('doors').style.visibility = 'visible'
      $('doors').style.transform = css(frame(view, { fx: 0.5, fy: 0.3, s: Math.max(1, Math.min(0.8 * view.w, 520) / (PLAQUE.width * view.S)), ay: 0.5 }))
      $('doors').style.opacity = String(1 - smooth(0.62, 0.72, p))
      engrave(1)
      $('interior').style.visibility = 'visible'
      $('interior').style.transform = css(frame(view, HUB_SHOT))
      $('calm').style.opacity = String(smooth(0.8, 0.98, p))
      words.forEach((w) => (w.style.transform = 'none'))
      $('welcome').style.opacity = String(smooth(0.74, 0.8, p))
      $('cue').style.opacity = String(1 - smooth(0, 0.05, p))
      $('hint').style.opacity = '0'
      $('flood').style.opacity = '0'
    }

    const finish = () => {
      if (done) return
      done = true
      enterHub()
    }

    size()
    const lenis = reduce ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 })
    const onTick = (t: number) => lenis?.raf(t * 1000)
    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update)
      gsap.ticker.add(onTick)
      gsap.ticker.lagSmoothing(0)
    }
    const proxy = { p: 0 }
    const trigger = ScrollTrigger.create({
      trigger: wrap.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reduce ? true : 1.1,
      // scrub smooths a proxy tween; its eased value is the camera's progress
      animation: gsap.fromTo(proxy, { p: 0 }, { p: 1, ease: 'none', onUpdate: () => useArrival.setState({ progress: proxy.p }) }),
    })

    let raf = 0
    const loop = () => {
      const p = useArrival.getState().progress
      if (p !== drawn) {
        drawn = p
        ;(reduce ? applyStill : apply)(p)
        if (p >= 0.997) finish()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    snow?.start()

    const onResize = () => {
      size()
      ScrollTrigger.refresh()
    }
    window.addEventListener('resize', onResize)
    // the canvas can only use fonts that have finished loading
    void Promise.all(PLAQUE_FONTS.map((f) => document.fonts.load(f, 'MAISON NOËL'))).then(() => {
      engraved = -1
      drawn = -1
    })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      snow?.stop()
      trigger.animation?.kill()
      trigger.kill()
      gsap.ticker.remove(onTick)
      lenis?.destroy()
      window.scrollTo(0, 0)
    }
  }, [enterHub, reduce])

  const img = (name: 'exterior' | 'doors' | 'interior', priority = false) => (
    <img src={plateSrc(name)} alt="" decoding="async" fetchPriority={priority ? 'high' : 'low'} draggable={false} />
  )

  return (
    <div ref={wrap} style={{ height: reduce ? '300vh' : '700vh' }} aria-label="The arrival at Maison Noël">
      <a
        href="#workshop"
        onClick={(e) => {
          e.preventDefault()
          enterHub()
        }}
        className="btn primary sm fixed top-3 left-3 z-[100] -translate-y-24 focus:translate-y-0"
      >
        Skip the entrance
      </a>
      <div ref={stage} className="stage sticky top-0">
        <div ref={put('interior')} className="plate" style={{ backgroundImage: `url(${BLUR.interior})`, visibility: 'hidden' }}>
          {img('interior')}
          <div ref={put('calm')} className="calm" style={{ opacity: 0 }} />
        </div>

        <div ref={put('doors')} className="plate" style={{ backgroundImage: `url(${BLUR.doors})`, visibility: 'hidden' }}>
          {img('doors')}
          <canvas ref={put('plaque')} className="plaque" width={1152} height={254} aria-hidden />
          <div className="doorway" aria-hidden>
            <img className="beyond" src={plateSrc('interior')} alt="" draggable={false} />
            <div ref={put('leafL')} className="leaf leaf-l" style={{ '--doors': `url(${plateSrc('doors')})` } as React.CSSProperties} />
            <div ref={put('leafR')} className="leaf leaf-r" style={{ '--doors': `url(${plateSrc('doors')})` } as React.CSSProperties} />
          </div>
          <div ref={put('seam')} className="seam" aria-hidden />
        </div>

        <div ref={put('ext')} className="plate" style={{ backgroundImage: `url(${BLUR.exterior})` }}>
          {img('exterior', true)}
          {LANTERNS.map((l, i) => (
            <span key={i} className="lantern-glow" style={{ left: `${l.x}%`, top: `${l.y}%` }} />
          ))}
        </div>
        <div ref={put('fg')} className="plate plate-fg" aria-hidden>
          {img('exterior')}
        </div>

        <canvas ref={put('snow')} className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden />
        <div ref={put('flood')} className="flood z-[6]" aria-hidden />

        <p className="sr-only">
          Maison Noël. Maison is French for house, Noël is French for Christmas. Together: the House of Christmas. Keep scrolling to open the doors.
        </p>
        <div ref={put('welcome')} className="pointer-events-none absolute inset-0 z-[7] grid place-items-center px-6 text-center opacity-0">
          <p className="display text-[clamp(44px,9vw,120px)] [text-shadow:0_2px_40px_rgba(0,0,0,0.75)]">
            {WELCOME.map((w, i) => (
              <span key={w} className="mask">
                <span className="in" data-word>
                  {i === 2 ? <em>{w}</em> : w}
                </span>
                {i < 2 ? ' ' : ''}
              </span>
            ))}
          </p>
        </div>
        <div ref={put('cue')} className="scrollcue">
          Scroll to enter<i />
        </div>
        <div ref={put('hint')} className="scrollcue opacity-0">
          Keep scrolling
        </div>
        {reduce && (
          <button className="btn gold sm absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[8]" onClick={enterHub}>
            Enter the workshop
          </button>
        )}
      </div>
    </div>
  )
}
