-- 纸墨信笺 · Supabase 云初始化基线快照
-- 由 scripts/export-cloud-sql.mjs 从 src/lib 下的 SQL 常量生成，勿手工编辑。
-- 用法：整段复制到 Supabase SQL Editor 执行；脚本幂等，可重复运行。

-- 纸墨信笺 · Supabase 初始化脚本（整体可重复执行）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  username text unique,
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id bigint primary key generated always as identity,
  sender_id uuid not null,
  receiver_id uuid not null,
  content text not null,
  created_at timestamptz default now()
);

-- 旧版表结构规范化：补齐缺失列
alter table public.profiles add column if not exists nickname text not null default '';
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
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

-- 头像存储：公开只读 bucket avatars，每人仅能写自己 <uid>/ 目录
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.friends (
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

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz default now(),
  route text,
  kind text,
  message text,
  stack text,
  session_id text,
  app_version text
);

grant usage on schema public to anon, authenticated;
grant insert on table public.client_errors to anon, authenticated;

alter table public.client_errors enable row level security;

drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert"
on public.client_errors for insert
to anon, authenticated
with check (true);

create index if not exists client_errors_occurred_idx on public.client_errors (occurred_at desc);


-- 纸墨信笺 · v2 升级脚本（幂等，可重复执行）
-- 范围：A 消息可靠性 / B 安全防护 / D 撤回删除 / F 朋友圈云端化

-- ============ 新表 ============

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'canceled')),
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (from_id <> to_id)
);

alter table public.friend_requests add column if not exists source text;

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.read_cursors (
  user_id uuid not null references auth.users (id) on delete cascade,
  peer_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, peer_id)
);

create table if not exists public.message_hides (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);

create table if not exists public.conversation_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  peer_id uuid not null references auth.users (id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer_id),
  check (user_id <> peer_id)
);

alter table public.messages add column if not exists recalled_at timestamptz;
alter table public.messages add column if not exists reply_to_id bigint references public.messages (id) on delete set null;
create index if not exists messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

alter table public.messages add column if not exists attachments jsonb;

insert into storage.buckets (id, name, public)
values ('message_media', 'message_media', false)
on conflict (id) do nothing;

-- 图片消息媒体:目录名为「配对键」(两个 uuid 排序后 __ 连接),仅会话双方可读写
drop policy if exists "msg_media_select_pair" on storage.objects;
create policy "msg_media_select_pair" on storage.objects for select
to authenticated
using (
  bucket_id = 'message_media'
  and (
    split_part((storage.foldername(name))[1], '__', 1) = auth.uid()::text
    or split_part((storage.foldername(name))[1], '__', 2) = auth.uid()::text
  )
);

drop policy if exists "msg_media_insert_pair" on storage.objects;
create policy "msg_media_insert_pair" on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message_media'
  and (
    split_part((storage.foldername(name))[1], '__', 1) = auth.uid()::text
    or split_part((storage.foldername(name))[1], '__', 2) = auth.uid()::text
  )
);

drop policy if exists "msg_media_update_pair" on storage.objects;
create policy "msg_media_update_pair" on storage.objects for update
to authenticated
using (
  bucket_id = 'message_media'
  and (
    split_part((storage.foldername(name))[1], '__', 1) = auth.uid()::text
    or split_part((storage.foldername(name))[1], '__', 2) = auth.uid()::text
  )
)
with check (
  bucket_id = 'message_media'
  and (
    split_part((storage.foldername(name))[1], '__', 1) = auth.uid()::text
    or split_part((storage.foldername(name))[1], '__', 2) = auth.uid()::text
  )
);

drop policy if exists "msg_media_delete_pair" on storage.objects;
create policy "msg_media_delete_pair" on storage.objects for delete
to authenticated
using (
  bucket_id = 'message_media'
  and (
    split_part((storage.foldername(name))[1], '__', 1) = auth.uid()::text
    or split_part((storage.foldername(name))[1], '__', 2) = auth.uid()::text
  )
);

