// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  addSourceLabel,
  formatRegistrationDate,
  genderLabel,
  normalizeGender,
  registrationDays,
} from './profileMeta'

describe('profileMeta', () => {
  it('性别仅接受男/女/保密，非法值回退保密', () => {
    expect(normalizeGender('male')).toBe('male')
    expect(normalizeGender('female')).toBe('female')
    expect(normalizeGender('secret')).toBe('secret')
    expect(normalizeGender('other')).toBe('secret')
    expect(normalizeGender()).toBe('secret')
  })

  it('性别文案与加好友方式文案', () => {
    expect(genderLabel('male')).toBe('男')
    expect(genderLabel('female')).toBe('女')
    expect(genderLabel(undefined)).toBe('保密')
    expect(addSourceLabel('id')).toBe('通过搜索 ID 添加')
    expect(addSourceLabel('email')).toBe('通过邮箱搜索添加')
    expect(addSourceLabel('phone')).toBe('通过手机号搜索添加')
    expect(addSourceLabel('recommend')).toBe('通过推荐好友添加')
    expect(addSourceLabel('')).toBe('未知')
  })

  it('注册当天算第 1 天，跨日累加', () => {
    const created = '2026-11-21T23:30:00'
    expect(registrationDays(created, new Date('2026-11-21T01:00:00').getTime())).toBe(1)
    expect(registrationDays(created, new Date('2026-11-22T09:00:00').getTime())).toBe(2)
    expect(registrationDays(created, new Date('2026-12-01T09:00:00').getTime())).toBe(11)
  })

  it('注册时间非法或缺失返回 null', () => {
    expect(registrationDays('')).toBeNull()
    expect(registrationDays('not-a-date')).toBeNull()
  })

  it('注册日期格式化为中文日期', () => {
    expect(formatRegistrationDate('2026-11-21T10:00:00')).toBe('2026年11月21日')
    expect(formatRegistrationDate('')).toBe('')
    expect(formatRegistrationDate('bad')).toBe('')
  })
})
