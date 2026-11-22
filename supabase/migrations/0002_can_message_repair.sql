-- 修复:好友关系只有单边 friends 行时,can_message 判否导致发消息失败。
-- 有 accepted 好友请求且至少还有一边好友边,即视为可发消息;彻底互删后两边都不存在,不受影响。
create or replace function public.can_message(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select a = b
    or (
      not exists (select 1 from public.blocks bl where bl.blocker_id = b and bl.blocked_id = a)
      and (
        public.are_contacts(a, b)
        or (
          exists (select 1 from public.friends f where f.owner_id = a and f.friend_id = b)
          and exists (
            select 1 from public.friend_requests r
            where r.status = 'accepted'
              and ((r.from_id = a and r.to_id = b) or (r.from_id = b and r.to_id = a))
          )
        )
      )
    )
$fn$;

revoke execute on function public.can_message(uuid, uuid) from public, anon;
grant execute on function public.can_message(uuid, uuid) to authenticated;
