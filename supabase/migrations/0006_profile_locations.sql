-- 好友城市位置：默认关闭，仅共享城市中心坐标；直读受 RLS 约束。
-- 1) 独立表 profile_locations，避免 profiles 行级 RLS 泄露未共享的坐标。
-- 2) 本人可读写；好友仅能看到 visible = true 且双方仍为好友的行。

create table if not exists public.profile_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  label text not null default '',
  precision integer not null default 2 check (precision between 0 and 2),
  visible boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profile_locations enable row level security;

drop policy if exists "profile_locations_select_visible" on public.profile_locations;
create policy "profile_locations_select_visible" on public.profile_locations for select
to authenticated
using (
  user_id = auth.uid()
  or (visible = true and public.are_contacts(auth.uid(), user_id))
);

drop policy if exists "profile_locations_insert_own" on public.profile_locations;
create policy "profile_locations_insert_own" on public.profile_locations for insert
to authenticated with check (user_id = auth.uid());

drop policy if exists "profile_locations_update_own" on public.profile_locations;
create policy "profile_locations_update_own" on public.profile_locations for update
to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "profile_locations_delete_own" on public.profile_locations;
create policy "profile_locations_delete_own" on public.profile_locations for delete
to authenticated using (user_id = auth.uid());

revoke all on public.profile_locations from anon;
grant select, insert, update, delete on public.profile_locations to authenticated;
