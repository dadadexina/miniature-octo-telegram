import { describe, expect, it } from 'vitest'

import { LONG_TEXT_PREVIEW_LEN, LONG_TEXT_THRESHOLD, splitLongText } from './longText'

describe('splitLongText', () => {
  it('短文本不判定为长文', () => {
    const res = splitLongText('你好')
    expect(res.isLong).toBe(false)
    expect(res.length).toBe(2)
    expect(res.preview).toBe('你好')
  })

  it('空值安全', () => {
    expect(splitLongText(null).isLong).toBe(false)
    expect(splitLongText(undefined).length).toBe(0)
    expect(splitLongText(42).isLong).toBe(false)
  })

  it('恰好阈值不算长文,超一个字符算', () => {
    const atLimit = 'a'.repeat(LONG_TEXT_THRESHOLD)
    expect(splitLongText(atLimit).isLong).toBe(false)
    expect(splitLongText(`${atLimit}b`).isLong).toBe(true)
  })

  it('长文截取预览并统计全文字数', () => {
    const text = '墨'.repeat(500)
    const res = splitLongText(text)
    expect(res.isLong).toBe(true)
    expect(res.length).toBe(500)
    expect(Array.from(res.preview).length).toBe(LONG_TEXT_PREVIEW_LEN)
  })

  it('按码点计数,表情符号算 1 字', () => {
    const text = '😀'.repeat(201)
    const res = splitLongText(text)
    expect(res.isLong).toBe(true)
    expect(res.length).toBe(201)
  })

  it('支持自定义阈值与预览长度', () => {
    const res = splitLongText('abcdefg', 5, 3)
    expect(res.isLong).toBe(true)
    expect(res.preview).toBe('abc')
    expect(res.length).toBe(7)
  })
})
