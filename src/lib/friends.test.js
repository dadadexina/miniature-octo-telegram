import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { mapFriend, normalizeRemark, FRIENDS_SQL } = await import('./friends')

describe('mapFriend', () => {
  it('映射 friends 表行', () => {
    const friend = mapFriend({
      owner_id: 'owner-1',
      friend_id: 'friend-1',
      created_at: '2026-01-01T00:00:00Z',
      source: 'phone',
      remark: ' 老李 ',
    })
    expect(friend).toEqual({
      ownerId: 'owner-1',
      friendId: 'friend-1',
      createdAt: '2026-01-01T00:00:00Z',
      source: 'phone',
      remark: '老李',
      hasSource: true,
      hasRemark: true,
    })
  })

  it('备注限制 20 字并去除首尾空白', () => {
    expect(normalizeRemark('  老李  ')).toBe('老李')
    expect(normalizeRemark('字'.repeat(30))).toHaveLength(20)
    expect(normalizeRemark(null)).toBe('')
  })

  it('空行返回 null', () => {
    expect(mapFriend(null)).toBeNull()
  })
})

describe('FRIENDS_SQL', () => {
  it('双方都可读可删好友边', () => {
    expect(FRIENDS_SQL).toContain('grant select, insert, delete on table public.friends to authenticated')
    expect(FRIENDS_SQL).toContain('grant update (remark) on table public.friends to authenticated')
    expect(FRIENDS_SQL).toContain('friends_update_remark_own')
    expect(FRIENDS_SQL).toContain('remark text')
    expect(FRIENDS_SQL).toContain('source text')
    expect(FRIENDS_SQL).toContain('create policy "friends_delete_participant"')
    expect(FRIENDS_SQL).toContain('drop policy if exists "friends_delete_participant"')
    expect(FRIENDS_SQL).toContain('create policy "friends_select_own"')
    expect(FRIENDS_SQL).toContain('drop policy if exists "friends_select_participant"')
    expect(FRIENDS_SQL).toContain('for delete')
    expect(FRIENDS_SQL).toContain('using (auth.uid() in (owner_id, friend_id))')
  })
})
