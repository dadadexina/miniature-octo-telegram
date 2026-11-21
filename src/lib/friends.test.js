import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { mapFriend, FRIENDS_SQL } = await import('./friends')

describe('mapFriend', () => {
  it('映射 friends 表行', () => {
    const friend = mapFriend({
      owner_id: 'owner-1',
      friend_id: 'friend-1',
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(friend).toEqual({
      ownerId: 'owner-1',
      friendId: 'friend-1',
      createdAt: '2026-01-01T00:00:00Z',
    })
  })

  it('空行返回 null', () => {
    expect(mapFriend(null)).toBeNull()
  })
})

describe('FRIENDS_SQL', () => {
  it('双方都可读可删好友边', () => {
    expect(FRIENDS_SQL).toContain('grant select, insert, delete on table public.friends to authenticated')
    expect(FRIENDS_SQL).toContain('friends_delete_participant')
    expect(FRIENDS_SQL).toContain('friends_select_participant')
    expect(FRIENDS_SQL).toContain('for delete')
    expect(FRIENDS_SQL).toContain('using (auth.uid() in (owner_id, friend_id))')
  })
})
