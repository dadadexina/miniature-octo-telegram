// 推送处理:由 workbox 生成的 service worker 通过 importScripts 引入。
// 拆成独立文件是因为 generateSW 会覆盖 public/sw.js,手写逻辑必须单独加载。
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || '纸墨信笺'
  const options = {
    body: payload.body || '你有一条新消息',
    tag: payload.tag || 'message',
    data: { url: payload.url || '/' },
    icon: '/icon.svg',
    badge: '/icon.svg',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    })(),
  )
})
