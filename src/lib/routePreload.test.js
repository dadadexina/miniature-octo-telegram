import { describe, expect, it } from 'vitest'
import { resolveRouteKey } from './routePreload'

describe('resolveRouteKey', () => {
  it.each([
    ['/', 'chats'],
    ['/chats', 'chats'],
    ['/contacts', 'contacts'],
    ['/me', 'me'],
    ['/login', 'login'],
    ['/settings', 'settings'],
    ['/profile/edit', 'editProfile'],
    ['/reset-password', 'resetPassword'],
    ['/legal/terms', 'legal'],
    ['/legal/privacy', 'legal'],
    ['/chat/peer-1', 'chat'],
    ['/friend/user-1', 'friend'],
    ['/friend/user-1/moments', 'friendMoments'],
  ])('%s 对应 %s', (path, key) => {
    expect(resolveRouteKey(path)).toBe(key)
  })

  it('忽略查询参数与哈希', () => {
    expect(resolveRouteKey('/chat/peer-1?from=chats#top')).toBe('chat')
  })

  it('未知路径不预加载', () => {
    expect(resolveRouteKey('/unknown')).toBeNull()
    expect(resolveRouteKey('')).toBeNull()
  })
})
