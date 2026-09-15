-- Migration: 20260914130100_fix_guardian_qmon_stage_type
-- Guardian (ผู้พิทักษ์) — Phase 1 follow-up fix: guardian_get_qmon_display stage type
--
-- *** BACKFILL NOTICE (เขียนย้อนหลัง 2026-09-15) ***
-- ไฟล์นี้ถูกเขียนย้อนหลังหลังพบว่า migration ตัวนี้ถูก apply ตรงผ่าน Supabase MCP เมื่อ 2026-09-15
-- (ปรากฏใน supabase_migrations.schema_migrations เป็น version 20260915005554 ชื่อ
-- "20260914130100_fix_guardian_qmon_stage_type") แต่ไม่เคย commit ไฟล์เข้า repo
--
-- ดึง guardian_get_qmon_display definition ปัจจุบันตรงจาก live DB ผ่าน pg_get_functiondef()
-- (คือ final/fixed version — ไม่ได้ reconstruct เวอร์ชันก่อนแก้ เพราะไม่มีที่เก็บ SQL ต้นฉบับก่อน
-- fix ไว้ที่ไหนเลย ชื่อ migration บอกแค่ว่าแก้ type ของ stage ให้ตรงกับ pets.stage
-- (สันนิษฐานจากชื่อ: แต่เดิมน่าจะ cast ผิด/ไม่ cast — ดู p.stage::integer ด้านล่างซึ่งเป็น cast
-- ที่มีอยู่ในเวอร์ชัน live ปัจจุบัน)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- guardian_get_qmon_display — ข้อมูล Qmon (สัตว์เลี้ยง) ของนักเรียนสำหรับหน้าผู้ปกครอง
-- ============================================================
create or replace function public.guardian_get_qmon_display(p_student_id uuid)
returns table (
  nickname text,
  stage integer,
  subline text,
  personality text,
  egg_sprite_prefix text,
  egg_name_th text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  return query
  select p.nickname, p.stage::integer, p.subline, p.personality, e.sprite_prefix, e.name_th
  from public.pets p
  join public.egg_types e on e.id = p.egg_type_id
  where p.user_id = p_student_id and p.is_active = true
  limit 1;
end;
$$;

commit;
