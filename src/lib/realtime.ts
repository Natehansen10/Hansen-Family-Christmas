import { useEffect } from 'react'
import { useApp } from './state'

/**
 * Keeps every device in sync. The realtime channel carries a payload-free
 * "changed" ping and nothing else; the data itself always comes from
 * /api/board, which applies the spoiler shield for this viewer.
 * Polling covers the gaps (no realtime configured, a dropped socket).
 */
export function useLiveBoard() {
  const config = useApp((s) => s.board?.realtime ?? null)
  const url = config?.url
  const key = config?.key

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void useApp.getState().refresh()
    }
    void useApp.getState().refresh()
    const poll = window.setInterval(refresh, url ? 45_000 : 12_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('mn:changed', refresh)

    let stop = () => {}
    let cancelled = false
    if (url && key) {
      void import('@supabase/supabase-js').then(({ createClient }) => {
        if (cancelled) return
        const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
        const channel = client.channel('board').on('broadcast', { event: 'changed' }, refresh).subscribe()
        stop = () => {
          void client.removeChannel(channel)
          void client.realtime.disconnect()
        }
      })
    }
    return () => {
      cancelled = true
      stop()
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('mn:changed', refresh)
    }
  }, [url, key])
}
