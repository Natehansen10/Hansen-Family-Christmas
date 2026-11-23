import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useRef, useState } from 'react'
import type { BoardWish, PublicPerson } from '../../shared/types'
import { burstFrom } from '../lib/confetti'
import { changeClaim, lookups, useApp } from '../lib/state'
import { haptic, money, PRIORITY } from '../lib/util'
import { GiftBox, MiniCoin, PanelHead, StatusPill } from '../ui/bits'
import { Sheet } from '../ui/Sheet'

const SPANS = ['md:col-span-4', 'md:col-span-2', 'md:col-span-3', 'md:col-span-3', 'md:col-span-2', 'md:col-span-4']

function rulesFor(viewer: PublicPerson, all: PublicPerson[]) {
  if (viewer.role === 'santa') {
    const other = all.find((p) => p.role === 'santa' && p.id !== viewer.id)?.name ?? 'The other Santa'
    return (
      <>
        <b className="font-semibold text-ivory">As {viewer.name} (a Santa):</b> you see who is buying what on every list except your own. {other} and the kids
        coordinate on your list, and you never see it.
      </>
    )
  }
  const kids = all.filter((p) => p.managers.includes(viewer.id)).map((p) => p.name)
  return (
    <>
      <b className="font-semibold text-ivory">As {viewer.name}:</b> you can claim gifts on <b className="font-semibold text-ivory">Jen's and Curtis's</b> lists so
      no one doubles up. Every other list, including yours{kids.length ? ` and ${kids.join(' and ')}'s` : ''}, never shows what has been bought.
      {kids.length ? ` You keep ${kids.join(' and ')}'s list.` : ''}
    </>
  )
}

export function Gallery() {
  const board = useApp((s) => s.board)
  const open = useApp((s) => s.open)
  const openDesk = useApp((s) => s.openDesk)
  const quick = useApp((s) => s.quick)
  const [openId, setOpenId] = useState<string | null>(null)
  const L = lookups(board)
  const { viewer } = L

  if (!board) return <div className="skel h-80" />
  if (!viewer) {
    return (
      <div>
        <PanelHead eyebrow="The Gallery" title={<>Every wish, <em>wrapped.</em></>} sub="The shelves open once the elves know who you are." />
        <button className="btn gold" onClick={() => open('case')}>
          Choose your piece
        </button>
      </div>
    )
  }

  // you first, then the lists you keep, then Jen and Curtis (where kids shop), then everyone else
  const rank = (p: PublicPerson) => (p.id === viewer.id ? 0 : p.managers.includes(viewer.id) ? 1 : p.role === 'santa' ? 2 : 3)
  const order = board.people.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)
  const current = openId ? (board.wishes.find((w) => w.id === openId) ?? null) : null

  return (
    <LayoutGroup>
      <PanelHead eyebrow="The Gallery" title={<>Every wish, <em>wrapped.</em></>} sub="Tap a gift to open it." />
      <div className="-mt-2 mb-6 flex max-w-[760px] items-start gap-3 rounded-[28px] border border-hair bg-ivory/4 p-4 text-sm text-ivory-2">
        <span className="mt-2 size-2 shrink-0 rounded-full bg-gold shadow-[0_0_0_4px_rgba(188,156,92,0.18)]" />
        <p>{rulesFor(viewer, board.people)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {order.map((p, i) => {
          const list = board.wishes.filter((w) => w.ownerId === p.id)
          const token = L.tokenOf.get(p.id)
          const editable = L.edits(p.id)
          const kept = p.managers.length ? `List kept by ${p.managers.map(L.name).join(' & ')}` : token ? token.name : 'No piece yet'
          return (
            <motion.article
              key={p.id}
              className={`shelf ${SPANS[i % SPANS.length]}`}
              initial={quick ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 22, delay: Math.min(i, 6) * 0.05 }}
            >
              <div className="flex items-center gap-3 px-2 pt-2 pb-4">
                <MiniCoin token={token} />
                <div className="min-w-0">
                  <h3 className="font-serif text-[22px] leading-tight font-medium tracking-[-0.01em]">
                    {p.name}
                    {p.id === viewer.id && <span className="flourish text-[15px] text-gold-hi"> (you)</span>}
                  </h3>
                  <p className="flourish truncate text-[14.5px] leading-tight text-ivory-3">{kept}</p>
                </div>
                <span className="ml-auto text-[11px] font-medium tracking-[0.18em] whitespace-nowrap text-ivory-3 uppercase">
                  {list.length} {list.length === 1 ? 'wish' : 'wishes'}
                </span>
              </div>
              {list.length === 0 && !editable ? (
                <p className="flourish px-2 pb-3 text-[15px] text-ivory-3">Nothing on the shelf yet.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                  {list.map((w) => (
                    <GiftCard key={w.id} wish={w} forName={p.name} hidden={openId === w.id} who={w.claim ? (w.claim.claimerId === viewer.id ? 'You' : L.name(w.claim.claimerId)) : ''} onOpen={() => { haptic(5); setOpenId(w.id) }} />
                  ))}
                  {editable && (
                    <button
                      className="grid min-h-[168px] place-content-center justify-items-center gap-1.5 rounded-[12px] border border-dashed border-hair p-3 text-center text-ivory-2 transition-colors hover:border-gold"
                      onClick={() => openDesk(p.id)}
                    >
                      <span className="grid size-9 place-items-center rounded-full border border-gold text-[22px] leading-none font-light text-gold-hi">+</span>
                      <b className="flourish text-lg font-normal text-gold-hi">Add a wish</b>
                      <span className="text-xs">{list.length === 0 && p.id === viewer.id ? 'Your shelf is empty. The elves are waiting.' : p.id === viewer.id ? 'Paste any store link' : `for ${p.name}`}</span>
                    </button>
                  )}
                </div>
              )}
            </motion.article>
          )
        })}
      </div>

      <AnimatePresence>{current && <WishDetail key={current.id} wish={current} onClose={() => setOpenId(null)} />}</AnimatePresence>
    </LayoutGroup>
  )
}

