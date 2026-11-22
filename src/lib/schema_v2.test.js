import { describe, expect, it } from 'vitest'
import { UPGRADE_SQL } from './schema_v2'

describe('UPGRADE_SQL 幂等性', () => {
  it('重建 search_profile 前先删除旧返回类型', () => {
    const dropAt = UPGRADE_SQL.indexOf('drop function if exists public.search_profile(text)')
    const createAt = UPGRADE_SQL.indexOf('create or replace function public.search_profile')
    expect(dropAt).toBeGreaterThan(-1)
    expect(createAt).toBeGreaterThan(dropAt)
    expect(UPGRADE_SQL.match(/create or replace function public\.search_profile/g)).toHaveLength(1)
  })

  it('can_view_moment 排除双向拉黑', () => {
    expect(UPGRADE_SQL).toContain('create or replace function public.can_view_moment(mid uuid)')
    expect(UPGRADE_SQL).toContain('from public.blocks bl')
    expect(UPGRADE_SQL).toContain('bl.blocker_id = auth.uid() and bl.blocked_id = m.author_id')
    expect(UPGRADE_SQL).toContain('bl.blocker_id = m.author_id and bl.blocked_id = auth.uid()')
  })

  it('can_message 容忍单边好友(历史脏数据)', () => {
    const fn = UPGRADE_SQL.slice(UPGRADE_SQL.indexOf('create or replace function public.can_message'))
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).toContain('public.are_contacts(a, b)')
    expect(body).toContain("r.status = 'accepted'")
    expect(body).toContain('f.owner_id = a and f.friend_id = b')
  })

  it('can_view_profile 仅对已接受关系开放', () => {
    const fn = UPGRADE_SQL.slice(UPGRADE_SQL.indexOf('create or replace function public.can_view_profile'))
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).toContain("r.status = 'accepted'")
  })

  it('friends_insert_reciprocal 要求存在已接受请求', () => {
    const at = UPGRADE_SQL.indexOf('create policy "friends_insert_reciprocal"')
    const body = UPGRADE_SQL.slice(at, at + 600)
    expect(body).toContain("r.status = 'accepted'")
  })

  it('不提供消息硬删除策略，软删只走 RPC', () => {
    expect(UPGRADE_SQL).not.toContain('create policy "messages_delete_pair"')
  })

  it('关系判定函数仅授权 authenticated', () => {    const signatures = [
      'public.are_contacts(uuid, uuid)',
      'public.can_view_profile(uuid, uuid)',
      'public.can_message(uuid, uuid)',
      'public.can_view_moment(uuid)',
    ]
    for (const sig of signatures) {
      expect(UPGRADE_SQL).toContain(`revoke execute on function ${sig} from public, anon`)
      expect(UPGRADE_SQL).toContain(`grant execute on function ${sig} to authenticated`)
    }
  })

  it('每个策略创建前都有同名删除语句', () => {
    const names = [...UPGRADE_SQL.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    for (const name of new Set(names)) {
      expect(UPGRADE_SQL).toContain(`drop policy if exists "${name}"`)
    }
  })
})
