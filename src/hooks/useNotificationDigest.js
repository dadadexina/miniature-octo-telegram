import { useEffect } from 'react'
import { flushDigestNotification } from '../lib/appSettings'

const FLUSH_INTERVAL_MS = 30000

export default function useNotificationDigest(userId) {
  useEffect(() => {
    if (!userId) return undefined
    let alive = true
    const flush = () => {
      if (!alive) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      flushDigestNotification({ userId })
    }
    flush()
    const timer = setInterval(flush, FLUSH_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    document.addEventListener('visibilitychange', onVisible)
    globalThis.addEventListener?.('focus', flush)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      globalThis.removeEventListener?.('focus', flush)
    }
  }, [userId])
}
