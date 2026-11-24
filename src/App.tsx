import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { Chrome } from './hub/Chrome'
import { Hub } from './hub/Hub'
import { useLiveBoard } from './lib/realtime'
import { useApp } from './lib/state'
import { QuickMode } from './quick/QuickMode'
import { Toast } from './ui/bits'

// GSAP, ScrollTrigger and Lenis are only needed for the entrance, so returning visitors never download them
const Arrival = lazy(() => import('./arrival/Arrival'))

export function App() {
  const phase = useApp((s) => s.phase)
  const quick = useApp((s) => s.quick)
  const loadError = useApp((s) => s.loadError)
  useLiveBoard()

  const arriving = phase === 'arrival' && !quick

  useEffect(() => {
    document.documentElement.classList.toggle('quick', quick)
    // the hub is a fixed stage; only the entrance and Quick mode scroll the page
    document.body.style.overflow = arriving || quick ? '' : 'hidden'
  }, [arriving, quick])

  return (
    <MotionConfig reducedMotion="user">
      <div className="grain" aria-hidden />
      {!quick && <div className="vignette" aria-hidden />}
      {quick ? (
        <>
          <Chrome />
          <QuickMode />
        </>
      ) : (
        <>
          <Hub hidden={arriving} />
          {arriving ? (
            <Suspense fallback={<div className="stage" />}>
              <Arrival />
            </Suspense>
          ) : (
            <Chrome />
          )}
        </>
      )}
      {loadError && (
        <div role="alert" className="glass-panel fixed inset-x-4 bottom-20 z-[110] mx-auto max-w-md rounded-[20px] p-4 text-center text-sm">
          {loadError}
          <button className="btn ghost sm mx-auto mt-3" onClick={() => void useApp.getState().refresh()}>
            Try again
          </button>
        </div>
      )}
      <Toast />
    </MotionConfig>
  )
}
