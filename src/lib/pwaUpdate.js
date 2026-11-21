const RELOAD_GUARD_KEY = 'wechat-chat-app-v3:sw-reload-at'
const RELOAD_GUARD_MS = 10_000
const UPDATE_INTERVAL_MS = 30 * 60 * 1000

function callInProgress(win) {
  return win?.document?.documentElement?.dataset?.callActive === '1'
}

export function initPwaUpdates(registerSW, { win = globalThis.window, nav = globalThis.navigator } = {}) {
  if (!win || !nav?.serviceWorker || typeof registerSW !== 'function') return
  const sw = nav.serviceWorker
  const hadController = Boolean(sw.controller)
  let reloading = false

  const reload = () => {
    if (reloading) return
    reloading = true
    win.location.reload()
  }

  // 旧页面请求已下线分块(版本错位)时自动刷新;10s 内只刷一次,避免死循环
  const reloadThrottled = () => {
    if (callInProgress(win)) return
    const now = Date.now()
    const last = Number(win.sessionStorage?.getItem(RELOAD_GUARD_KEY) || 0)
    if (now - last < RELOAD_GUARD_MS) return
    win.sessionStorage?.setItem(RELOAD_GUARD_KEY, String(now))
    reload()
  }

  // 新版本 Service Worker 接管后立即刷新,避免页面继续运行旧构建
  sw.addEventListener('controllerchange', () => {
    if (hadController) reloadThrottled()
  })

  win.addEventListener('vite:preloadError', (event) => {
    event?.preventDefault?.()
    reloadThrottled()
  })

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const update = () => {
        const pending = registration.update?.()
        if (pending?.catch) pending.catch(() => {})
      }
      win.setInterval(update, UPDATE_INTERVAL_MS)
      win.document?.addEventListener('visibilitychange', () => {
        if (win.document.visibilityState === 'visible') update()
      })
      win.addEventListener('online', update)
    },
  })
}

export const PWA_UPDATE_INTERVAL_MS = UPDATE_INTERVAL_MS
