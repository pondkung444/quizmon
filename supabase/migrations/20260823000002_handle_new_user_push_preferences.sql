-- ============================================================
-- เพิ่ม default push_preferences row ให้ user ใหม่ทุกคน (เหมือน player_eggs starter)
-- + backfill user เก่าที่สมัครก่อนหน้านี้
--
-- หมายเหตุ: apply ผ่าน Supabase MCP ไปแล้วจริงบน production DB
-- (verified: backfill ครบ 178/178 profiles ตอน apply)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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

  insert into public.push_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

-- backfill user เก่าที่สมัครก่อนหน้านี้ ให้มี row ครบ (ค่า default ทั้งหมด = เปิดรับ)
insert into public.push_preferences (user_id)
select id from public.profiles
where id not in (select user_id from public.push_preferences)
on conflict (user_id) do nothing;
