import { useEffect } from 'react'
import { preloadCoreRoutes, preloadRoute } from '../lib/routePreload'

function routeFromEvent(event) {
  const target = event.target
  if (!target || typeof target.closest !== 'function') return null
  const anchor = target.closest('a[href]')
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null
  try {
    const url = new URL(anchor.href, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return url.pathname
  } catch {
    return null
  }
}

export default function useRoutePreload(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const onIntent = (event) => {
      const pathname = routeFromEvent(event)
      if (pathname) preloadRoute(pathname)
    }
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('pointerdown', onIntent, { passive: true })
    document.addEventListener('touchstart', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)

    let idleId = null
    let timerId = null
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => preloadCoreRoutes(), { timeout: 2000 })
    } else {
      timerId = setTimeout(preloadCoreRoutes, 1200)
    }

    return () => {
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('pointerdown', onIntent)
      document.removeEventListener('touchstart', onIntent)
      document.removeEventListener('focusin', onIntent)
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timerId !== null) clearTimeout(timerId)
    }
  }, [enabled])
}
