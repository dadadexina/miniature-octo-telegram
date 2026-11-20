import { FRIENDS_SQL } from './friends'
import { supabaseUrl } from './supabase'
import { CLIENT_ERRORS_SQL } from './telemetry'

function deriveSqlEditorUrl(url) {
  const match = /^https:\/\/([^.]+)\.supabase\.co$/.exec(url || '')
  return match
    ? `https://supabase.com/dashboard/project/${match[1]}/sql/new`
    : 'https://supabase.com/dashboard'
}

export const SQL_EDITOR_URL = deriveSqlEditorUrl(supabaseUrl)

export const CLOUD_SQL = `-- 纸墨信笺 · Supabase 初始化脚本（整体可重复执行）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  username text unique,
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  content text not null,
  created_at timestamptz default now()
);

-- 旧版表结构规范化：补齐缺失列
alter table public.profiles add column if not exists nickname text not null default '';
alter table public.profiles add column if not exists username text;
alter table public.messages add column if not exists content text;

-- 解除旧外键（messages 已直接约束到 auth.users；旧外键指向 profiles 会拦截未建资料用户的消息）
alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages drop constraint if exists messages_receiver_id_fkey;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert on table public.messages to authenticated;

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
on public.messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
on public.messages for insert
to authenticated
with check (auth.uid() = sender_id);

alter table public.messages replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_receiver_created_idx on public.messages (receiver_id, created_at desc);
create index if not exists messages_created_idx on public.messages (created_at desc);

do $$ begin
  create unique index if not exists profiles_username_key on public.profiles (username);
exception when others then
  raise notice '跳过 profiles_username_key: %', sqlerrm;
end $$;

do $$ begin
  alter table public.messages add constraint messages_sender_fk
    foreign key (sender_id) references auth.users (id) on delete cascade;
exception when duplicate_object then null; when others then
  raise notice '跳过 messages_sender_fk: %', sqlerrm;
end $$;

do $$ begin
  alter table public.messages add constraint messages_receiver_fk
    foreign key (receiver_id) references auth.users (id) on delete cascade;
exception when duplicate_object then null; when others then
  raise notice '跳过 messages_receiver_fk: %', sqlerrm;
end $$;

do $$ begin
  alter table public.messages add constraint messages_content_len
    check (char_length(content) <= 4000);
exception when duplicate_object then null; when others then
  raise notice '跳过 messages_content_len: %', sqlerrm;
end $$;

${FRIENDS_SQL}

${CLIENT_ERRORS_SQL}`
