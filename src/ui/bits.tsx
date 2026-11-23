import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { BoardWish, Claim, Token } from '../../shared/types'
import { useApp } from '../lib/state'
import { PRIORITY, STATUS_LABEL, wrapping } from '../lib/util'

export function MiniCoin({ token, small }: { token?: Token | null; small?: boolean }) {
  return (
    <span className={`coin-mini ${small ? 'sm' : ''}`} aria-hidden>
      {token ? token.mono : '?'}
    </span>
  )
}

/** The wrapped box. `layoutId` makes it the shared element between a gift card and its detail sheet. */
export function GiftBox({ wish, forName, layoutId, className }: { wish: Pick<BoardWish, 'id' | 'priority'>; forName?: string; layoutId?: string; className?: string }) {
  const { paper, ribbon } = wrapping(wish.id, wish.priority)
  return (
    <motion.div
      layoutId={layoutId}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`box ${className ?? ''}`}
      style={{ '--bc': paper, '--rc': ribbon } as React.CSSProperties}
      aria-hidden
    >
      <div className="rv" />
      <div className="rh" />
      <div className="bow" />
      <div className="knot" />
      {forName && <div className="tag">For {forName}</div>}
    </motion.div>
  )
}

/** Renders nothing at all when there is no claim to show. No placeholder, no hint. */
export function StatusPill({ claim, who }: { claim: Claim | null | undefined; who: string }) {
  if (!claim) return null
  return (
    <motion.span
      key={claim.status + claim.claimerId}
      className={`pill ${claim.status === 'claimed' ? '' : 'done'}`}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 16 }}
    >
      <i />
      {STATUS_LABEL[claim.status]} · {who}
    </motion.span>
  )
}

export function PriorityPicker({ value, onChange }: { value: BoardWish['priority']; onChange: (p: BoardWish['priority']) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Priority">
      {(Object.keys(PRIORITY) as BoardWish['priority'][]).map((k) => (
        <button key={k} type="button" className="choice" aria-pressed={value === k} onClick={() => onChange(k)}>
          <i className="mx-auto mb-1.5 block h-1.5 w-[22px] rounded-full" style={{ background: PRIORITY[k].ribbon }} />
          {PRIORITY[k].label}
        </button>
      ))}
    </div>
  )
}

/** Four digits, one real input underneath so paste, autofill and screen readers all work. */
export function CodePad({ label, value, onChange, error, autoFocus }: { label: string; value: string; onChange: (v: string) => void; error?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])
  return (
    <label className="relative mx-auto block w-fit">
      <span className="field-label mb-2 block text-center">{label}</span>
      <motion.div className="flex justify-center gap-2.5" animate={error ? { x: [0, -9, 8, -6, 4, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid h-16 w-14 place-items-center rounded-[12px] border bg-[rgba(5,10,7,0.5)] font-serif text-3xl transition-colors ${
              error ? 'border-oxblood-2' : focused && i === Math.min(value.length, 3) ? 'border-gold shadow-[0_0_0_4px_rgba(188,156,92,0.15)]' : 'border-hair'
            }`}
          >
            {value[i] ? '•' : ''}
          </span>
        ))}
      </motion.div>
      <input
        ref={ref}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={4}
        value={value}
        aria-label={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
    </label>
  )
}

export function Toast() {
  const toast = useApp((s) => s.toast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-[120] flex justify-center px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="flex items-center gap-2 rounded-full bg-ivory px-[18px] py-3 text-center text-[13px] leading-tight font-semibold text-spruce shadow-(--shadow-lift)"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            {toast.ok && <span className="text-forest">✓</span>}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function PanelHead({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="mb-6 grid gap-3 pt-1">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display text-[clamp(34px,6vw,60px)]">{title}</h2>
      {sub && <p className="flourish max-w-[44ch] text-[clamp(17px,2.2vw,21px)] leading-snug text-ivory-2">{sub}</p>}
      <div className="mt-1 h-px bg-linear-to-r from-hair to-transparent" />
    </header>
  )
}
