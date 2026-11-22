// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeCache {
  constructor() {
    this.map = new Map()
  }

  keyOf(req) {
    return typeof req === 'string' ? req : req.url
  }

  async put(req, res) {
    this.map.set(this.keyOf(req), res)
  }

  async match(req) {
    return this.map.get(this.keyOf(req))
  }

  async keys() {
    return [...this.map.keys()]
  }

  async delete(req) {
    return this.map.delete(this.keyOf(req))
  }
}

let stores
let listeners

async function loadWorker() {
  stores = new Map()
  listeners = {}
  globalThis.caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache())
      return stores.get(name)
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name) {
      return stores.delete(name)
    },
  }
  globalThis.self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    registration: { showNotification: vi.fn(async () => {}) },
  }
  vi.resetModules()
  await import('../../public/sw.js')
  await import('../../public/push-handler.js')
}

function dispatch(request) {
  let result
  listeners.fetch({ request, respondWith: (value) => { result = value } })
  return result
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  await loadWorker()
})

describe('service worker 缓存策略', () => {
  it('跳过非 GET 与跨域请求', () => {
    expect(dispatch({ method: 'POST', url: 'https://app.test/chats', mode: 'cors' })).toBeUndefined()
    expect(dispatch({ method: 'GET', url: 'https://cdn.example.com/a.png', mode: 'cors' })).toBeUndefined()
  })

  it('assets 命中缓存后不再请求网络', async () => {
    const cache = await caches.open('assets-v1')
    await cache.put('https://app.test/assets/app.js', new Response('cached'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await dispatch({ method: 'GET', url: 'https://app.test/assets/app.js', mode: 'cors' })
    expect(await res.text()).toBe('cached')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('离线导航回退到离线壳', async () => {
    const cache = await caches.open('shell-v1')
    await cache.put('/__offline_shell__', new Response('offline-shell'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const res = await dispatch({ method: 'GET', url: 'https://app.test/chats', mode: 'navigate' })
    expect(await res.text()).toBe('offline-shell')
  })

  it('push 事件展示系统通知', async () => {
    let waited
    listeners.push({
      data: { json: () => ({ title: '甲', body: '你好', url: '/chat/u2' }) },
      waitUntil: (value) => { waited = value },
    })
    await waited
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      '甲',
      expect.objectContaining({ body: '你好', data: { url: '/chat/u2' } }),
    )
  })

  it('激活时清理旧版本缓存', async () => {
    await caches.open('shell-old')
    await caches.open('assets-old')
    await caches.open('shell-v1')
    let activation
    listeners.activate({ waitUntil: (value) => { activation = value } })
    await activation
    expect([...stores.keys()]).toEqual(['shell-v1'])
  })
})
