import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const {
  groupConversations,
  involvesUser,
  isPairMessage,
  isUuid,
  mapMessage,
  mergeMessages,
  peerIdOf,
} = await import('./messages')

function row(overrides = {}) {
  return {
    id: 'm1',
    sender_id: 'a',
    receiver_id: 'b',
    content: '你好',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isUuid', () => {
  it('识别 UUID 与非 UUID', () => {
    expect(isUuid('34658af4-2ba4-46ef-9e2b-cd62a6f44b01')).toBe(true)
    expect(isUuid('u_demo_xiaoming')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})

describe('mapMessage', () => {
  it('映射 messages 表行为内部消息结构', () => {
    const msg = mapMessage(row())
    expect(msg.fromId).toBe('a')
    expect(msg.toId).toBe('b')
    expect(msg.text).toBe('你好')
    expect(msg.time).toBe(new Date('2026-01-01T00:00:00.000Z').getTime())
  })

  it('空行返回 null', () => {
    expect(mapMessage(null)).toBeNull()
  })

  it('透传 reply_to_id 为 replyToId', () => {
    expect(mapMessage(row({ reply_to_id: 42 })).replyToId).toBe(42)
    expect(mapMessage(row()).replyToId).toBe('')
  })
})

describe('involvesUser / peerIdOf / isPairMessage', () => {
  const msg = mapMessage(row())

  it('判断消息相关性与对端', () => {
    expect(involvesUser(msg, 'a')).toBe(true)
    expect(involvesUser(msg, 'c')).toBe(false)
    expect(peerIdOf(msg, 'a')).toBe('b')
    expect(peerIdOf(msg, 'b')).toBe('a')
    expect(peerIdOf(msg, 'c')).toBe('a')
    expect(isPairMessage(msg, 'a', 'b')).toBe(true)
    expect(isPairMessage(msg, 'b', 'a')).toBe(true)
    expect(isPairMessage(msg, 'a', 'c')).toBe(false)
  })
})

describe('mergeMessages', () => {
  it('去重并按时间升序', () => {
    const a = { id: '1', time: 200 }
    const b = { id: '2', time: 100 }
    const merged = mergeMessages([a], [a, b, { id: '' }])
    expect(merged.map((m) => m.id)).toEqual(['2', '1'])
  })
})

describe('groupConversations', () => {
  it('每个对端取最新一条并按时间倒序', () => {
    const msgs = [
      mapMessage(row({ id: '1', sender_id: 'me', receiver_id: 'b', created_at: '2026-01-01T00:00:00Z' })),
      mapMessage(row({ id: '2', sender_id: 'b', receiver_id: 'me', content: '最新', created_at: '2026-01-02T00:00:00Z' })),
      mapMessage(row({ id: '3', sender_id: 'me', receiver_id: 'c', created_at: '2026-01-03T00:00:00Z' })),
    ]
    const grouped = groupConversations('me', msgs)
    expect(grouped.map((g) => g.peerId)).toEqual(['c', 'b'])
    expect(grouped[1].last.text).toBe('最新')
  })
})
