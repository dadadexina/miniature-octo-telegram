// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
}
chain.select.mockReturnValue(chain)
chain.eq.mockReturnValue(chain)
chain.upsert.mockReturnValue(chain)

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(() => chain) },
}))

const { fetchConversationPrefs, mapConversationPref, upsertConversationPref } = await import('./conversationPrefs')

beforeEach(() => {
  vi.clearAllMocks()
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.upsert.mockReturnValue(chain)
})

describe('conversationPrefs 数据层', () => {
  it('mapConversationPref 归一化布尔值', () => {
    expect(mapConversationPref({ peer_id: 'p1', pinned: 1, muted: 0 })).toEqual({ peerId: 'p1', pinned: true, muted: false })
    expect(mapConversationPref(null)).toBeNull()
  })

  it('fetchConversationPrefs 过滤本人偏好并映射', async () => {
    chain.eq.mockResolvedValueOnce({ data: [{ peer_id: 'p1', pinned: true, muted: false }], error: null })
    const res = await fetchConversationPrefs('me1')
    expect(res.ok).toBe(true)
    expect(res.prefs).toEqual([{ peerId: 'p1', pinned: true, muted: false }])
  })

  it('fetchConversationPrefs 错误时返回 ok:false', async () => {
    chain.eq.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    const res = await fetchConversationPrefs('me1')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('denied')
  })

  it('upsert 使用 onConflict user_id,peer_id 避免重复键 409', async () => {
    chain.maybeSingle.mockResolvedValueOnce({ data: { peer_id: 'p1', pinned: true, muted: true }, error: null })
    const res = await upsertConversationPref({ userId: 'me1', peerId: 'p1', pinned: true, muted: true })
    expect(res.ok).toBe(true)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me1', peer_id: 'p1', pinned: true, muted: true }),
      { onConflict: 'user_id,peer_id' }
    )
  })

  it('upsert 参数缺失返回错误', async () => {
    const res = await upsertConversationPref({ userId: '', peerId: 'p1', pinned: true, muted: false })
    expect(res.ok).toBe(false)
    expect(chain.upsert).not.toHaveBeenCalled()
  })
})
