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
  unique (owner_id, friend_id)
);

alter table public.friends add column if not exists remark text;
alter table public.friends add column if not exists source text;

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
end $$;`

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
  // 好友关系是双方各一行,单删一侧会残留反向边,必须成对删除
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
