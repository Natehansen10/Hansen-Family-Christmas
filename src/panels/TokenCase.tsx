import { animate, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { PublicPerson, Token } from '../../shared/types'
import { api, ApiError } from '../lib/api'
import { burstFrom } from '../lib/confetti'
import { lookups, useApp } from '../lib/state'
import { haptic } from '../lib/util'
import { CodePad, PanelHead } from '../ui/bits'
import { Sheet } from '../ui/Sheet'

/** A gold medallion that lifts and tilts on a spring. Stand-in for the 3D figurine until Milestone 2. */
function Coin({ token, owner, mine, onPick }: { token: Token; owner: PublicPerson | null; mine: boolean; onPick: () => void }) {
  const celebrate = useApp((s) => s.celebrate === token.id)
  const coin = useRef<HTMLDivElement>(null)
  const claimed = !!owner
  const y = useSpring(0, { stiffness: 200, damping: 16 })
  const rx = useSpring(0, { stiffness: 170, damping: 14 })
  const ry = useSpring(0, { stiffness: 170, damping: 14 })
  const sheen = useSpring(0, { stiffness: 120, damping: 16 })
  const scale = useMotionValue(1)
  const shadowScale = useTransform(y, [-22, 0], [0.65, 1])
  const shadowOpacity = useTransform(y, [-22, 0], [0.5, 1])
  const sheenPx = useTransform(sheen, (v) => `${v}px`)

  useEffect(() => {
    if (!celebrate) return
    // the claim ceremony: spring pop, candy canes, a haptic tick, then the engraving
    haptic([10, 40, 14])
    animate(scale, 1, { type: 'spring', stiffness: 260, damping: 12, velocity: 9 })
    coin.current?.scrollIntoView({ block: 'center' })
    const fire = window.setTimeout(() => burstFrom(coin.current, 'cane'), 120)
    const t = window.setTimeout(() => useApp.setState({ celebrate: null }), 1800)
    return () => {
      window.clearTimeout(fire)
      window.clearTimeout(t)
    }
  }, [celebrate, scale])

  const rest = () => {
    y.set(0)
    rx.set(0)
    ry.set(0)
    sheen.set(0)
    animate(scale, 1, { type: 'spring', stiffness: 260, damping: 14 })
  }

  return (
    <button
      type="button"
      className="group relative grid justify-items-center gap-3 rounded-[28px] px-2 pt-6 pb-4 text-ivory"
      aria-label={owner ? `${token.name}, reserved for ${owner.name}${mine ? ' (you)' : ''}` : `Claim ${token.name}`}
      onClick={onPick}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !coin.current) return
        const r = coin.current.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width - 0.5
        const py = (e.clientY - r.top) / r.height - 0.5
        const k = claimed ? 0.35 : 1
        ry.set(px * 34 * k)
        rx.set(-py * 34 * k)
        y.set(claimed ? -4 : -18)
        sheen.set(140 + px * 60)
      }}
      onPointerLeave={rest}
      onPointerDown={() => {
        if (!claimed) haptic(6)
        animate(scale, 0.94, { type: 'spring', stiffness: 260, damping: 14 })
      }}
      onPointerUp={() => animate(scale, 1, { type: 'spring', stiffness: 260, damping: 14 })}
      onFocus={() => y.set(claimed ? -4 : -14)}
      onBlur={rest}
    >
      <div className="relative grid h-[128px] w-[108px] place-items-start justify-center [perspective:700px]">
        <motion.div ref={coin} className={`coin ${claimed ? 'claimed' : ''}`} style={{ y, rotateX: rx, rotateY: ry, scale, '--sx': sheenPx } as never}>
          <span className="mono">{token.mono}</span>
          <span className="num">{token.num}</span>
          <span className="sheen" />
        </motion.div>
        <motion.div
          className="absolute bottom-1 left-1/2 -ml-12 h-4 w-24 rounded-full bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),transparent)]"
          style={{ scale: shadowScale, opacity: shadowOpacity }}
        />
      </div>
      <div className="text-center font-serif text-[15px] leading-tight font-medium">{token.name}</div>
      <div className={`flourish min-h-[17px] text-center text-sm leading-tight ${owner ? 'text-gold-hi' : 'text-ivory-3'}`}>
        {owner ? (
          <span className="mask">
            <motion.span className="in" initial={celebrate ? { y: '115%' } : false} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}>
              Reserved for {owner.name}
              {mine ? ' (you)' : ''}
            </motion.span>
          </span>
        ) : (
          'Available'
        )}
      </div>
    </button>
  )
}

