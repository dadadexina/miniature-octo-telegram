-- 安全加固:
-- 1) can_view_profile 只在存在 accepted 好友请求(或双向好友边)时开放,防止仅凭残留请求读取资料。
-- 2) friends_insert_reciprocal 要求 accepted 请求,堵住单方面伪造双向好友边。
-- 3) 移除 messages 的硬删除策略,软删统一走 soft_delete_pair_messages RPC,避免误删对方消息。

create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select viewer = target
    or public.are_contacts(viewer, target)
    or exists (
      select 1 from public.friend_requests r
      where r.status = 'accepted'
        and ((r.from_id = viewer and r.to_id = target)
          or (r.from_id = target and r.to_id = viewer))
    )
$fn$;

revoke execute on function public.can_view_profile(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;

drop policy if exists "friends_insert_reciprocal" on public.friends;
create policy "friends_insert_reciprocal" on public.friends for insert
to authenticated
with check (
  auth.uid() = friend_id
  and exists (
    select 1 from public.friend_requests r
    where r.status = 'accepted'
      and ((r.from_id = auth.uid() and r.to_id = public.friends.owner_id)
        or (r.from_id = public.friends.owner_id and r.to_id = auth.uid()))
  )
);

drop policy if exists "messages_delete_pair" on public.messages;
