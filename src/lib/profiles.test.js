import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { isMissingColumn, mapProfile } = await import('./profiles')

describe('isMissingColumn', () => {
  it('识别 PostgREST PGRST204 单引号文案', () => {
    const error = { message: "Could not find the 'nickname' column of 'profiles' in the schema cache" }
    expect(isMissingColumn(error, 'nickname')).toBe(true)
    expect(isMissingColumn(error, 'username')).toBe(false)
  })

  it('识别双引号与 does not exist 文案', () => {
    expect(isMissingColumn({ message: 'column "display_name" not found' }, 'display_name')).toBe(true)
    expect(isMissingColumn({ details: 'name does not exist' }, 'name')).toBe(true)
  })

  it('大小写不敏感且空错误不崩溃', () => {
    expect(isMissingColumn({ message: "COULD NOT FIND THE 'Name' COLUMN" }, 'name')).toBe(true)
    expect(isMissingColumn(null, 'name')).toBe(false)
  })
})

describe('mapProfile', () => {
  it('按优先级挑选昵称与用户名', () => {
    const p = mapProfile({ id: 'u1', nickname: '甲', username: 'abc' })
    expect(p.nickname).toBe('甲')
    expect(p.username).toBe('abc')
  })

  it('兼容 display_name / custom_id 旧列', () => {
    const p = mapProfile({ id: 'u2', display_name: '乙', custom_id: 'xyz' })
    expect(p.nickname).toBe('乙')
    expect(p.username).toBe('xyz')
  })

  it('空行返回 null', () => {
    expect(mapProfile(null)).toBeNull()
  })
})
