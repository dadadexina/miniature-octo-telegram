import { describe, expect, it } from 'vitest'

const { filterBlockedMessages, mergeWorldMessages, normalizeWorldMessage, validateWorldMessage, worldChatErrorText, worldChannelLabel, isWorldChannel } =
  await import('./worldChat')

function row(overrides = {}) {
  return {
    id: 12,
    author_id: 'u-1',
    channel: 'world',
    content: 'hello',
    created_at: '2026-11-24T10:00:00.000Z',
    ...overrides,
  }
}

describe('worldChat', () => {
  it('映射消息并统一 id 为字符串', () => {
    const message = normalizeWorldMessage(row())
    expect(message.id).toBe('12')
    expect(message.authorId).toBe('u-1')
    expect(message.content).toBe('hello')
    expect(message.time).toBe(Date.parse('2026-11-24T10:00:00.000Z'))
  })

  it('空行与缺字段返回 null', () => {
    expect(normalizeWorldMessage(null)).toBeNull()
    expect(normalizeWorldMessage({ id: 1 })).toBeNull()
  })

  it('识别频道并使用中文标签', () => {
    expect(isWorldChannel('asia')).toBe(true)
    expect(isWorldChannel('moon')).toBe(false)
    expect(worldChannelLabel('north-america')).toBe('北美')
  })

  it('校验空消息、超长消息与正常消息', () => {
    expect(validateWorldMessage('   ').ok).toBe(false)
    expect(validateWorldMessage('字'.repeat(301)).ok).toBe(false)
    expect(validateWorldMessage(' 你好 ')).toEqual({ ok: true, text: '你好', error: '' })
  })

  it('合并时去重、按时间排序并限量', () => {
    const first = normalizeWorldMessage(row({ id: 1, created_at: '2026-11-24T10:00:00.000Z' }))
    const second = normalizeWorldMessage(row({ id: 2, created_at: '2026-11-24T10:01:00.000Z' }))
    expect(mergeWorldMessages([first], second).map((item) => item.id)).toEqual(['1', '2'])
    expect(mergeWorldMessages([first], { ...first, content: 'edited' })[0].content).toBe('edited')
  })

  it('过滤被屏蔽作者的消息', () => {
    const messages = [
      normalizeWorldMessage(row({ id: 1, author_id: 'a' })),
      normalizeWorldMessage(row({ id: 2, author_id: 'b' })),
    ]
    expect(filterBlockedMessages(messages, new Set(['a'])).map((item) => item.id)).toEqual(['2'])
    expect(filterBlockedMessages(messages, [])).toHaveLength(2)
  })

  it('把数据库错误翻译成中文', () => {
    expect(worldChatErrorText({ message: 'rate_limited' })).toContain('太快')
    expect(worldChatErrorText({ message: 'new_account' })).toContain('30 秒')
    expect(worldChatErrorText({ message: 'boom' })).toBe('boom')
  })
})
