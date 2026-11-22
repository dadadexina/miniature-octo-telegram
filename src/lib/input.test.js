import { describe, expect, it } from 'vitest'
import { inputValue, isComposing } from './input'

const digitsOnly = (v) => v.replace(/\D/g, '')

describe('input 组合输入保护', () => {
  it('组合输入期间保留原始文本', () => {
    const event = { target: { value: 'zhong1文' }, nativeEvent: { isComposing: true } }
    expect(inputValue(event, digitsOnly)).toBe('zhong1文')
  })

  it('组合结束后套用过滤规则', () => {
    const event = { target: { value: 'a1b2' }, nativeEvent: { isComposing: false } }
    expect(inputValue(event, digitsOnly)).toBe('12')
  })

  it('兼容 event.isComposing 直接标记', () => {
    expect(isComposing({ isComposing: true })).toBe(true)
    expect(isComposing({ target: { value: '' } })).toBe(false)
  })

  it('缺少 event 时返回空字符串', () => {
    expect(inputValue(undefined, digitsOnly)).toBe('')
  })
})
