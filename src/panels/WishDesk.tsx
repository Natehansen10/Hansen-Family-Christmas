import { useEffect, useRef, useState } from 'react'
import type { BoardWish, Priority } from '../../shared/types'
import { api } from '../lib/api'
import { burstFrom } from '../lib/confetti'
import { lookups, useApp } from '../lib/state'
import { haptic, money, parsePrice } from '../lib/util'
import { GiftBox, PanelHead, PriorityPicker } from '../ui/bits'

interface Draft {
  url: string
  title: string
  price: string
  store: string
  priority: Priority
  notes: string
  imageUrl: string | null
}
const BLANK: Draft = { url: '', title: '', price: '', store: '', priority: 'love', notes: '', imageUrl: null }
const fromWish = (w: BoardWish): Draft => ({
  url: w.url ?? '',
  title: w.title,
  price: w.priceCents == null ? '' : (w.priceCents / 100).toString(),
  store: w.store ?? '',
  priority: w.priority,
  notes: w.notes ?? '',
  imageUrl: w.imageUrl,
})

export function WishDesk() {
  const board = useApp((s) => s.board)
  const deskOwner = useApp((s) => s.deskOwner)
  const editing = useApp((s) => s.editing)
  const { say, fail, open, refresh, setBoard } = useApp.getState()
  const { viewer, people, name } = lookups(board)
  const [draft, setDraft] = useState<Draft>(editing ? fromWish(editing) : BLANK)
  const [unfurling, setUnfurling] = useState(false)
  const [saving, setSaving] = useState(false)
  const lastUnfurled = useRef('')
  const titleRef = useRef<HTMLInputElement>(null)
  const shelfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(editing ? fromWish(editing) : BLANK)
    lastUnfurled.current = editing?.url ?? ''
  }, [editing])

  if (!viewer) {
    return (
      <div>
        <PanelHead eyebrow="The Wish Desk" title={<>Add a <em>wish.</em></>} sub="The elves need to know whose list this is first." />
        <button className="btn gold" onClick={() => open('case')}>
          Choose your piece
        </button>
      </div>
    )
  }

  const mine = [viewer, ...[...people.values()].filter((p) => p.managers.includes(viewer.id))]
  const ownerId = editing?.ownerId ?? (deskOwner && mine.some((p) => p.id === deskOwner) ? deskOwner : viewer.id)
  const forOther = ownerId !== viewer.id
  const shelf = (board?.wishes ?? []).filter((w) => w.ownerId === ownerId && !w.removed)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const unfurl = async (raw: string) => {
    const url = raw.trim()
    if (!/^https?:\/\/\S+\.\S+/.test(url) || url === lastUnfurled.current) return
    lastUnfurled.current = url
    setUnfurling(true)
    try {
      const u = await api.unfurl(url)
      // never overwrite something the person already typed
      setDraft((d) => ({
        ...d,
        title: d.title || u.title || '',
        store: d.store || u.store || '',
        price: d.price || (u.priceCents ? (u.priceCents / 100).toString() : ''),
        imageUrl: u.imageUrl ?? d.imageUrl,
      }))
      if (!u.title) say('That store keeps its doors shut. Fill in the details by hand.')
    } catch (e) {
      fail(e)
    } finally {
      setUnfurling(false)
      titleRef.current?.focus({ preventScroll: true })
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.title.trim()) return titleRef.current?.focus()
    setSaving(true)
    const input = {
      ownerId,
      url: draft.url.trim() || null,
      title: draft.title.trim(),
      priceCents: parsePrice(draft.price),
      store: draft.store.trim() || null,
      priority: draft.priority,
      notes: draft.notes.trim() || null,
      imageUrl: draft.imageUrl,
    }
    try {
      if (editing) {
        const { wish } = await api.editWish(editing.id, input)
        setBoard((b) => ({ ...b, wishes: b.wishes.map((w) => (w.id === wish.id ? { ...w, ...wish } : w)) }))
        say('Wish updated', true)
        useApp.setState({ editing: null })
      } else {
        const { wish } = await api.addWish(input)
        // drawn at once; the next board sync fills in anything this viewer may see
        setBoard((b) => ({ ...b, wishes: [...b.wishes.filter((w) => w.id !== wish.id), wish] }))
        haptic([8, 30, 8])
        say(forOther ? `Wrapped and on ${name(ownerId)}'s shelf` : 'Wrapped and on your shelf', true)
        setDraft(BLANK)
        lastUnfurled.current = ''
        requestAnimationFrame(() => burstFrom(shelfRef.current?.querySelector('[data-new]') ?? shelfRef.current, 'flake'))
      }
      void refresh()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (w: BoardWish) => {
    if (!window.confirm(`Take "${w.title}" off the list?`)) return
    setBoard((b) => ({ ...b, wishes: b.wishes.filter((x) => x.id !== w.id) }))
    try {
      await api.removeWish(w.id)
      say('Removed')
    } catch (e) {
      fail(e)
    }
    void refresh()
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-10">
      <form onSubmit={save} className="grid min-w-0 grid-cols-1 content-start gap-4">
        <PanelHead
          eyebrow="The Wish Desk"
          title={editing ? <>Edit a <em>wish.</em></> : <>Add a <em>wish.</em></>}
          sub={forOther ? `Adding for ${name(ownerId)}. Paste a link and the elves will wrap it.` : 'Paste a link. The elves will wrap it.'}
        />
        {mine.length > 1 && !editing && (
          <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="Whose list">
            {mine.map((p) => (
              <button key={p.id} type="button" className="choice !px-4" aria-pressed={p.id === ownerId} onClick={() => useApp.setState({ deskOwner: p.id })}>
                {p.id === viewer.id ? 'My list' : `${p.name}'s list`}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span>Store link</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://www.rei.com/product/…"
            value={draft.url}
            onChange={(e) => set({ url: e.target.value })}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (text) window.setTimeout(() => void unfurl(text), 0)
            }}
            onBlur={(e) => void unfurl(e.target.value)}
          />
        </label>
        <label className="field">
          <span>What is it</span>
          {unfurling ? <div className="skel h-12" /> : <input ref={titleRef} className="input" placeholder="Garmin Forerunner 965" maxLength={200} value={draft.title} onChange={(e) => set({ title: e.target.value })} />}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Price</span>
            {unfurling ? <div className="skel h-12" /> : <input className="input" inputMode="decimal" placeholder="$" value={draft.price} onChange={(e) => set({ price: e.target.value })} />}
          </label>
          <label className="field">
            <span>Store</span>
            {unfurling ? <div className="skel h-12" /> : <input className="input" placeholder="REI" maxLength={80} value={draft.store} onChange={(e) => set({ store: e.target.value })} />}
          </label>
        </div>
        <div className="field">
          <span>Priority</span>
          <PriorityPicker value={draft.priority} onChange={(priority) => { haptic(5); set({ priority }) }} />
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea className="input min-h-[84px] resize-y" placeholder="Size, color, model…" maxLength={1000} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="grid gap-2">
          <button className="btn gold" disabled={saving || unfurling}>
            {saving ? 'Wrapping…' : unfurling ? 'The elves are reading the link…' : editing ? 'Save changes' : 'Wrap it'}
          </button>
          {editing && (
            <button type="button" className="btn ghost" onClick={() => useApp.setState({ editing: null })}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <section ref={shelfRef} aria-label={forOther ? `${name(ownerId)}'s shelf` : 'Your shelf'} className="content-start lg:pt-16">
        <p className="eyebrow mb-3">
          {forOther ? `${name(ownerId)}'s shelf` : 'Your shelf'} · {shelf.length} {shelf.length === 1 ? 'wish' : 'wishes'}
        </p>
        {shelf.length === 0 ? (
          <p className="flourish rounded-[12px] border border-dashed border-hair p-6 text-center text-lg text-ivory-2">
            {forOther ? `${name(ownerId)}'s shelf is empty.` : 'Your shelf is empty.'} The elves are waiting.
          </p>
        ) : (
          <ul className="grid gap-2">
            {[...shelf].reverse().map((w, i) => (
              <li key={w.id} data-new={i === 0 ? '' : undefined} className="flex items-center gap-3 rounded-[12px] border border-ivory/5 bg-[rgba(5,10,7,0.35)] p-2.5">
                <GiftBox wish={w} className="w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-[15px]">{w.title}</div>
                  <div className="truncate text-xs text-ivory-3">{[w.store, money(w.priceCents)].filter(Boolean).join(' · ')}</div>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => useApp.setState({ editing: w })}>
                  Edit
                </button>
                <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full text-ivory-3 hover:text-ivory" aria-label={`Remove ${w.title}`} onClick={() => void remove(w)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
