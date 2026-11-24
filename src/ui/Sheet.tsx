import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/util'

interface Props {
  onClose: () => void
  label: string
  children: ReactNode
  /** station panels are wide; dialogs are narrow */
  wide?: boolean
  /** appear in place, so a shared element can morph into the sheet */
  instant?: boolean
  z?: number
}

const SPRING = { type: 'spring', stiffness: 210, damping: 24 } as const

/**
 * Frosted glass sheet. Springs up, drags down to dismiss with velocity, and
 * can be grabbed again mid-flight (the y value is a live motion value).
 */
export function Sheet({ onClose, label, children, wide, instant, z = 70 }: Props) {
  const reduce = useReducedMotion()
  const controls = useDragControls()
  const y = useMotionValue(instant || reduce ? 0 : 900)
  const scrim = useTransform(y, [0, 500], [1, 0])
  const ref = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  // a sheet on its way out must not swallow taps meant for what is underneath
  const [leaving, setLeaving] = useState(false)
  const id = useId()

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const height = ref.current?.offsetHeight ?? 900
    if (!instant && !reduce) {
      y.set(height + 40)
      animate(y, 0, SPRING)
    }
    ref.current?.focus({ preventScroll: true })
    return () => prev?.focus?.({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = (velocity = 0) => {
    if (closing.current) return
    closing.current = true
    setLeaving(true)
    // an instant sheet hands its shared element straight back to where it came from
    if (reduce || instant) return onClose()
    const height = ref.current?.offsetHeight ?? 900
    animate(y, height + 60, { ...SPRING, velocity, restDelta: 24, restSpeed: 40 }).then(onClose)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // only the top-most sheet answers
      const all = document.querySelectorAll('[data-sheet]')
      if (all[all.length - 1] === ref.current) {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: z, pointerEvents: leaving ? 'none' : 'auto' }}>
      <motion.div
        className="absolute inset-0 bg-[rgba(3,7,5,0.55)] backdrop-blur-[6px]"
        style={{ opacity: scrim }}
        initial={instant ? { opacity: 0 } : false}
        animate={instant ? { opacity: 1 } : undefined}
        onClick={() => close()}
        aria-hidden
      />
      <motion.div
        ref={ref}
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={id}
        tabIndex={-1}
        className={`glass-panel relative flex max-h-[92svh] w-full flex-col rounded-t-[28px] border-b-0 outline-none ${wide ? 'h-[90svh] max-w-[1180px]' : 'max-w-[560px]'}`}
        style={{ y }}
        initial={instant ? { opacity: 0 } : false}
        animate={instant ? { opacity: 1, transition: { duration: 0.18 } } : undefined}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.06, bottom: 1 }}
        onDragEnd={(_, info) => {
          const height = ref.current?.offsetHeight ?? 600
          if (info.offset.y > height * 0.28 || info.velocity.y > 700) {
            haptic(8)
            close(info.velocity.y)
          }
        }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none items-center justify-center px-4 pt-3 pb-2 active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
        >
          <span className="h-[5px] w-11 rounded-full bg-ivory/25" />
          <button
            type="button"
            onClick={() => close()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Close"
            className="absolute top-2 right-3 grid size-11 place-items-center rounded-full text-ivory-2 hover:text-ivory"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div id={id} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(28px+env(safe-area-inset-bottom))] sm:px-6" data-lenis-prevent>
          {children}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