create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 2000),
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.moment_likes (
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (moment_id, user_id)
);

create table if not exists public.moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) <= 500),
  created_at timestamptz default now()
);

-- ============ 索引 ============

create unique index if not exists friend_requests_pending_uq
  on public.friend_requests (from_id, to_id) where status = 'pending';
create index if not exists friend_requests_to_pending_idx
  on public.friend_requests (to_id, created_at desc) where status = 'pending';
create index if not exists friend_requests_from_idx on public.friend_requests (from_id);
create index if not exists message_hides_user_idx on public.message_hides (user_id);
create index if not exists moments_created_idx on public.moments (created_at desc);
create index if not exists moments_author_idx on public.moments (author_id, created_at desc);
create index if not exists moment_comments_moment_idx on public.moment_comments (moment_id, created_at);
create index if not exists client_errors_session_idx on public.client_errors (session_id, occurred_at desc);

-- ============ 关系判定函数（security definer，绕过被引用表的 RLS） ============

create or replace function public.are_contacts(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select a <> b and exists (
    select 1 from public.friends f
    where f.owner_id = a and f.friend_id = b
  ) and exists (
    select 1 from public.friends f
    where f.owner_id = b and f.friend_id = a
  )
$fn$;

create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select viewer = target
    or public.are_contacts(viewer, target)
    or exists (
      select 1 from public.friend_requests r
      where (r.from_id = viewer and r.to_id = target)
         or (r.from_id = target and r.to_id = viewer)
    )
$fn$;

create or replace function public.can_message(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select a = b
    or (public.are_contacts(a, b)
        and not exists (select 1 from public.blocks bl where bl.blocker_id = b and bl.blocked_id = a))
$fn$;

create or replace function public.can_view_moment(mid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.moments m
    where m.id = mid
      and (m.author_id = auth.uid() or public.are_contacts(auth.uid(), m.author_id))
      and not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = auth.uid() and bl.blocked_id = m.author_id)
           or (bl.blocker_id = m.author_id and bl.blocked_id = auth.uid())
      )
  )
$fn$;

