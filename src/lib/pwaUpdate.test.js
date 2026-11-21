// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { initPwaUpdates } from './pwaUpdate'

function makeEnv({ controller = null } = {}) {
  const listeners = {}
  const winListeners = {}
  const sw = {
    controller,
    addEventListener: vi.fn((type, cb) => {
      listeners[type] = cb
    }),
  }
  const win = {
    location: { reload: vi.fn() },
    sessionStorage: {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
    },
    setInterval: vi.fn(),
    addEventListener: vi.fn((type, cb) => {
      winListeners[type] = cb
    }),
    document: {
      documentElement: { dataset: {} },
      visibilityState: 'visible',
      addEventListener: vi.fn(),
    },
  }
  return { win, nav: { serviceWorker: sw }, listeners, winListeners }
}

describe('initPwaUpdates', () => {
  it('首次访问(无旧控制器)不因接管刷新', () => {
    const { win, nav, listeners } = makeEnv({ controller: null })
    initPwaUpdates(vi.fn(), { win, nav })
    listeners.controllerchange()
    expect(win.location.reload).not.toHaveBeenCalled()
  })

  it('旧控制器被新版本替换时自动刷新', () => {
    const { win, nav, listeners } = makeEnv({ controller: {} })
    initPwaUpdates(vi.fn(), { win, nav })
    listeners.controllerchange()
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(win.sessionStorage.store['wechat-chat-app-v3:sw-reload-at']).toBeTruthy()
  })

  it('通话进行中不刷新,避免中断通话', () => {
    const { win, nav, listeners } = makeEnv({ controller: {} })
    win.document.documentElement.dataset.callActive = '1'
    initPwaUpdates(vi.fn(), { win, nav })
    listeners.controllerchange()
    expect(win.location.reload).not.toHaveBeenCalled()
  })

  it('分块加载失败触发刷新且 10 秒内只刷一次', () => {
    const { win, nav, winListeners } = makeEnv({ controller: {} })
    initPwaUpdates(vi.fn(), { win, nav })
    winListeners['vite:preloadError']({ preventDefault: vi.fn() })
    winListeners['vite:preloadError']({ preventDefault: vi.fn() })
    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('注册后定期检查更新', () => {
    const { win, nav } = makeEnv()
    const register = vi.fn()
    initPwaUpdates(register, { win, nav })
    const opts = register.mock.calls[0][0]
    const registration = { update: vi.fn(() => Promise.resolve()) }
    opts.onRegisteredSW('/sw.js', registration)
    expect(win.setInterval).toHaveBeenCalled()
    const [, interval] = win.setInterval.mock.calls[0]
    expect(interval).toBeGreaterThan(0)
  })
})
