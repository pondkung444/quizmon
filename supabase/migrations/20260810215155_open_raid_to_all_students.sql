
-- 1. เติมทุกคนที่มีอยู่แล้วเข้า raid_allowlist (ไม่แตะ RPC logic ทั้ง 7 ตัวเลย)
insert into public.raid_allowlist (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- 2. คนสมัครใหม่ต่อจากนี้ได้เข้า allowlist อัตโนมัติ
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username, phone, school, grade_level)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', '')
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  insert into public.raid_allowlist (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;
