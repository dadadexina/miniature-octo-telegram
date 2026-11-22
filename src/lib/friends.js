import { isMissingColumn, isPermissionError } from './profiles'
import { supabase } from './supabase'

export const REMARK_MAX = 20

export const FRIENDS_SQL = `create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  friend_id uuid not null,
  created_at timestamptz default now(),
  remark text,
  source text,
  constraint friends_no_self check (owner_id <> friend_id),
  unique (owner_id, friend_id)
);

alter table public.friends add column if not exists remark text;
alter table public.friends add column if not exists source text;

do $$ begin
  alter table public.friends add constraint friends_no_self
    check (owner_id <> friend_id);
exception when duplicate_object then null; when others then
  raise notice '跳过 friends_no_self: %', sqlerrm;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, delete on table public.friends to authenticated;
grant update (remark) on table public.friends to authenticated;

alter table public.friends enable row level security;

-- 只允许读取本人持有的好友边:备注与来源属于私有数据,不能让对方读到
drop policy if exists "friends_select_own" on public.friends;
drop policy if exists "friends_select_participant" on public.friends;
create policy "friends_select_own"
on public.friends for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "friends_insert_own" on public.friends;
create policy "friends_insert_own"
on public.friends for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "friends_update_remark_own" on public.friends;
create policy "friends_update_remark_own"
on public.friends for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "friends_delete_own" on public.friends;
drop policy if exists "friends_delete_participant" on public.friends;
create policy "friends_delete_participant"
on public.friends for delete
to authenticated
using (auth.uid() in (owner_id, friend_id));

create index if not exists friends_owner_idx on public.friends (owner_id);
create index if not exists friends_friend_idx on public.friends (friend_id);

do $$ begin
  alter table public.friends add constraint friends_owner_fk
    foreign key (owner_id) references auth.users (id) on delete cascade;
exception when duplicate_object then null; when others then
  raise notice '跳过 friends_owner_fk: %', sqlerrm;
end $$;

do $$ begin
  alter table public.friends add constraint friends_friend_fk
    foreign key (friend_id) references auth.users (id) on delete cascade;
exception when duplicate_object then null; when others then
  raise notice '跳过 friends_friend_fk: %', sqlerrm;
end $$;

-- 删除好友:成对删除两侧好友边,并清除该对之间的全部好友请求。
-- 清空请求后双方都无法再发消息,也无法借残留请求补边恢复关系,重新聊天需重新加好友。
create or replace function public.unfriend(peer uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or peer is null or peer = auth.uid() then
    raise exception 'invalid unfriend target';
  end if;
  delete from public.friends
    where (owner_id = auth.uid() and friend_id = peer)
       or (owner_id = peer and friend_id = auth.uid());
  delete from public.friend_requests
    where (from_id = auth.uid() and to_id = peer)
       or (from_id = peer and to_id = auth.uid());
end
$fn$;

revoke execute on function public.unfriend(uuid) from public, anon;
grant execute on function public.unfriend(uuid) to authenticated;

-- 补好友边:仅在同一对存在 accepted 请求且双方未拉黑时,由服务端补齐两侧好友边。
-- 删除好友会作废请求,因此不会借补边逻辑恢复已解除的关系。
create or replace function public.heal_friend_pair(peer uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or peer is null or peer = auth.uid() then return; end if;
  if not exists (
    select 1 from public.friend_requests r
    where r.status = 'accepted'
      and ((r.from_id = auth.uid() and r.to_id = peer)
        or (r.from_id = peer and r.to_id = auth.uid()))
  ) then return; end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = auth.uid() and bl.blocked_id = peer)
       or (bl.blocker_id = peer and bl.blocked_id = auth.uid())
  ) then return; end if;
  insert into public.friends (owner_id, friend_id) values (auth.uid(), peer)
    on conflict (owner_id, friend_id) do nothing;
  insert into public.friends (owner_id, friend_id) values (peer, auth.uid())
    on conflict (owner_id, friend_id) do nothing;
end
$fn$;

revoke execute on function public.heal_friend_pair(uuid) from public, anon;
grant execute on function public.heal_friend_pair(uuid) to authenticated;`

export function normalizeRemark(value) {
  return String(value || '').trim().slice(0, REMARK_MAX)
}

export function mapFriend(row) {
  if (!row) return null
  return {
    ownerId: row.owner_id || '',
    friendId: row.friend_id || '',
    createdAt: row.created_at || '',
    source: row.source || '',
    remark: normalizeRemark(row.remark),
    hasSource: Object.prototype.hasOwnProperty.call(row, 'source'),
    hasRemark: Object.prototype.hasOwnProperty.call(row, 'remark'),
  }
}

