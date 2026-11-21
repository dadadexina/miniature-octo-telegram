import { describe, expect, it } from 'vitest'
import { applyProfileRow } from './profileMerge'

const ALICE = '331643c8-3e41-49f0-899a-7b1a9ab07770'

describe('applyProfileRow 云端资料合并', () => {
  it('好友头像更新后使用云端最新头像', () => {
    const users = [{ id: ALICE, nickname: '乙', avatarUrl: 'old.png' }]
    const next = applyProfileRow(users, { id: ALICE, nickname: '乙', avatar_url: 'new.png' })
    expect(next[0].avatarUrl).toBe('new.png')
  })

  it('好友清空头像后本地同步回到文字头像', () => {
    const users = [{ id: ALICE, nickname: '乙', avatarUrl: 'old.png' }]
    const next = applyProfileRow(users, { id: ALICE, nickname: '乙', avatar_url: '' })
    expect(next[0].avatarUrl).toBe('')
  })

  it('keepAvatarIfEmpty 时保留本地头像(本人本地暂存场景)', () => {
    const users = [{ id: ALICE, nickname: '乙', avatarUrl: 'data:image/png;base64,xxx' }]
    const next = applyProfileRow(users, { id: ALICE, nickname: '乙', avatar_url: null }, { keepAvatarIfEmpty: true })
    expect(next[0].avatarUrl).toBe('data:image/png;base64,xxx')
  })

  it('未知用户不会凭空出现在本地列表', () => {
    const users = [{ id: ALICE, nickname: '乙', avatarUrl: '' }]
    const next = applyProfileRow(users, { id: 'unknown', nickname: '陌生人', avatar_url: 'x.png' })
    expect(next).toBe(users)
  })

  it('资料无变化时返回原数组,避免无谓重渲染', () => {
    const users = [{ id: ALICE, nickname: '乙', publicId: 'e2e_b', avatarUrl: 'a.png' }]
    const next = applyProfileRow(users, {
      id: ALICE,
      nickname: '乙',
      username: 'e2e_b',
      avatar_url: 'a.png',
    })
    expect(next).toBe(users)
  })

  it('同步性别、签名与注册时间', () => {
    const users = [{ id: ALICE, nickname: '乙', avatarUrl: '' }]
    const next = applyProfileRow(users, {
      id: ALICE,
      nickname: '乙',
      avatar_url: '',
      gender: 'female',
      signature: '见字如面',
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(next[0].gender).toBe('female')
    expect(next[0].signature).toBe('见字如面')
    expect(next[0].createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('昵称与自定义 ID 同步更新,空字段不覆盖本地', () => {
    const users = [{ id: ALICE, nickname: '旧名', publicId: 'old_id', avatarUrl: 'a.png' }]
    const next = applyProfileRow(users, { id: ALICE, nickname: '新名' })
    expect(next[0].nickname).toBe('新名')
    expect(next[0].publicId).toBe('old_id')
    expect(next[0].avatarUrl).toBe('a.png')
  })
})
