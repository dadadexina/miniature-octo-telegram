import { describe, expect, it } from 'vitest'
import { findAuthIdentity } from './identity'

const OLD_ID = '11111111-1111-4111-8111-111111111111'
const NEW_ID = '22222222-2222-4222-8222-222222222222'

describe('findAuthIdentity', () => {
  it('同 id 直接复用本地记录', () => {
    const users = [{ id: OLD_ID, email: 'a@b.com', nickname: '旧' }]
    expect(findAuthIdentity(users, { id: OLD_ID, email: 'a@b.com' })?.nickname).toBe('旧')
  })

  it('同邮箱但 id 不同(注销后重新注册)不复用旧资料', () => {
    const users = [{ id: OLD_ID, email: 'a@b.com', nickname: '旧', avatarUrl: 'old.png' }]
    expect(findAuthIdentity(users, { id: NEW_ID, email: 'a@b.com' })).toBeNull()
  })

  it('本地演示账号可通过邮箱复用', () => {
    const users = [{ id: 'u_demo_xiaoming', email: 'demo@local', nickname: '小明' }]
    expect(findAuthIdentity(users, { id: NEW_ID, email: 'DEMO@local' })?.id).toBe('u_demo_xiaoming')
  })

  it('空输入安全返回 null', () => {
    expect(findAuthIdentity(null, { id: NEW_ID })).toBeNull()
    expect(findAuthIdentity([], null)).toBeNull()
  })
})
