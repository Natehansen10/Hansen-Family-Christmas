import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { lookups, useApp } from '../lib/state'
import { MiniCoin } from '../ui/bits'

/** Persistent chrome: the mark top-left, your figurine and the small menu top-right. */
export function Chrome() {
  const board = useApp((s) => s.board)
  const quick = useApp((s) => s.quick)
  const { open, setQuick, replay, say, refresh } = useApp.getState()
  const { viewer, tokenOf } = lookups(board)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const switchPerson = async () => {
    setMenu(false)
    try {
      await api.signOut()
      await refresh()
      say('Tap your piece and enter your vault code.')
      if (!quick) open('case')
    } catch (e) {
      useApp.getState().fail(e)
    }
  }

  const item = 'flex min-h-11 w-full items-center rounded-[12px] px-3 text-left text-sm hover:bg-ivory/8'

  return (
    <header className={`${quick ? 'sticky' : 'fixed'} inset-x-0 top-0 z-[60] flex items-start justify-between gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2 pointer-events-none no-print`}>
      <div className="glass pointer-events-auto flex flex-col rounded-full px-4 py-2.5 leading-none" title="Maison Noël is French for the House of Christmas">
        <b className="font-serif text-lg leading-none font-medium tracking-[-0.01em]">Maison Noël</b>
        <small className="flourish mt-[3px] text-[12.5px] leading-tight text-gold-hi">the house of Christmas</small>
      </div>

      <div ref={ref} className="pointer-events-auto relative">
        <button
          type="button"
          className="glass flex min-h-11 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-[13px] font-semibold"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MiniCoin token={viewer ? tokenOf.get(viewer.id) : null} small />
          {viewer ? viewer.name : 'Who are you?'}
          <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              role="menu"
              className="glass-panel absolute top-[calc(100%+8px)] right-0 w-60 rounded-[20px] p-2 shadow-(--shadow-lift)"
              style={{ transformOrigin: 'top right' }}
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            >
              {viewer ? (
                <button role="menuitem" className={item} onClick={() => void switchPerson()}>
                  Switch person
                </button>
              ) : (
                <button role="menuitem" className={item} onClick={() => { setMenu(false); if (!quick) open('case'); else document.getElementById('quick-case')?.scrollIntoView() }}>
                  Choose your piece
                </button>
              )}
              <button role="menuitem" className={item} onClick={() => { setMenu(false); setQuick(!quick) }}>
                {quick ? 'Back to the workshop' : 'Quick mode (plain list)'}
              </button>
              <button role="menuitem" className={item} onClick={() => { setMenu(false); replay() }}>
                Replay the entrance
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
