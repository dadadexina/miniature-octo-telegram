import { describe, expect, it } from 'vitest'

import {
  PUBLIC_ID_CHANGE_INTERVAL_MS,
  canChangePublicId,
  isValidPublicId,
  nextPublicIdChangeAt,
  publicIdError,
  randomPublicId,
} from './publicId'

describe('随机唯一 ID', () => {
  it('长度在 8-15 位且只含字母数字,并同时包含两类字符', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = randomPublicId()
      expect(id.length).toBeGreaterThanOrEqual(8)
      expect(id.length).toBeLessThanOrEqual(15)
      expect(id).toMatch(/^[A-Za-z0-9]+$/)
      expect(id).toMatch(/[A-Za-z]/)
      expect(id).toMatch(/[0-9]/)
    }
  })

  it('指定长度时按范围内生成', () => {
    expect(randomPublicId(12)).toHaveLength(12)
    expect(randomPublicId(3)).toHaveLength(8)
    expect(randomPublicId(99)).toHaveLength(15)
  })

  it('随机结果基本不重复', () => {
    const set = new Set(Array.from({ length: 300 }, () => randomPublicId()))
    expect(set.size).toBeGreaterThan(295)
  })
})

describe('ID 格式校验', () => {
  it('接受字母与数字组合的 8-15 位', () => {
    expect(isValidPublicId('abcd1234')).toBe(true)
    expect(isValidPublicId('A1b2C3d4E5f6G7h')).toBe(true)
  })

  it('拒绝过短、过长、下划线、纯字母、纯数字', () => {
    expect(isValidPublicId('abc123')).toBe(false)
    expect(isValidPublicId('a1'.repeat(8))).toBe(false)
    expect(isValidPublicId('abc_1234')).toBe(false)
    expect(isValidPublicId('abcdefgh')).toBe(false)
    expect(isValidPublicId('12345678')).toBe(false)
  })

  it('给出具体错误文案', () => {
    expect(publicIdError('abc')).toContain('8-15')
    expect(publicIdError('abcdefgh')).toContain('同时包含')
    expect(publicIdError('abc_1234')).toContain('只能包含')
    expect(publicIdError('')).toBeTruthy()
  })
})

describe('ID 修改规则', () => {
  const now = new Date('2026-11-21T00:00:00Z').getTime()
  const year = PUBLIC_ID_CHANGE_INTERVAL_MS

  it('首次修改不受限制', () => {
    const profile = { createdAt: new Date(now - 1000).toISOString(), idChangeCount: 0 }
    expect(canChangePublicId(profile, now)).toBe(true)
    expect(nextPublicIdChangeAt(profile, now)).toBe(0)
  })

  it('改过一次后需等注册满一年', () => {
    const createdAt = new Date(now - year / 2).toISOString()
    const profile = { createdAt, idChangeCount: 1, idChangedAt: createdAt }
    expect(canChangePublicId(profile, now)).toBe(false)
    expect(nextPublicIdChangeAt(profile, now)).toBe(new Date(createdAt).getTime() + year)
  })

  it('满一年后可再次修改,之后每年一次', () => {
    const createdAt = new Date(now - year - 1000).toISOString()
    const profile = { createdAt, idChangeCount: 2, idChangedAt: createdAt }
    expect(canChangePublicId(profile, now)).toBe(true)
  })
})
