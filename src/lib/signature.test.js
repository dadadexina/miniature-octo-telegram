// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SIGNATURE_MAX,
  loadLocalSignature,
  normalizeSignature,
  saveLocalSignature,
} from './signature'

beforeEach(() => {
  localStorage.clear()
})

describe('normalizeSignature', () => {
  it('压缩空白并去掉首尾空格', () => {
    expect(normalizeSignature('  见字\n如面  ')).toBe('见字 如面')
  })

  it('最多保留 30 字', () => {
    expect(normalizeSignature('字'.repeat(40))).toHaveLength(SIGNATURE_MAX)
  })

  it('按字符簇截断,不劈开 emoji', () => {
    const result = normalizeSignature('😀'.repeat(SIGNATURE_MAX + 5))
    expect(Array.from(result)).toHaveLength(SIGNATURE_MAX)
    expect(result.includes('\uFFFD')).toBe(false)
  })

  it('空值返回空串', () => {
    expect(normalizeSignature(null)).toBe('')
    expect(normalizeSignature(undefined)).toBe('')
  })
})

describe('个性签名本地存储', () => {
  it('保存后可读取', () => {
    saveLocalSignature('u1', ' 云上见 ')
    expect(loadLocalSignature('u1')).toBe('云上见')
  })

  it('不同用户互不影响', () => {
    saveLocalSignature('u1', '甲')
    saveLocalSignature('u2', '乙')
    expect(loadLocalSignature('u1')).toBe('甲')
    expect(loadLocalSignature('u2')).toBe('乙')
  })

  it('保存空串会清除签名', () => {
    saveLocalSignature('u1', '甲')
    saveLocalSignature('u1', '')
    expect(loadLocalSignature('u1')).toBe('')
  })

  it('未登录或不存在时返回空串', () => {
    expect(loadLocalSignature('')).toBe('')
    expect(loadLocalSignature('missing')).toBe('')
  })
})
