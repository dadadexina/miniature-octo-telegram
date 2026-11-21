import { describe, expect, it } from 'vitest'
import { clearAccountStorage } from './accountCleanup'

class FakeStorage {
  constructor(entries) {
    Object.assign(this, entries)
    this.removed = []
  }
  getItem(key) {
    return this[key] ?? null
  }
  setItem(key, value) {
    this[key] = value
  }
  removeItem(key) {
    this.removed.push(key)
    delete this[key]
  }
}

describe('clearAccountStorage', () => {
  it('删除主状态与按用户划分的缓存键', () => {
    const local = new FakeStorage({
      'wechat-chat-app-v3': '{}',
      'wechat-chat-app-v3:unread:u1': '{}',
      'wechat-chat-app-v3:drafts:u1': '{}',
      'other-app': 'keep',
    })
    const session = new FakeStorage({ 'wechat-chat-app-v3:call-tab': 'abc', other: 'keep' })
    clearAccountStorage({ local, session })
    expect(local.removed.sort()).toEqual([
      'wechat-chat-app-v3',
      'wechat-chat-app-v3:drafts:u1',
      'wechat-chat-app-v3:unread:u1',
    ])
    expect(local['other-app']).toBe('keep')
    expect(session.removed).toEqual(['wechat-chat-app-v3:call-tab'])
    expect(session.other).toBe('keep')
  })

  it('存储不可用时不抛错', () => {
    const throwing = new Proxy({}, {
      ownKeys() {
        throw new Error('denied')
      },
    })
    expect(() => clearAccountStorage({ local: throwing, session: null })).not.toThrow()
  })
})