-- 收紧关系判定函数:仅登录用户可执行,匿名角色不可直接调用
revoke execute on function public.are_contacts(uuid, uuid) from public, anon;
grant execute on function public.are_contacts(uuid, uuid) to authenticated;
revoke execute on function public.can_view_profile(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
revoke execute on function public.can_message(uuid, uuid) from public, anon;
grant execute on function public.can_message(uuid, uuid) to authenticated;
revoke execute on function public.can_view_moment(uuid) from public, anon;
grant execute on function public.can_view_moment(uuid) to authenticated;

-- ============ client_errors 防刷（BEFORE 触发器超限静默丢弃） ============

create or replace function public.client_errors_throttle()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if (select count(*) from public.client_errors
       where session_id = new.session_id
         and occurred_at > now() - interval '5 minutes') >= 30 then
    return null;
  end if;
  return new;
end
$fn$;

drop trigger if exists client_errors_throttle on public.client_errors;
create trigger client_errors_throttle
  before insert on public.client_errors
  for each row execute function public.client_errors_throttle();

-- ============ 授权 ============

grant select, insert, update, delete on table public.friend_requests to authenticated;
grant select, insert, delete on table public.blocks to authenticated;
grant select, insert, update on table public.read_cursors to authenticated;
grant select, insert on table public.message_hides to authenticated;
grant select, insert, update on table public.conversation_prefs to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, delete on table public.moments to authenticated;
grant select, insert, delete on table public.moment_likes to authenticated;
grant select, insert, delete on table public.moment_comments to authenticated;

-- ============ 清理遗留宽策略（历史手工创建，存在越权读取风险） ============

drop policy if exists "Messages are viewable by everyone." on public.messages;
drop policy if exists "Users can insert their own messages." on public.messages;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

-- ============ RLS ============

alter table public.friend_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.read_cursors enable row level security;
alter table public.message_hides enable row level security;
alter table public.conversation_prefs enable row level security;
alter table public.moments enable row level security;
alter table public.moment_likes enable row level security;
alter table public.moment_comments enable row level security;

drop policy if exists "fr_select" on public.friend_requests;
create policy "fr_select" on public.friend_requests for select
to authenticated using (auth.uid() in (from_id, to_id));

drop policy if exists "fr_insert" on public.friend_requests;
create policy "fr_insert" on public.friend_requests for insert
to authenticated with check (auth.uid() = from_id and status = 'pending');

drop policy if exists "fr_update_recipient" on public.friend_requests;
create policy "fr_update_recipient" on public.friend_requests for update
to authenticated
using (auth.uid() = to_id and status = 'pending')
with check (auth.uid() = to_id and status in ('accepted', 'declined'));

drop policy if exists "fr_update_sender" on public.friend_requests;
create policy "fr_update_sender" on public.friend_requests for update
to authenticated
using (auth.uid() = from_id and status = 'pending')
with check (auth.uid() = from_id and status = 'canceled');

drop policy if exists "fr_delete_sender" on public.friend_requests;
create policy "fr_delete_sender" on public.friend_requests for delete
to authenticated using (auth.uid() = from_id);

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own" on public.blocks for select
to authenticated using (auth.uid() = blocker_id);

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own" on public.blocks for insert
to authenticated with check (auth.uid() = blocker_id);

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own" on public.blocks for delete
to authenticated using (auth.uid() = blocker_id);

drop policy if exists "rc_select" on public.read_cursors;
create policy "rc_select" on public.read_cursors for select
to authenticated using (auth.uid() in (user_id, peer_id));

drop policy if exists "rc_insert_own" on public.read_cursors;
create policy "rc_insert_own" on public.read_cursors for insert
to authenticated with check (auth.uid() = user_id);

drop policy if exists "rc_update_own" on public.read_cursors;
create policy "rc_update_own" on public.read_cursors for update
to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mh_select_own" on public.message_hides;
create policy "mh_select_own" on public.message_hides for select
to authenticated using (auth.uid() = user_id);

drop policy if exists "mh_insert_own" on public.message_hides;
create policy "mh_insert_own" on public.message_hides for insert
to authenticated with check (auth.uid() = user_id);

drop policy if exists "cp_select_own" on public.conversation_prefs;
create policy "cp_select_own" on public.conversation_prefs for select
to authenticated using (auth.uid() = user_id);

drop policy if exists "cp_insert_own" on public.conversation_prefs;
create policy "cp_insert_own" on public.conversation_prefs for insert
to authenticated with check (auth.uid() = user_id);

drop policy if exists "cp_update_own" on public.conversation_prefs;
create policy "cp_update_own" on public.conversation_prefs for update
to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages for insert
to authenticated
with check (auth.uid() = sender_id and public.can_message(sender_id, receiver_id));

drop policy if exists "messages_update_recall" on public.messages;
create policy "messages_update_recall" on public.messages for update
to authenticated
using (auth.uid() = sender_id and recalled_at is null
       and created_at > now() - interval '2 minutes')
with check (auth.uid() = sender_id and recalled_at is not null);

-- 删除好友时清空该会话记录:只允许消息两端删自己的会话
drop policy if exists "messages_delete_pair" on public.messages;
create policy "messages_delete_pair" on public.messages for delete
to authenticated
using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select
to authenticated using (public.can_view_profile(auth.uid(), id));

drop policy if exists "moments_select_visible" on public.moments;
create policy "moments_select_visible" on public.moments for select
to authenticated
using (auth.uid() = author_id or public.are_contacts(auth.uid(), author_id));

drop policy if exists "moments_insert_own" on public.moments;
create policy "moments_insert_own" on public.moments for insert
to authenticated with check (auth.uid() = author_id);

drop policy if exists "moments_delete_own" on public.moments;
create policy "moments_delete_own" on public.moments for delete
to authenticated using (auth.uid() = author_id);

drop policy if exists "ml_select_visible" on public.moment_likes;
create policy "ml_select_visible" on public.moment_likes for select
to authenticated using (public.can_view_moment(moment_id));

drop policy if exists "ml_insert_own" on public.moment_likes;
create policy "ml_insert_own" on public.moment_likes for insert
to authenticated with check (auth.uid() = user_id and public.can_view_moment(moment_id));

drop policy if exists "ml_delete_own" on public.moment_likes;
create policy "ml_delete_own" on public.moment_likes for delete
to authenticated using (auth.uid() = user_id);

drop policy if exists "mc_select_visible" on public.moment_comments;
create policy "mc_select_visible" on public.moment_comments for select
to authenticated using (public.can_view_moment(moment_id));

drop policy if exists "mc_insert_own" on public.moment_comments;
create policy "mc_insert_own" on public.moment_comments for insert
to authenticated with check (auth.uid() = user_id and public.can_view_moment(moment_id));

drop policy if exists "mc_delete_own_or_author" on public.moment_comments;
create policy "mc_delete_own_or_author" on public.moment_comments for delete
to authenticated
using (auth.uid() = user_id or exists (
  select 1 from public.moments m
  where m.id = moment_id and m.author_id = auth.uid()
));

-- ============ 朋友圈图片存储桶 ============

insert into storage.buckets (id, name, public)
values ('moments', 'moments', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "moments_obj_public_read" on storage.objects;
create policy "moments_obj_public_read" on storage.objects for select
to anon, authenticated
using (bucket_id = 'moments');

drop policy if exists "moments_obj_owner_write" on storage.objects;
create policy "moments_obj_owner_write" on storage.objects for insert
to authenticated
with check (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "moments_obj_owner_update" on storage.objects;
create policy "moments_obj_owner_update" on storage.objects for update
to authenticated
using (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "moments_obj_owner_delete" on storage.objects;
create policy "moments_obj_owner_delete" on storage.objects for delete
to authenticated
using (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ friends 好友边读写策略 ============
-- 好友判定要求双方各一行(are_contacts 双向校验),任一方删除都会删掉两侧的边。
-- 仅能读取本人持有的好友边,备注/来源等私有字段不会暴露给对方;
-- 删除仍允许参与双方操作,便于任一方解除关系时成对清理。

drop policy if exists "friends_select_own" on public.friends;
drop policy if exists "friends_select_participant" on public.friends;
create policy "friends_select_own" on public.friends for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "friends_delete_own" on public.friends;
drop policy if exists "friends_delete_participant" on public.friends;
create policy "friends_delete_participant" on public.friends for delete
to authenticated
using (auth.uid() in (owner_id, friend_id));

-- 备注仅好友关系所有者可写,且只授权 remark 列
alter table public.friends add column if not exists remark text;
alter table public.friends add column if not exists source text;
grant update (remark) on table public.friends to authenticated;

drop policy if exists "friends_update_remark_own" on public.friends;
create policy "friends_update_remark_own" on public.friends for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

do $$ begin
  alter table public.friends add constraint friends_remark_len
    check (remark is null or char_length(remark) <= 20);
exception when duplicate_object then null; when others then
  raise notice '跳过 friends_remark_len: %', sqlerrm;
end $$;

-- ============ friends 对等边回写(接受方替请求方建边 / 双方互备) ============
-- permissive 策略与 friends_insert_own 叠加(OR):本人边始终可插;
-- 对等边(owner=对方, friend=我)仅在「反向边已存在」时允许插入,
-- 即只允许补齐已有关系,不能凭已接受的旧请求单方面重建好友。

drop policy if exists "friends_insert_reciprocal" on public.friends;
create policy "friends_insert_reciprocal" on public.friends for insert
to authenticated
with check (
  auth.uid() = friend_id
  and exists (
    select 1 from public.friends f2
    where f2.owner_id = auth.uid() and f2.friend_id = public.friends.owner_id
  )
);

-- ============ Realtime ============

alter table public.read_cursors replica identity full;
alter table public.friend_requests replica identity full;
alter table public.friends replica identity full;
alter table public.profiles replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.read_cursors;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friend_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friends;
exception
  when duplicate_object then null;
end $$;

-- 好友更换头像/昵称后立即推送给在线好友
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

-- ============ 唯一 ID / 搜索方式 / 手机号 ============

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists allow_email_search boolean not null default true;
alter table public.profiles add column if not exists allow_phone_search boolean not null default true;
alter table public.profiles add column if not exists id_change_count integer not null default 0;
alter table public.profiles add column if not exists id_changed_at timestamptz;

-- 个性签名(最多 30 字),展示在发现页头像下方
alter table public.profiles add column if not exists signature text;

-- 性别:male / female / secret,默认保密
alter table public.profiles add column if not exists gender text not null default 'secret';

do $$ begin
  alter table public.profiles add constraint profiles_gender_valid
    check (gender in ('male', 'female', 'secret'));
exception when duplicate_object then null; when others then
  raise notice '跳过 profiles_gender_valid: %', sqlerrm;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_signature_len
    check (signature is null or char_length(signature) <= 30);
exception when duplicate_object then null; when others then
  raise notice '跳过 profiles_signature_len: %', sqlerrm;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_phone_format
    check (phone is null or phone = '' or phone ~ '^[0-9]{6,20}$');
exception when duplicate_object then null; when others then
  raise notice '跳过 profiles_phone_format: %', sqlerrm;
end $$;

-- 一个手机号只能绑定一个账号
create unique index if not exists profiles_phone_key
  on public.profiles (phone) where phone is not null and phone <> '';
-- 唯一 ID 不区分大小写
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username)) where username is not null;

-- 首次注册即分配随机 ID(8-15 位,同时包含字母和数字)
create or replace function public.random_public_id()
returns text language plpgsql volatile security definer set search_path = public as $fn$
declare
  alphabet text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  letters text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  chars text[];
  candidate text;
  i integer;
  tries integer := 0;
begin
  loop
    tries := tries + 1;
    chars := array[substr(letters, 1 + floor(random() * length(letters))::int, 1),
                  substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1)];
    for i in 1..(8 + floor(random() * 6)::int) loop
      chars := chars || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    candidate := array_to_string(chars, '');
    exit when not exists (select 1 from public.profiles where lower(username) = lower(candidate));
    if tries > 50 then
      raise exception '无法生成唯一 ID,请重试';
    end if;
  end loop;
  return candidate;
end $fn$;

-- 修改唯一 ID:首次免费修改一次,之后每年(自注册日起)可再改一次
create or replace function public.update_public_id(new_id text)
returns table (ok boolean, message text, username text, change_count integer, next_change_at timestamptz)
language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
  row public.profiles;
  base timestamptz;
  wait_until timestamptz;
begin
  if me is null then
    return query select false, '登录后才能修改 ID', null::text, 0, null::timestamptz;
    return;
  end if;
  if new_id is null or new_id !~ '^[A-Za-z0-9]{8,15}$'
     or new_id !~ '[A-Za-z]' or new_id !~ '[0-9]' then
    return query select false, 'ID 需为 8-15 位,且同时包含字母和数字', null::text, 0, null::timestamptz;
    return;
  end if;
  select * into row from public.profiles where id = me for update;
  if not found then
    return query select false, '资料尚未创建', null::text, 0, null::timestamptz;
    return;
  end if;
  if lower(row.username) = lower(new_id) then
    return query select false, '新 ID 与当前一致', row.username, row.id_change_count, null::timestamptz;
    return;
  end if;
  if row.id_change_count > 0 then
    base := greatest(coalesce(row.created_at, now()), coalesce(row.id_changed_at, row.created_at, now()));
    wait_until := base + interval '1 year';
    if now() < wait_until then
      return query select false, '每年只能修改一次 ID', row.username, row.id_change_count, wait_until;
      return;
    end if;
  end if;
  begin
    update public.profiles p
      set username = new_id, id_change_count = p.id_change_count + 1, id_changed_at = now()
      where p.id = me;
  exception when unique_violation then
    return query select false, '这个 ID 已被占用', row.username, row.id_change_count, null::timestamptz;
    return;
  end;
  return query
    select true, 'ID 已更新', new_id, row.id_change_count + 1, now() + interval '1 year';
end $fn$;

-- 通讯录搜索:ID / 邮箱 / 手机号,邮箱与手机号需对方允许被搜索
drop function if exists public.search_profile(text);
create or replace function public.search_profile(q text)
returns table (id uuid, username text, nickname text, avatar_url text, matched_by text)
language sql stable security definer set search_path = public as $fn$
  select p.id, p.username, p.nickname, p.avatar_url,
    case
      when lower(p.username) = lower(q) then 'id'
      when lower(u.email) = lower(q) then 'email'
      else 'phone'
    end
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id <> auth.uid()
    and q is not null
    and char_length(btrim(q)) between 1 and 64
    and (
      lower(p.username) = lower(btrim(q))
      or (btrim(q) ~ '^[^@[:space:]]+@[^@[:space:]]+$' and lower(u.email) = lower(btrim(q)) and p.allow_email_search)
      or (btrim(q) ~ '^[0-9]{6,20}$' and p.phone = btrim(q) and p.allow_phone_search)
    )
  order by (lower(p.username) = lower(btrim(q))) desc
  limit 5
$fn$;

-- 新建资料时兜底:ID 必须是 8-15 位且同时包含字母和数字
create or replace function public.profiles_fill_public_id()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.username is null or new.username !~ '^[A-Za-z0-9]{8,15}$'
     or new.username !~ '[A-Za-z]' or new.username !~ '[0-9]' then
    new.username := public.random_public_id();
  end if;
  return new;
end $fn$;

drop trigger if exists profiles_fill_public_id on public.profiles;
create trigger profiles_fill_public_id
  before insert on public.profiles
  for each row execute function public.profiles_fill_public_id();

grant execute on function public.update_public_id(text) to authenticated;
grant execute on function public.search_profile(text) to authenticated;
grant execute on function public.random_public_id() to authenticated;

-- ============ 举报（UGC 合规） ============

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('message', 'moment', 'user')),
  target_id text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'porn', 'illegal', 'other')),
  detail text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  constraint reports_unique_target unique (reporter_id, target_type, target_id),
  constraint reports_detail_len check (char_length(detail) <= 500)
);

