-- 深度修复好友双方发消息链路:
-- 1) can_message 的拉黑判断改为双向:任一方拉黑,双方都不能再发消息。
-- 2) unfriend 清除该对之间的全部好友请求(含 pending/declined/canceled),
--    避免残留请求被补边逻辑利用。
-- 3) 新增 heal_friend_pair(peer) RPC:存在 accepted 请求且双方未拉黑时,
--    由服务端补齐两侧好友边,修复旧数据单边好友导致的消息发送失败。
-- 4) 新增 accept_friend_request(request_id) RPC:原子完成「改状态 + 双写好友边」,
--    避免接受过程中途失败只写入一侧关系。

create or replace function public.can_message(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select a = b
    or (
      not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = a and bl.blocked_id = b)
           or (bl.blocker_id = b and bl.blocked_id = a)
      )
      -- 接收方必须仍把发送方当好友:任一方删除后,反向边消失,消息即不可发送
      and exists (select 1 from public.friends f where f.owner_id = b and f.friend_id = a)
      and (
        public.are_contacts(a, b)
        or exists (
          select 1 from public.friend_requests r
          where r.status = 'accepted'
            and ((r.from_id = a and r.to_id = b) or (r.from_id = b and r.to_id = a))
        )
      )
    )
$fn$;

revoke execute on function public.can_message(uuid, uuid) from public, anon;
grant execute on function public.can_message(uuid, uuid) to authenticated;

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
grant execute on function public.heal_friend_pair(uuid) to authenticated;

create or replace function public.accept_friend_request(request_id uuid)
returns public.friend_requests language plpgsql security definer set search_path = public as $fn$
declare
  r public.friend_requests;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  select * into r
    from public.friend_requests
   where id = request_id and to_id = auth.uid() and status = 'pending'
   for update;
  if not found then
    raise exception 'request not available';
  end if;
  update public.friend_requests
     set status = 'accepted', updated_at = now()
   where id = r.id
   returning * into r;
  insert into public.friends (owner_id, friend_id) values (r.to_id, r.from_id)
    on conflict (owner_id, friend_id) do nothing;
  insert into public.friends (owner_id, friend_id) values (r.from_id, r.to_id)
    on conflict (owner_id, friend_id) do nothing;
  return r;
end
$fn$;

revoke execute on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;
