-- 修复:一方删除好友后,另一方仍能发消息。
-- 1) can_message 增加「接收方仍持有发送方好友边」的前置条件;任一方删除后反向边消失,消息即不可发送。
-- 2) 新增 unfriend(peer) RPC:成对删除两侧好友边并作废 accepted 请求,
--    避免对方借残留请求补边恢复关系;重新聊天需重新加好友。

create or replace function public.can_message(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select a = b
    or (
      not exists (select 1 from public.blocks bl where bl.blocker_id = b and bl.blocked_id = a)
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
    where status = 'accepted'
      and ((from_id = auth.uid() and to_id = peer)
        or (from_id = peer and to_id = auth.uid()));
end
$fn$;

revoke execute on function public.unfriend(uuid) from public, anon;
grant execute on function public.unfriend(uuid) to authenticated;
