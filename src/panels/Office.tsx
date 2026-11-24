import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ClaimStatus, LedgerRow } from '../../shared/types'
import { CLAIM_STATUSES } from '../../shared/types'
import { api } from '../lib/api'
import { lookups, useApp } from '../lib/state'
import { haptic, money, PRIORITY, STATUS_LABEL } from '../lib/util'
import { PanelHead } from '../ui/bits'

const DONE: ClaimStatus[] = ['bought', 'wrapped', 'under_tree']
const sum = (rows: LedgerRow[]) => rows.reduce((n, r) => n + (r.priceCents ?? 0), 0)

function csv(rows: LedgerRow[], name: (id: string) => string) {
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // spreadsheets must not run a wish title as a formula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['For', 'Wish', 'Store', 'Price', 'Priority', 'Status', 'Claimed by', 'Notes', 'Link']
  const lines = rows.map((r) =>
    [name(r.ownerId), r.title, r.store, r.priceCents == null ? '' : (r.priceCents / 100).toFixed(2), PRIORITY[r.priority].label, r.claim ? STATUS_LABEL[r.claim.status] : '', r.claim ? name(r.claim.claimerId) : '', r.notes, r.url].map(cell).join(','),
  )
  return [head.join(','), ...lines].join('\r\n')
}

