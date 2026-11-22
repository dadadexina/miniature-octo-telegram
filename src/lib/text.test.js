import { describe, expect, it } from 'vitest'
import { charLength, splitGraphemes, truncateChars } from './text'

describe('text 字符簇工具', () => {
  it('charLength 按字符簇计数,emoji 计为 1', () => {
    expect(charLength('见字如面')).toBe(4)
    expect(charLength('😀')).toBe(1)
    expect(charLength('👨‍👩‍👧‍👦')).toBe(1)
    expect(charLength('')).toBe(0)
    expect(charLength(null)).toBe(0)
  })

  it('truncateChars 不会劈开 emoji 代理对', () => {
    const result = truncateChars('😀😀😀', 2)
    expect(result).toBe('😀😀')
    expect(result.includes('\uFFFD')).toBe(false)
    expect(Array.from(result)).toHaveLength(2)
  })

  it('truncateChars 不会劈开 ZWJ 组合 emoji', () => {
    const family = '👨‍👩‍👧‍👦'
    expect(truncateChars(`${family}${family}`, 1)).toBe(family)
  })

  it('truncateChars 在长度内原样返回', () => {
    expect(truncateChars('见字如面', 10)).toBe('见字如面')
    expect(truncateChars('', 5)).toBe('')
  })

  it('truncateChars 处理 0 与非法上限', () => {
    expect(truncateChars('abc', 0)).toBe('')
    expect(truncateChars('abc', -1)).toBe('')
    expect(truncateChars('abc', undefined)).toBe('')
  })

  it('splitGraphemes 返回字符簇数组', () => {
    expect(splitGraphemes('a😀')).toEqual(['a', '😀'])
  })
})
