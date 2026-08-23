-- ============================================================
-- เพิ่ม profiles.privacy_accepted_at + trigger รองรับ metadata
--
-- หมายเหตุ: apply ผ่าน Supabase MCP ไปแล้วจริงบน production DB
-- (project wmndxiuqzrnqbhrznมfg) ไฟล์นี้เอามาใส่ supabase/migrations/
-- เพื่อกัน drift เท่านั้น ห้าม apply ซ้ำ
-- ============================================================

alter table public.profiles
  add column privacy_accepted_at timestamptz;

comment on column public.profiles.privacy_accepted_at is
  'timestamp ตอนติ๊กยอมรับ privacy policy ตอนสมัคร (ทั้ง email/password และ Google OAuth
   complete-profile) — null สำหรับ user ที่สมัครก่อนมีฟีเจอร์นี้ ไม่ backfill ย้อนหลัง';

-- path email/password: ส่งมาพร้อม signUp() metadata เพราะยังไม่มี session ตอนนั้น
-- (ต้องยืนยันอีเมลก่อน ถึงจะมี session ทำ .update() ตรงได้)
-- path Google OAuth: metadata ไม่มีค่านี้ตอน trigger รัน จะเป็น null แล้วไป set
-- ทีหลังตอน complete-profile ผ่าน .update() ที่มี session แล้ว
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
