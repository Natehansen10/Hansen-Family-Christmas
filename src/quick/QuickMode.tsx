import { lookups, useApp } from '../lib/state'
import { Gallery } from '../panels/Gallery'
import { Office } from '../panels/Office'
import { TokenCase } from '../panels/TokenCase'
import { WishDesk } from '../panels/WishDesk'

/**
 * Quick mode: the same data and the same server rules as the workshop, as one
 * plain scrolling page. For grandparents, old phones, and anyone in a hurry.
 */
export function QuickMode() {
  const board = useApp((s) => s.board)
  const { viewer } = lookups(board)
  const section = 'mx-auto w-full max-w-[1180px] scroll-mt-24 border-t border-hair/60 px-4 py-10 sm:px-6'
  return (
    <main id="workshop" className="pb-16">
      {viewer && (
        <section id="quick-desk" className={`${section} border-t-0`}>
          <WishDesk />
        </section>
      )}
      {viewer && (
        <section id="quick-gallery" className={section}>
          <Gallery />
        </section>
      )}
      {viewer?.role === 'santa' && (
        <section id="quick-office" className={section}>
          <Office />
        </section>
      )}
      <section id="quick-case" className={`${section} ${viewer ? '' : 'border-t-0'}`}>
        <TokenCase />
      </section>
      <footer className="px-4 pt-10 text-center text-ivory-2">
        <div className="mx-auto mb-5 grid size-[72px] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#9a2a31,#5a0d12_65%,#3a070b)] font-serif text-xl text-[rgba(255,220,200,0.8)] italic shadow-[inset_0_0_0_5px_rgba(0,0,0,0.18),0_10px_24px_rgba(0,0,0,0.4)]">
          MN
        </div>
        <p className="display text-[clamp(24px,4vw,36px)] text-ivory">
          Maison Noël, <em>the House of Christmas.</em>
        </p>
        <p className="mt-2 text-sm">
          From the French <i>maison</i> (house) and <i>Noël</i> (Christmas). Made for the Hansens.
        </p>
      </footer>
    </main>
  )
}
