import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { BLUR } from '../lib/blur'
import { frame, HUB_SHOT, plateSrc, viewOf, type Shot } from '../lib/camera'
import { useApp, useViewer, type StationId } from '../lib/state'
import { clamp, haptic } from '../lib/util'
import { Gallery } from '../panels/Gallery'
import { Office } from '../panels/Office'
import { TokenCase } from '../panels/TokenCase'
import { WishDesk } from '../panels/WishDesk'
import { Sheet } from '../ui/Sheet'

/**
 * Station anchors on the interior plate (fractions of the square art).
 * Milestone 2 reads the same four from the `Station_*` empties in interior.glb.
 */
export const STATIONS: { id: StationId; node: string; label: string; sub: string; x: number; y: number }[] = [
  { id: 'case', node: 'Station_TokenCase', label: 'Token Case', sub: 'Choose your piece', x: 0.127, y: 0.6 },
  { id: 'desk', node: 'Station_WishDesk', label: 'Wish Desk', sub: 'Add a wish', x: 0.872, y: 0.7 },
  { id: 'gallery', node: 'Station_Gallery', label: 'Gallery', sub: 'Every wish, wrapped', x: 0.845, y: 0.335 },
  { id: 'office', node: 'Station_Office', label: "Santa's Office", sub: 'The Ledger', x: 0.5, y: 0.19 },
]

const PANELS: Record<StationId, { label: string; body: () => React.ReactNode }> = {
  case: { label: 'Token Case', body: () => <TokenCase /> },
  desk: { label: 'Wish Desk', body: () => <WishDesk /> },
  gallery: { label: 'Gallery', body: () => <Gallery /> },
  office: { label: "Santa's Office", body: () => <Office /> },
}

const SETTLE = { type: 'spring', stiffness: 120, damping: 22 } as const

function useViewport() {
  const [v, setV] = useState(() => viewOf(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const on = () => setV(viewOf(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return v
}

/** Act II: the workshop, tap to travel. */
export function Hub({ hidden }: { hidden: boolean }) {
  const station = useApp((s) => s.station)
  const open = useApp((s) => s.open)
  const viewer = useViewer()
  const loaded = useApp((s) => !!s.board)
  const reduce = useReducedMotion()
  const view = useViewport()
  const [ready, setReady] = useState(false)
  const portrait = view.h > view.w

  const rest = frame(view, HUB_SHOT)
  const x = useMotionValue(rest.x)
  const y = useMotionValue(rest.y)
  const s = useMotionValue(1)

  // the camera: fly to the chosen station on a spring, settle back when the panel closes
  useLayoutEffect(() => {
    const at = STATIONS.find((st) => st.id === station)
    const shot: Shot = at ? { fx: at.x, fy: at.y, s: portrait ? 1.7 : 1.4, ay: portrait ? 0.24 : 0.32 } : HUB_SHOT
    const to = frame(view, shot)
    if (reduce || hidden) {
      x.set(to.x)
      y.set(to.y)
      s.set(to.s)
      return
    }
    const controls = [animate(x, to.x, SETTLE), animate(y, to.y, SETTLE), animate(s, to.s, SETTLE)]
    return () => controls.forEach((c) => c.stop())
  }, [station, view, portrait, reduce, hidden, x, y, s])

  const panel = station ? PANELS[station] : null

  return (
    <main id="workshop" className="fixed inset-0 overflow-hidden bg-[#050a07]" style={{ visibility: hidden ? 'hidden' : 'visible' }} inert={hidden}>
      <motion.div
        className="plate"
        style={{ x, y, scale: s, width: view.S, height: view.S, backgroundImage: `url(${BLUR.interior})` }}
        aria-hidden
      >
        <img
          src={plateSrc('interior')}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onLoad={() => setReady(true)}
          style={{ opacity: ready ? 1 : 0, transition: 'opacity .6s' }}
        />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_50%,rgba(0,0,0,0.5))]" />

      <nav aria-label="Workshop stations" className="absolute inset-0 transition-opacity duration-300" style={{ opacity: station ? 0 : 1, pointerEvents: station ? 'none' : 'auto' }}>
        {STATIONS.map((st) => {
          // a station that sits off-screen on a phone gets pinned to the nearest edge
          const px = clamp(rest.x + st.x * view.S, 34, view.w - 34)
          const py = clamp(rest.y + st.y * view.S, 96, view.h - 60)
          const locked = st.id === 'office' && viewer?.role !== 'santa'
          const guide = st.id === 'case' && loaded && !viewer
          return (
            <button
              key={st.id}
              type="button"
              data-node={st.node}
              className={`hotspot ${px > view.w * 0.55 ? 'flip' : ''} ${guide ? 'guide' : ''}`}
              style={{ left: px, top: py }}
              tabIndex={station ? -1 : 0}
              aria-label={`${st.label}. ${locked ? 'Locked. Jen and Curtis only.' : st.sub}`}
              onClick={() => {
                haptic(8)
                open(st.id)
              }}
            >
              <span className="ring" />
              <span className="label glass">
                {locked && (
                  <svg className="mr-1.5 -mt-0.5 inline" width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden>
                    <path d="M3 5.5V3.6a2.5 2.5 0 015 0v1.9" stroke="#ead39a" strokeWidth="1.3" />
                    <rect x="1" y="5.5" width="9" height="6.8" rx="1.6" fill="#ead39a" />
                  </svg>
                )}
                {st.label}
                <small>{guide ? 'Start here: choose your piece' : locked ? 'Jen and Curtis only' : st.sub}</small>
              </span>
            </button>
          )
        })}
      </nav>

      {panel && (
        <Sheet key={station} wide label={panel.label} onClose={() => useApp.getState().station === station && open(null)}>
          {panel.body()}
        </Sheet>
      )}
    </main>
  )
}
