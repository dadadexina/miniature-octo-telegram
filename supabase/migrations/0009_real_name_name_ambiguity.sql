-- 修复 submit_real_name 中变量 name 与 storage.objects.name 重名导致的 ambiguous 错误

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