type Flow = { kind: 'claim'; token: Token } | { kind: 'signin'; token: Token; person: PublicPerson } | null

export function TokenCase() {
  const board = useApp((s) => s.board)
  const say = useApp((s) => s.say)
  const open = useApp((s) => s.open)
  const quick = useApp((s) => s.quick)
  const [flow, setFlow] = useState<Flow>(null)
  const { people, viewer, tokenOf } = lookups(board)
  const tokens = board?.tokens ?? []
  const mine = viewer ? tokenOf.get(viewer.id) : null
  const claimedCount = tokens.filter((t) => t.ownerId).length

  const pick = (t: Token) => {
    const owner = t.ownerId ? people.get(t.ownerId) : null
    if (!owner) return setFlow({ kind: 'claim', token: t })
    if (owner.id === viewer?.id) return say(`${t.name} is yours.`)
    if (owner.role === 'grandkid') return say(`${t.name} is engraved for ${owner.name}.`)
    setFlow({ kind: 'signin', token: t, person: owner })
  }

  return (
    <div>
      <PanelHead
        eyebrow="The Token Case"
        title={
          <>
            Choose your <em>piece.</em>
          </>
        }
        sub={
          viewer
            ? mine
              ? `You are ${viewer.name}, and ${mine.name} is yours for good.`
              : `You are ${viewer.name}. Pick a piece to make it yours.`
            : 'Sixteen pieces, cast in gold. Tap one to claim it and set your vault code. Already have one? Tap it and enter your code.'
        }
      />
      {viewer && mine && !quick && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button className="btn gold sm" onClick={() => open('desk')}>
            Add your wishes
          </button>
          <button className="btn ghost sm" onClick={() => open('gallery')}>
            See the gallery
          </button>
        </div>
      )}
      {!board && <div className="skel h-64" />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-3 gap-y-1">
        {tokens.map((t) => (
          <Coin key={t.id} token={t} owner={t.ownerId ? (people.get(t.ownerId) ?? null) : null} mine={!!viewer && t.ownerId === viewer.id} onPick={() => pick(t)} />
        ))}
      </div>
      <p className="mt-6 text-center text-xs tracking-[0.18em] text-ivory-3 uppercase">
        {claimedCount} of {tokens.length} engraved
      </p>
      {flow?.kind === 'claim' && <ClaimFlow token={flow.token} onClose={() => setFlow(null)} />}
      {flow?.kind === 'signin' && <SignIn token={flow.token} person={flow.person} onClose={() => setFlow(null)} />}
    </div>
  )
}