/** Santa's Ledger. Purely functional on purpose: Jen and Curtis shop from this. */
export function Office() {
  const board = useApp((s) => s.board)
  const open = useApp((s) => s.open)
  const L = lookups(board)
  const viewer = L.viewer
  const santa = viewer?.role === 'santa'
  const [rows, setRows] = useState<LedgerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [by, setBy] = useState<'person' | 'store'>('person')
  const [todo, setTodo] = useState(false)

  useEffect(() => {
    if (!santa) return
    let live = true
    api
      .ledger()
      .then((r) => live && (setRows(r.rows), setError(null)))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
    // refetch whenever the board syncs (realtime ping, poll, or our own write)
  }, [santa, board])

  const groups = useMemo(() => {
    const shown = (rows ?? []).filter((r) => !todo || !r.claim || r.claim.status === 'claimed')
    const map = new Map<string, LedgerRow[]>()
    const order = new Map((board?.people ?? []).map((p, i) => [p.id, i]))
    for (const r of shown) {
      const key = by === 'person' ? r.ownerId : r.store?.trim() || 'No store listed'
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()].sort(([a], [b]) => (by === 'person' ? (order.get(a) ?? 0) - (order.get(b) ?? 0) : a.localeCompare(b)))
  }, [rows, by, todo, board?.people])

  if (!viewer || !santa) {
    return (
      <div className="grid justify-items-center gap-4 py-10 text-center">
        <svg width="56" height="64" viewBox="0 0 56 64" fill="none" aria-hidden>
          <path d="M14 28V18a14 14 0 0128 0v10" stroke="#bc9c5c" strokeWidth="3" />
          <rect x="4" y="28" width="48" height="34" rx="8" fill="#5a0d12" stroke="#bc9c5c" strokeWidth="2" />
          <circle cx="28" cy="43" r="4" fill="#ead39a" />
          <path d="M28 46v7" stroke="#ead39a" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h2 className="display text-[clamp(30px,5vw,48px)]">
          Santa's Office is <em>locked.</em>
        </h2>
        <p className="flourish max-w-[36ch] text-lg text-ivory-2">Only Jen and Curtis hold the key. No peeking at the Ledger.</p>
        {!viewer && (
          <button className="btn gold" onClick={() => open('case')}>
            Choose your piece
          </button>
        )}
      </div>
    )
  }

  const all = rows ?? []
  const ours = (r: LedgerRow) => !!r.claim && L.people.get(r.claim.claimerId)?.role === 'santa'
  const spent = sum(all.filter((r) => ours(r) && DONE.includes(r.claim!.status)))
  const planned = sum(all.filter((r) => ours(r) && r.claim!.status === 'claimed'))
  const open_ = all.filter((r) => !r.claim && !r.removed).length

  const setStatus = async (row: LedgerRow, value: string) => {
    haptic(8)
    const next = value ? { claimerId: row.claim?.claimerId ?? viewer.id, status: value as ClaimStatus } : null
    setRows((rs) => rs && rs.map((r) => (r.id === row.id ? { ...r, claim: next } : r)))
    try {
      await api.claim(row.id, value ? 'status' : 'release', (value || undefined) as ClaimStatus | undefined)
    } catch (e) {
      useApp.getState().fail(e)
    }
    void useApp.getState().refresh()
  }

  const download = () => {
    const blob = new Blob(['﻿' + csv(all, L.name)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `santas-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="no-print">
        <PanelHead eyebrow="Santa's Office" title={<>Santa's <em>Ledger.</em></>} sub={`Every wish except your own, ${viewer.name}. What you mark here stays hidden from the person it is for.`} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-2" role="group" aria-label="Group by">
            <button className="choice !px-4" aria-pressed={by === 'person'} onClick={() => setBy('person')}>By person</button>
            <button className="choice !px-4" aria-pressed={by === 'store'} onClick={() => setBy('store')}>Shopping route</button>
          </div>
          <button className="choice !px-4" aria-pressed={todo} onClick={() => setTodo(!todo)}>Still to buy</button>
          <span className="grow" />
          <button className="btn ghost sm" onClick={() => window.print()}>Print</button>
          <button className="btn ghost sm" onClick={download} disabled={!all.length}>Export CSV</button>
        </div>
      </div>

      <div className="print-area">
        <div className="ledger">
          <div className="flex flex-wrap gap-x-8 gap-y-1 border-b border-[#cdbf9f] bg-[#efe6d2] px-3 py-3 text-[13px]">
            <span><b>{money(spent) || '$0'}</b> bought</span>
            <span><b>{money(planned) || '$0'}</b> claimed, not bought yet</span>
            <span><b>{open_}</b> {open_ === 1 ? 'wish' : 'wishes'} nobody has claimed</span>
          </div>
          {error && <p className="p-4 text-[#7a1820]" role="alert">{error}</p>}
          {!rows && !error && <p className="p-4 text-[#6b5a3c]">Opening the Ledger…</p>}
          {rows && groups.length === 0 && <p className="p-6 text-center text-[#6b5a3c]">{todo ? 'Nothing left to buy. Well done, Santa.' : 'No wishes yet. The elves are waiting.'}</p>}
          {groups.length > 0 && (
            <div className="overflow-x-auto" data-lenis-prevent>
              <table>
                <thead>
                  <tr>
                    <th>Wish</th>
                    <th>{by === 'person' ? 'Store' : 'For'}</th>
                    <th className="num">Price</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([key, list]) => {
                    const done = list.filter((r) => ours(r) && DONE.includes(r.claim!.status))
                    const left = list.filter((r) => !r.claim || r.claim.status === 'claimed')
                    return (
                      <Fragment key={key}>
                        <tr className="group">
                          <td colSpan={2}>{by === 'person' ? L.name(key) : key}</td>
                          <td colSpan={4} className="num !font-sans !text-[12.5px] !font-normal">
                            {list.length} {list.length === 1 ? 'wish' : 'wishes'} · {money(sum(done)) || '$0'} bought · {money(sum(left)) || '$0'} still to buy
                          </td>
                        </tr>
                        {list.map((r) => {
                          const locked = !!r.claim && !ours(r)
                          return (
                            <tr key={r.id} className={r.removed ? 'opacity-60' : ''}>
                              <td className="min-w-[200px]">
                                {r.url ? (
                                  <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                                ) : (
                                  <span className="font-medium">{r.title}</span>
                                )}
                                {r.notes && <div className="text-[12.5px] text-[#6b5a3c]">{r.notes}</div>}
                                {r.removed && <div className="text-[12.5px] font-semibold text-[#7a1820]">Taken off the list by {L.name(r.ownerId)}</div>}
                              </td>
                              <td className="whitespace-nowrap">{by === 'person' ? r.store || '' : L.name(r.ownerId)}</td>
                              <td className="num">{money(r.priceCents)}</td>
                              <td className="whitespace-nowrap">{PRIORITY[r.priority].label}</td>
                              <td>
                                {locked ? (
                                  <span className="whitespace-nowrap">{STATUS_LABEL[r.claim!.status]}</span>
                                ) : (
                                  <select aria-label={`Status of ${r.title}`} value={r.claim?.status ?? ''} onChange={(e) => void setStatus(r, e.target.value)}>
                                    <option value="">Not claimed</option>
                                    {CLAIM_STATUSES.map((s) => (
                                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="whitespace-nowrap">{r.claim ? (r.claim.claimerId === viewer.id ? 'You' : L.name(r.claim.claimerId)) : ''}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
