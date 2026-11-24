-- 世界频道一期：公开文字聊天、限流、7 天留存与举报屏蔽约束。

-- ============ 世界频道（一期：公共文字聊天，不含好友关系） ============

create table if not exists public.world_messages (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'world',
  content text not null,
  created_at timestamptz not null default now(),
  constraint world_messages_channel_check check (
    channel in ('world', 'asia', 'europe', 'africa', 'north-america', 'south-america', 'oceania', 'antarctica')
  ),
  constraint world_messages_content_check check (char_length(content) between 1 and 300)
);

create index if not exists world_messages_channel_created_idx
  on public.world_messages (channel, created_at desc);
create index if not exists world_messages_created_idx
  on public.world_messages (created_at);

alter table public.world_messages enable row level security;
alter table public.world_messages replica identity full;

create or replace function public.world_chat_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select not exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = auth.uid() and bl.blocked_id = target)
       or (bl.blocker_id = target and bl.blocked_id = auth.uid())
  )
$fn$;

revoke execute on function public.world_chat_visible(uuid) from public, anon;
grant execute on function public.world_chat_visible(uuid) to authenticated;

drop policy if exists "world_messages_select_visible" on public.world_messages;
create policy "world_messages_select_visible"
on public.world_messages for select
to authenticated
using (
  created_at > now() - interval '7 days'
  and public.world_chat_visible(author_id)
);

revoke all on table public.world_messages from anon, authenticated;
grant select on table public.world_messages to authenticated;

create or replace function public.send_world_message(p_channel text, p_content text)
returns public.world_messages
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  ch text := lower(btrim(coalesce(p_channel, '')));
  body text := btrim(coalesce(p_content, ''));
  recent_ten integer := 0;
  recent_minute integer := 0;
  account_created timestamptz;
  created_row public.world_messages;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if ch not in ('world', 'asia', 'europe', 'africa', 'north-america', 'south-america', 'oceania', 'antarctica') then
    raise exception 'bad_channel';
  end if;
  if body = '' then
    raise exception 'empty_content';
  end if;
  if char_length(body) > 300 then
    raise exception 'content_too_long';
  end if;

  select u.created_at into account_created from auth.users u where u.id = me;
  if account_created is not null and account_created > now() - interval '30 seconds' then
    raise exception 'new_account';
  end if;

  select count(*) into recent_ten
  from public.world_messages
  where author_id = me and created_at > now() - interval '10 seconds';
  if recent_ten >= 5 then
    raise exception 'rate_limited';
  end if;

  select count(*) into recent_minute
  from public.world_messages
  where author_id = me and created_at > now() - interval '1 minute';
  if recent_minute >= 30 then
    raise exception 'rate_limited';
  end if;

  delete from public.world_messages where created_at < now() - interval '7 days';

  insert into public.world_messages (author_id, channel, content)
  values (me, ch, body)
  returning * into created_row;
  return created_row;
end
$fn$;

revoke execute on function public.send_world_message(text, text) from public, anon;
grant execute on function public.send_world_message(text, text) to authenticated;

do $fn$
begin
  alter publication supabase_realtime add table public.world_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$fn$;
