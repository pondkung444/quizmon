-- Rollback for: 20260914120000_guardian_schema_phase0.sql
-- ไม่ auto-apply — เก็บไว้คู่กัน manual only ตาม workflow (Survey -> Draft -> Confirm -> Execute -> Verify)
-- Idempotent: ใช้ IF EXISTS ทุกจุด รันซ้ำได้โดยไม่ error
--
-- ไม่ rollback handle_new_user() กลับเป็นเวอร์ชันเดิมแบบ blind replace เพราะเสี่ยง overwrite
-- การเปลี่ยนแปลงอื่นที่อาจเกิดขึ้นหลัง apply ไฟล์นี้ (เช่นถ้ามี migration ถัดไปแก้ฟังก์ชันนี้ต่อ) —
-- ให้ restore จาก 20260823000003_privacy_accepted_at.sql (บล็อก create or replace function
-- ด้านล่างนี้) ด้วยตนเองหลัง verify ว่ายังไม่มีอะไรมาแก้ทับหลังจากนั้น

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 8) RPC ชุด guardian_*
drop function if exists public.guardian_upsert_goal(uuid, text, text, integer);
drop function if exists public.guardian_upsert_plan(uuid, text);
drop function if exists public.guardian_get_plan(uuid);
drop function if exists public.guardian_get_students();
drop function if exists public.guardian_claim_invite_code(text);
drop function if exists public.guardian_create_invite_code();

-- 7) helper
drop function if exists public.is_guardian_admin(uuid);

-- 6) handle_new_user() — restore เวอร์ชัน 20260823000003 (ก่อนมี guardian early-return)
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

-- 5) push_preferences.guardian_enabled
alter table public.push_preferences
  drop column if exists guardian_enabled;

-- 4) guardian_admin
drop table if exists public.guardian_admin;

-- 3) guardian_goal / guardian_plan
drop table if exists public.guardian_goal;
drop table if exists public.guardian_plan;

-- 2) guardian_links
drop index if exists public.guardian_links_invite_code_pending_uidx;
drop table if exists public.guardian_links;

-- 1) guardians
drop table if exists public.guardians;

commit;
