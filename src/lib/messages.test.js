import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const {
  escapeLikePattern,
  groupConversations,
  involvesUser,
  isPairMessage,
  isUuid,
  mapMessage,
  mergeMessages,
  parseAttachments,
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

  it('attachments 为对象时透传,行缺失时为 null', () => {
    const att = { type: 'image', path: 'p/q.jpg', width: 10, height: 20 }
    expect(mapMessage(row({ attachments: att })).attachments).toEqual(att)
    expect(mapMessage(row()).attachments).toBeNull()
  })
})

describe('parseAttachments', () => {
  it('对象直接返回', () => {
    const att = { type: 'image', path: 'a.jpg' }
    expect(parseAttachments(att)).toBe(att)
  })

  it('合法 JSON 字符串解析为对象', () => {
    expect(parseAttachments('{"type":"image","path":"a.jpg"}')).toEqual({ type: 'image', path: 'a.jpg' })
  })

  it('空值、坏 JSON、非对象值返回 null', () => {
    expect(parseAttachments(null)).toBeNull()
    expect(parseAttachments('')).toBeNull()
    expect(parseAttachments('{bad json')).toBeNull()
    expect(parseAttachments('123')).toBeNull()
    expect(parseAttachments(42)).toBeNull()
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

describe('escapeLikePattern', () => {
  it('转义 LIKE 通配符', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('50,off')).toBe('50,off')
    expect(escapeLikePattern('')).toBe('')
    expect(escapeLikePattern(null)).toBe('')
  })
})