export async function fetchFriends(meId) {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .eq('owner_id', meId)
  if (error) {
    return { ok: false, error: error.message, friends: [], permission: isPermissionError(error) }
  }
  return { ok: true, friends: (data || []).map(mapFriend) }
}

export async function upsertFriend(meId, friendId, meta = {}) {
  const payload = { owner_id: meId, friend_id: friendId }
  if (meta.source) payload.source = meta.source
  let { error } = await supabase
    .from('friends')
    .upsert(payload, { ignoreDuplicates: true, onConflict: 'owner_id,friend_id' })
  if (error && isMissingColumn(error, 'source')) {
    const retry = await supabase
      .from('friends')
      .upsert({ owner_id: meId, friend_id: friendId }, { ignoreDuplicates: true, onConflict: 'owner_id,friend_id' })
    error = retry.error
  }
  if (error) {
    return { ok: false, error: error.message, permission: isPermissionError(error) }
  }
  return { ok: true }
}

export async function updateFriendRemark(meId, friendId, remark) {
  const value = normalizeRemark(remark)
  const { error } = await supabase
    .from('friends')
    .update({ remark: value })
    .eq('owner_id', meId)
    .eq('friend_id', friendId)
  if (!error) return { ok: true, remark: value }
  if (isMissingColumn(error, 'remark')) {
    return {
      ok: false,
      localOnly: true,
      error: '云端好友表缺少 remark 列，备注已仅保存在本机，请执行云初始化 SQL 升级',
    }
  }
  return { ok: false, error: error.message || '保存备注失败', permission: isPermissionError(error) }
}

export async function deleteFriend(meId, friendId) {
  // 优先走 unfriend RPC:成对删除两侧好友边并作废 accepted 请求,
  // 作废请求后双方都无法再发消息,也无法借残留请求补边恢复关系。
  try {
    const rpc = await supabase.rpc('unfriend', { peer: friendId })
    if (rpc && !rpc.error) return { ok: true }
    if (rpc?.error) {
      const message = String(rpc.error.message || '').toLowerCase()
      const missing =
        rpc.error.code === 'PGRST202' ||
        message.includes('could not find the function') ||
        message.includes('does not exist')
      if (!missing) {
        return { ok: false, error: rpc.error.message, permission: isPermissionError(rpc.error) }
      }
    }
  } catch {
    // RPC 调用异常时退回直接成对删除
  }
  // 旧库未部署 unfriend RPC 时的兜底:好友关系是双方各一行,必须成对删除
  const pair = `and(owner_id.eq.${meId},friend_id.eq.${friendId}),and(owner_id.eq.${friendId},friend_id.eq.${meId})`
  const { error } = await supabase
    .from('friends')
    .delete()
    .or(pair)
  if (error) {
    return { ok: false, error: error.message, permission: isPermissionError(error) }
  }
  return { ok: true }
}

// 补好友边:仅当同一对存在 accepted 请求且双方未拉黑时,由服务端补齐两侧好友边。
// 删除好友会作废请求,因此不会借补边逻辑恢复已解除的关系。
export async function healFriendPair(meId, peerId) {
  if (!meId || !peerId || meId === peerId) return { ok: false, error: '参数错误' }
  try {
    const rpc = await supabase.rpc('heal_friend_pair', { peer: peerId })
    if (rpc && !rpc.error) return { ok: true }
    if (rpc?.error) {
      const message = String(rpc.error.message || '').toLowerCase()
      const missing =
        rpc.error.code === 'PGRST202' ||
        message.includes('could not find the function') ||
        message.includes('does not exist')
      if (!missing) {
        return { ok: false, error: rpc.error.message, permission: isPermissionError(rpc.error) }
      }
    }
  } catch {
    // 旧库无 RPC 时退回只补自己这一行
  }
  const result = await upsertFriend(meId, peerId)
  return { ok: result.ok, error: result.error, permission: result.permission }
}

// 收到陌生人消息时,如果双方存在 accepted 请求,说明只是好友边缺了一侧,
// 补写好友边让好友列表与消息保持一致。
export async function repairFriendEdgeFromAccepted(meId, peerId, deps = {}) {
  if (!meId || !peerId || meId === peerId) return { ok: false }
  const findAccepted =
    deps.findAccepted ||
    (async (a, b) => {
      const pair = `and(from_id.eq.${a},to_id.eq.${b}),and(from_id.eq.${b},to_id.eq.${a})`
      const { data, error } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .or(pair)
        .limit(1)
      if (error) return { ok: false, found: false }
      return { ok: true, found: (data || []).length > 0 }
    })
  const ensure = deps.ensure || healFriendPair
  const accepted = await findAccepted(meId, peerId)
  if (!accepted?.ok || !accepted.found) return { ok: false }
  return ensure(meId, peerId)
}