create index if not exists reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports for select
to authenticated
using (reporter_id = auth.uid());

revoke all on public.reports from anon;
grant select, insert on public.reports to authenticated;

-- ============ 好友会话双向软删 ============

alter table public.messages add column if not exists deleted_for uuid[] not null default '{}';
create index if not exists messages_deleted_for_idx on public.messages using gin (deleted_for);

drop function if exists public.soft_delete_pair_messages(uuid);
create or replace function public.soft_delete_pair_messages(peer_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare me uuid := auth.uid(); affected integer;
begin
  if me is null or peer_id is null or me = peer_id then return 0; end if;
  update public.messages
     set deleted_for = (
       select array_agg(distinct ids) from unnest(deleted_for || array[me, peer_id]) as ids
     )
   where (sender_id = me and receiver_id = peer_id)
      or (sender_id = peer_id and receiver_id = me);
  get diagnostics affected = row_count;
  return affected;
end $fn$;

revoke execute on function public.soft_delete_pair_messages(uuid) from public, anon;
grant execute on function public.soft_delete_pair_messages(uuid) to authenticated;

-- ============ 注销冷静期 ============

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ============ Web Push 订阅 ============

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions for select
to authenticated using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert
to authenticated with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions for update
to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete
to authenticated using (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
