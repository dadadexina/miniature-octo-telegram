// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { from, del, insert } = vi.hoisted(() => ({ from: vi.fn(), del: vi.fn(), insert: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from } }))

const {
  currentPushSubscription,
  disablePush,
  enablePush,
  isPushConfigured,
  isPushSupported,
  urlBase64ToUint8Array,
} = await import('./push')

function deleteChain(result = { error: null }) {
  const second = { eq: vi.fn(async () => result) }
  const first = { eq: vi.fn(() => second) }
  return { eq: vi.fn(() => first) }
}

function stubWorker({ subscription = null } = {}) {
  const ready = {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe: vi.fn(async () => subscription),
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(ready),
      getRegistration: vi.fn(async () => ready),
    },
  })
  return ready
}

const fakeSubscription = {
  endpoint: 'https://push.test/1',
  toJSON: () => ({ endpoint: 'https://push.test/1', keys: { p256dh: 'p256', auth: 'auth' } }),
  unsubscribe: vi.fn(async () => true),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
  from.mockReturnValue({ delete: del, insert })
  del.mockReturnValue(deleteChain())
  insert.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete navigator.serviceWorker
})

describe('urlBase64ToUint8Array', () => {
  it('解码 base64url', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
})

describe('能力检测', () => {
  it('未配置 VAPID 公钥时不可用', () => {
    expect(isPushConfigured()).toBe(true)
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(isPushConfigured()).toBe(false)
  })

  it('缺少 serviceWorker 时判定不支持', () => {
    expect(isPushSupported()).toBe(false)
  })

  it('浏览器不支持时返回 null', async () => {
    delete navigator.serviceWorker
    expect(await currentPushSubscription()).toBeNull()
  })
})

describe('订阅管理', () => {
  it('开启推送写入订阅', async () => {
    stubWorker({ subscription: fakeSubscription })
    const result = await enablePush('u1')
    expect(result).toEqual({ ok: true })
    expect(del).toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      endpoint: 'https://push.test/1',
      p256dh: 'p256',
      auth: 'auth',
      user_agent: expect.any(String),
    })
  })

  it('通知权限被拒绝时不订阅', async () => {
    stubWorker({ subscription: fakeSubscription })
    Notification.requestPermission.mockResolvedValue('denied')
    const result = await enablePush('u1')
    expect(result.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('关闭推送删除订阅并退订', async () => {
    stubWorker({ subscription: fakeSubscription })
    const result = await disablePush('u1')
    expect(result).toEqual({ ok: true })
    expect(del).toHaveBeenCalled()
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled()
  })
})
