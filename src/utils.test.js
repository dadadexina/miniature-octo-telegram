import { describe, expect, it } from 'vitest'
import { displayId, formatChatTime, formatRelativeTime, formatTime, quoteExcerpt, shortId } from './utils'

describe('formatChatTime', () => {
  it('格式化为 时:分', () => {
    const ts = new Date(2026, 4, 20, 9, 5).getTime()
    expect(formatChatTime(ts)).toBe('09:05')
  })

  it('空值返回空字符串', () => {
    expect(formatChatTime(0)).toBe('')
  })
})

describe('formatTime', () => {
  it('当天只显示 时:分', () => {
    const now = new Date()
    const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30).getTime()
    expect(formatTime(ts)).toBe('23:30')
  })

  it('昨天前缀显示', () => {
    const yes = new Date()
    yes.setDate(yes.getDate() - 1)
    const ts = new Date(yes.getFullYear(), yes.getMonth(), yes.getDate(), 8, 0).getTime()
    expect(formatTime(ts)).toBe('昨天 08:00')
  })
})

describe('formatRelativeTime', () => {
  it('分钟与小时相对时间', () => {
    const now = Date.now()
    expect(formatRelativeTime(now - 30 * 1000)).toBe('刚刚')
    expect(formatRelativeTime(now - 5 * 60 * 1000)).toBe('5分钟前')
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000)).toBe('3小时前')
  })
})

describe('shortId / displayId', () => {
  it('demo  id 去除前缀', () => {
    expect(shortId('u_demo_xiaoming')).toBe('xiaoming')
    expect(shortId('abc')).toBe('abc')
  })

  it('优先展示 publicId', () => {
    expect(displayId({ publicId: 'abc123', id: 'u_1' })).toBe('abc123')
    expect(displayId({ publicId: '', id: 'u_demo_xiaohong' })).toBe('xiaohong')
    expect(displayId(null)).toBe('')
  })
})

describe('quoteExcerpt', () => {
  it('压缩空白并截断超长文本', () => {
    expect(quoteExcerpt('a\n\nb   c')).toBe('a b c')
    const long = 'x'.repeat(50)
    const out = quoteExcerpt(long)
    expect(out.length).toBe(41)
    expect(out.endsWith('…')).toBe(true)
    expect(quoteExcerpt('短文本')).toBe('短文本')
    expect(quoteExcerpt('', 10)).toBe('')
  })
})
