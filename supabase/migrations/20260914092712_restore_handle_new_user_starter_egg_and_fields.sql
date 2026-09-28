-- ย้อนกลับ handle_new_user() ที่ถูก overwrite เป็นเวอร์ชันเก่าบางๆ บน production
-- (ไม่ตรงกับ migration ล่าสุดใน repo: 20260823000003_privacy_accepted_at.sql)
-- กลับไปเป็นเวอร์ชันที่ insert profiles ครบฟิลด์ + ไข่ starter + push_preferences
-- ยืนยันแล้วว่าเวอร์ชันนี้ตรงกับ behavior จริงของ user ที่สมัครสำเร็จล่าสุดก่อน 2026-09-11 11:50:17 UTC
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, username, phone, school, grade_level, privacy_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', ''),
    (new.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  insert into public.push_preferences (user_id)
  values (new.id);

  return new;
end;
$$;