function ClaimFlow({ token, onClose }: { token: Token; onClose: () => void }) {
  const board = useApp((s) => s.board)
  const { viewer, tokenOf } = lookups(board)
  const [person, setPerson] = useState<PublicPerson | null>(null)
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const free = (board?.people ?? []).filter((p) => !tokenOf.has(p.id))
  // Signed out: any adult who has not set a code yet. Signed in: yourself, or a grandkid you manage.
  const options = viewer
    ? free.filter((p) => p.id === viewer.id || p.managers.includes(viewer.id))
    : free.filter((p) => p.role !== 'grandkid' && !p.hasCode)
  const needsCode = !!person && person.role !== 'grandkid' && person.id !== viewer?.id
  const mismatch = code.length === 4 && confirm.length === 4 && code !== confirm

  const submit = async (who: PublicPerson, vault?: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.claimToken(token.id, who.id, vault)
      await useApp.getState().refresh()
      useApp.setState({ celebrate: token.id })
      useApp.getState().say(`${token.name} engraved for ${who.name}`, true)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      void useApp.getState().refresh()
      setBusy(false)
    }
  }

  const choose = (p: PublicPerson) => {
    haptic(6)
    if (p.role === 'grandkid' || p.id === viewer?.id) void submit(p)
    else setPerson(p)
  }

  return (
    <Sheet onClose={onClose} label={`Claim ${token.name}`} z={80}>
      <p className="eyebrow mb-2 text-center">Piece {token.num}</p>
      <h3 className="display text-center text-[clamp(28px,5vw,36px)]">{token.name}</h3>
      {!needsCode ? (
        <>
          <p className="flourish mt-2 text-center text-[17px] text-ivory-2">Who is claiming this piece?</p>
          {options.length ? (
            <div className="my-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {options.map((p) => (
                <button key={p.id} className="choice !font-serif !text-[15px]" disabled={busy} onClick={() => choose(p)}>
                  {p.name}
                  {p.role === 'grandkid' && <small className="flourish block text-[13px] text-ivory-3">picked by a parent</small>}
                </button>
              ))}
            </div>
          ) : (
            <p className="my-6 text-center text-sm text-ivory-2">
              {viewer
                ? 'You already have your piece. To claim for someone else, use Switch person first.'
                : 'Everyone has a vault code already. Tap your own piece and enter your code.'}
            </p>
          )}
          {error && <p className="mb-3 text-center text-sm text-[#f0a8a0]" role="alert">{error}</p>}
          <p className="px-1 pb-2 text-center text-sm text-ivory-2">Once engraved, {token.name} is yours for good.</p>
        </>
      ) : (
        <form
          className="mt-4 grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length === 4 && code === confirm && person) void submit(person, code)
          }}
        >
          <p className="flourish text-center text-[17px] text-ivory-2">
            {person!.name}, set a 4-digit vault code. You will need it to open your list on another device.
          </p>
          <CodePad label="Vault code" value={code} onChange={setCode} autoFocus />
          <CodePad label="Once more" value={confirm} onChange={setConfirm} error={mismatch} />
          <p className="min-h-5 text-center text-sm text-[#f0a8a0]" role="alert">
            {mismatch ? 'Those two do not match.' : error}
          </p>
          <div className="grid gap-2">
            <button className="btn gold" disabled={busy || code.length !== 4 || code !== confirm}>
              {busy ? 'Engraving…' : `Engrave it for ${person!.name}`}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPerson(null)}>
              Not {person!.name}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

function SignIn({ token, person, onClose }: { token: Token; person: PublicPerson; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.verify(person.id, value)
      await useApp.getState().refresh()
      haptic(10)
      useApp.getState().say(`Welcome back, ${person.name}`, true)
      onClose()
    } catch (e) {
      haptic([20, 40, 20])
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      setCode('')
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} label={`Sign in as ${person.name}`} z={80}>
      <p className="eyebrow mb-2 text-center">{token.name}</p>
      <h3 className="display text-center text-[clamp(28px,5vw,36px)]">Reserved for {person.name}</h3>
      <p className="flourish mt-2 mb-5 text-center text-[17px] text-ivory-2">If that is you, enter your vault code.</p>
      <CodePad
        label="Vault code"
        value={code}
        error={!!error}
        autoFocus
        onChange={(v) => {
          setCode(v)
          if (error) setError(null)
          if (v.length === 4 && !busy) void submit(v)
        }}
      />
      <p className="mt-4 min-h-5 text-center text-sm text-[#f0a8a0]" role="alert">
        {error}
      </p>
      <p className="px-1 pt-2 pb-2 text-center text-[13px] text-ivory-3">Forgot it? Ask Nate to reset your code.</p>
    </Sheet>
  )
}
