export const REAL_NAME_SQL = `
-- ============ 实名认证（人工审核） ============

create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

insert into public.app_admins (email)
values ('471092554@qq.com')
on conflict (email) do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.app_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$fn$;

revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table if not exists public.real_name_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  real_name text not null,
  id_number text not null,
  id_front_path text not null,
  id_back_path text not null,
  status text not null default 'pending',
  review_note text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint real_name_status_check check (status in ('pending', 'verified', 'rejected')),
  constraint real_name_name_check check (char_length(real_name) between 2 and 40),
  constraint real_name_id_check check (id_number ~ '^[0-9]{17}[0-9X]$'),
  constraint real_name_note_check check (char_length(review_note) <= 200)
);

create unique index if not exists real_name_active_id_key
  on public.real_name_verifications (id_number)
  where status in ('pending', 'verified');
create index if not exists real_name_status_submitted_idx
  on public.real_name_verifications (status, submitted_at desc);

alter table public.real_name_verifications enable row level security;
revoke all on table public.real_name_verifications from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('realname', 'realname', false)
on conflict (id) do update set public = false;

drop policy if exists "realname_select_own_or_admin" on storage.objects;
create policy "realname_select_own_or_admin" on storage.objects for select
to authenticated
using (
  bucket_id = 'realname'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_app_admin())
);

drop policy if exists "realname_insert_own" on storage.objects;
create policy "realname_insert_own" on storage.objects for insert
to authenticated
with check (bucket_id = 'realname' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "realname_update_own" on storage.objects;
create policy "realname_update_own" on storage.objects for update
to authenticated
using (bucket_id = 'realname' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'realname' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "realname_delete_own" on storage.objects;
create policy "realname_delete_own" on storage.objects for delete
to authenticated
using (bucket_id = 'realname' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.cn_id_valid(p_id text)
returns boolean
language plpgsql
immutable
set search_path = public
as $fn$
declare
  weights integer[] := array[7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  codes text := '10X98765432';
  total integer := 0;
  i integer;
  value text := upper(btrim(coalesce(p_id, '')));
begin
  if value !~ '^[0-9]{17}[0-9X]$' then
    return false;
  end if;
  for i in 1..17 loop
    total := total + substr(value, i, 1)::integer * weights[i];
  end loop;
  return substr(codes, (total % 11) + 1, 1) = substr(value, 18, 1);
end
$fn$;

create or replace function public.my_real_name()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'status', coalesce(r.status, 'unverified'),
    'real_name', coalesce(r.real_name, ''),
    'id_number_masked',
      case
        when r.id_number is null then ''
        else left(r.id_number, 6) || '********' || right(r.id_number, 4)
      end,
    'review_note', coalesce(r.review_note, ''),
    'submitted_at', r.submitted_at,
    'reviewed_at', r.reviewed_at
  )
  from (select auth.uid() as uid) me
  left join public.real_name_verifications r on r.user_id = me.uid
$fn$;

revoke execute on function public.my_real_name() from public, anon;
grant execute on function public.my_real_name() to authenticated;

create or replace function public.submit_real_name(
  p_real_name text,
  p_id_number text,
  p_front_path text,
  p_back_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  v_name text := btrim(coalesce(p_real_name, ''));
  doc text := upper(btrim(coalesce(p_id_number, '')));
  front text := btrim(coalesce(p_front_path, ''));
  back text := btrim(coalesce(p_back_path, ''));
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'bad_real_name';
  end if;
  if not public.cn_id_valid(doc) then
    raise exception 'bad_id_number';
  end if;
  if front = '' or back = '' or front = back then
    raise exception 'bad_photo';
  end if;
  if split_part(front, '/', 1) <> me::text or split_part(back, '/', 1) <> me::text then
    raise exception 'bad_photo';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'realname' and name = front
  ) or not exists (
    select 1 from storage.objects
    where bucket_id = 'realname' and name = back
  ) then
    raise exception 'bad_photo';
  end if;
  if exists (
    select 1 from public.real_name_verifications
    where user_id = me and status = 'verified'
  ) then
    raise exception 'already_verified';
  end if;
  begin
    insert into public.real_name_verifications (
      user_id, real_name, id_number, id_front_path, id_back_path, status
    ) values (
      me, v_name, doc, front, back, 'pending'
    )
    on conflict (user_id) do update set
      real_name = excluded.real_name,
      id_number = excluded.id_number,
      id_front_path = excluded.id_front_path,
      id_back_path = excluded.id_back_path,
      status = 'pending',
      review_note = '',
      submitted_at = now(),
      reviewed_at = null,
      reviewed_by = null;
  exception
    when unique_violation then
      raise exception 'id_already_used';
  end;
  return public.my_real_name();
end
$fn$;

revoke execute on function public.submit_real_name(text, text, text, text) from public, anon;
grant execute on function public.submit_real_name(text, text, text, text) to authenticated;

create or replace function public.admin_list_real_names()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'user_id', r.user_id,
    'real_name', r.real_name,
    'id_number', r.id_number,
    'front_path', r.id_front_path,
    'back_path', r.id_back_path,
    'status', r.status,
    'review_note', r.review_note,
    'submitted_at', r.submitted_at,
    'reviewed_at', r.reviewed_at,
    'email', u.email,
    'nickname', p.nickname,
    'username', p.username
  )
  from public.real_name_verifications r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where public.is_app_admin()
  order by
    case when r.status = 'pending' then 0 else 1 end,
    r.submitted_at desc
  limit 100
$fn$;

revoke execute on function public.admin_list_real_names() from public, anon;
grant execute on function public.admin_list_real_names() to authenticated;

create or replace function public.admin_review_real_name(
  p_user_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  note text := left(btrim(coalesce(p_note, '')), 200);
  row public.real_name_verifications;
begin
  if me is null or not public.is_app_admin() then
    raise exception 'not_admin';
  end if;
  update public.real_name_verifications
  set status = case when p_approve then 'verified' else 'rejected' end,
      review_note = note,
      reviewed_at = now(),
      reviewed_by = me
  where user_id = p_user_id and status = 'pending'
  returning * into row;
  if not found then
    raise exception 'not_pending';
  end if;
  return jsonb_build_object(
    'ok', true,
    'status', row.status,
    'reviewed_at', row.reviewed_at
  );
end
$fn$;

revoke execute on function public.admin_review_real_name(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_real_name(uuid, boolean, text) to authenticated;
`