function GiftCard({ wish, forName, who, hidden, onOpen }: { wish: BoardWish; forName: string; who: string; hidden: boolean; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      className={`gift ${wish.removed ? 'opacity-60' : ''}`}
      onClick={onOpen}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      {/* while the sheet is open the box lives there; this keeps the card's shape */}
      {hidden ? <div className="aspect-square" /> : <GiftBox wish={wish} forName={forName} layoutId={`box-${wish.id}`} />}
      <div className="font-serif text-sm leading-tight font-medium">{wish.title}</div>
      <div className="flex justify-between gap-2 text-xs text-ivory-3">
        <span className="truncate">{wish.store}</span>
        <span>{money(wish.priceCents)}</span>
      </div>
      {/* only where canSeeStatus allows: the server sent no claim key otherwise */}
      {'claim' in wish && <StatusPill claim={wish.claim} who={who} />}
    </motion.button>
  )
}

function WishDetail({ wish, onClose }: { wish: BoardWish; onClose: () => void }) {
  const board = useApp((s) => s.board)
  const openDesk = useApp((s) => s.openDesk)
  const L = lookups(board)
  const viewer = L.viewer!
  const statusRef = useRef<HTMLDivElement>(null)
  const owner = L.name(wish.ownerId)
  const claim = wish.claim
  const mayClaim = 'claim' in wish && L.claims(wish.ownerId)
  const parents = (id: string) => L.people.get(id)?.role === 'santa'
  const mineToChange = !!claim && (claim.claimerId === viewer.id || (viewer.role === 'santa' && parents(claim.claimerId)))
  const who = claim ? (claim.claimerId === viewer.id ? 'You' : L.name(claim.claimerId)) : ''

  const act = async (action: 'claim' | 'release' | 'status', status?: 'bought') => {
    haptic(10)
    const next = action === 'release' ? null : { claimerId: claim?.claimerId ?? viewer.id, status: status ?? ('claimed' as const) }
    const ok = await changeClaim(wish, action, next)
    if (!ok) return
    if (action === 'status') burstFrom(statusRef.current, 'cane')
    useApp.getState().say(action === 'claim' ? `Claimed. Hidden from ${owner}` : action === 'status' ? 'Marked as bought' : 'Released', true)
  }

  return (
    <Sheet onClose={onClose} label={`${owner}'s wish: ${wish.title}`} instant z={80}>
      <p className="eyebrow mb-3 text-center">{owner}'s wish</p>
      <GiftBox wish={wish} forName={owner} layoutId={`box-${wish.id}`} className="mx-auto mt-1 mb-5 w-[min(220px,52vw)]" />
      <h3 className="display text-center text-[clamp(26px,5vw,36px)] leading-[1.05]">{wish.title}</h3>
      {(wish.notes || wish.addedBy !== wish.ownerId) && (
        <p className="flourish mt-2 text-center text-[17px] leading-snug text-ivory-2">
          {wish.notes}
          {wish.addedBy !== wish.ownerId ? ` Added by ${L.name(wish.addedBy)}.` : ''}
        </p>
      )}
      {wish.removed && <p className="mt-3 rounded-[12px] border border-oxblood-2 bg-oxblood/40 p-3 text-center text-sm">{owner} took this off the list after it was claimed.</p>}
      {wish.imageUrl && (
        <img src={wish.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="mx-auto mt-5 max-h-44 rounded-[12px] border border-ivory/10 bg-ivory object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
      )}
      <dl className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ['Store', wish.store || 'Anywhere'],
          ['Price', money(wish.priceCents) || 'Not listed'],
          ['Priority', PRIORITY[wish.priority].label],
        ].map(([k, v], i) => (
          <div key={k} className={`rounded-[12px] border border-ivory/7 bg-ivory/5 p-3 ${i === 2 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <dt className="text-[10px] font-semibold tracking-[0.16em] text-ivory-3 uppercase">{k}</dt>
            <dd className="font-serif text-[15px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {'claim' in wish && claim && (
        <div ref={statusRef} className="mb-4 flex justify-center">
          <StatusPill claim={claim} who={who} />
        </div>
      )}
      <div className="grid gap-2">
        {wish.url && (
          <a className="btn primary" href={wish.url} target="_blank" rel="noopener noreferrer">
            Open at {wish.store || 'the store'} <span aria-hidden>↗</span>
          </a>
        )}
        {mayClaim && !wish.removed && !claim && (
          <button className="btn gold" onClick={() => void act('claim')}>
            I'll get this
          </button>
        )}
        {mayClaim && claim && mineToChange && claim.status === 'claimed' && (
          <button className="btn gold" onClick={() => void act('status', 'bought')}>
            Mark as bought
          </button>
        )}
        {mayClaim && claim && mineToChange && (
          <button className="btn ghost" onClick={() => void act('release')}>
            Let someone else get it
          </button>
        )}
        {mayClaim && claim && !mineToChange && (
          <button className="btn ghost" disabled>
            {who} has this one
          </button>
        )}
        {L.edits(wish.ownerId) && !wish.removed && (
          <button className="btn ghost" onClick={() => { onClose(); openDesk(wish.ownerId, wish) }}>
            Edit wish
          </button>
        )}
      </div>
    </Sheet>
  )
}
