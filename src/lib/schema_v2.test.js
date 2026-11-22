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

  it('can_message 要求接收方仍持有发送方好友边', () => {
    const fn = UPGRADE_SQL.slice(UPGRADE_SQL.indexOf('create or replace function public.can_message'))
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).toContain('f.owner_id = b and f.friend_id = a')
    expect(body).toContain("r.status = 'accepted'")
  })

  it('can_message 双向拉黑都禁止发消息', () => {
    const fn = UPGRADE_SQL.slice(UPGRADE_SQL.indexOf('create or replace function public.can_message'))
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).toContain('bl.blocker_id = a and bl.blocked_id = b')
    expect(body).toContain('bl.blocker_id = b and bl.blocked_id = a')
  })

  it('unfriend 成对删边并清除双方全部好友请求', () => {
    const at = UPGRADE_SQL.indexOf('create or replace function public.unfriend(peer uuid)')
    expect(at).toBeGreaterThan(-1)
    const fn = UPGRADE_SQL.slice(at)
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).toContain('delete from public.friends')
    expect(body).toContain('delete from public.friend_requests')
    expect(body).toContain('from_id = auth.uid() and to_id = peer')
    expect(body).toContain('from_id = peer and to_id = auth.uid()')
    expect(body).not.toContain("status = 'accepted'")
    expect(UPGRADE_SQL).toContain('grant execute on function public.unfriend(uuid) to authenticated')
  })

  it('heal_friend_pair 仅在 accepted 且未拉黑时补齐两侧好友边', () => {
    const at = UPGRADE_SQL.indexOf('create or replace function public.heal_friend_pair(peer uuid)')
    expect(at).toBeGreaterThan(-1)
    const body = UPGRADE_SQL.slice(at, UPGRADE_SQL.indexOf('$fn$;', at))
    expect(body).toContain("r.status = 'accepted'")
    expect(body).toContain('from public.blocks bl')
    expect(body).toContain('insert into public.friends (owner_id, friend_id) values (auth.uid(), peer)')
    expect(body).toContain('insert into public.friends (owner_id, friend_id) values (peer, auth.uid())')
    expect(UPGRADE_SQL).toContain('grant execute on function public.heal_friend_pair(uuid) to authenticated')
  })

  it('accept_friend_request 原子改状态并双写好友边', () => {
    const at = UPGRADE_SQL.indexOf('create or replace function public.accept_friend_request(request_id uuid)')
    expect(at).toBeGreaterThan(-1)
    const body = UPGRADE_SQL.slice(at, UPGRADE_SQL.indexOf('$fn$;', at))
    expect(body).toContain("to_id = auth.uid() and status = 'pending'")
    expect(body).toContain("set status = 'accepted'")
    expect(body).toContain('values (r.to_id, r.from_id)')
    expect(body).toContain('values (r.from_id, r.to_id)')
    expect(UPGRADE_SQL).toContain('grant execute on function public.accept_friend_request(uuid) to authenticated')
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

  it('位置共享表默认关闭且仅好友可见', () => {
    expect(UPGRADE_SQL).toContain('create table if not exists public.profile_locations')
    expect(UPGRADE_SQL).toContain('visible boolean not null default false')
    const at = UPGRADE_SQL.indexOf('create policy "profile_locations_select_visible"')
    const body = UPGRADE_SQL.slice(at, UPGRADE_SQL.indexOf(';', at))
    expect(body).toContain('user_id = auth.uid()')
    expect(body).toContain('visible = true and public.are_contacts(auth.uid(), user_id)')
  })

  it('每个策略创建前都有同名删除语句', () => {
    const names = [...UPGRADE_SQL.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    for (const name of new Set(names)) {
      expect(UPGRADE_SQL).toContain(`drop policy if exists "${name}"`)
    }
  })
})
