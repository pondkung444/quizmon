-- Migration: 20260916170000_fix_guardian_get_link_status_ambiguous_column
-- Guardian (ผู้พิทักษ์) — fix 42702 "column reference is ambiguous" ใน guardian_get_link_status()
--
-- บริบท: ระหว่าง verify entry flow จริง (simulate authenticated session ด้วย
-- set request.jwt.claim.sub ตรงกับ DB จริง) เจอว่า guardian_get_link_status() พังทุกครั้ง
-- ที่เรียกแบบ authenticated ด้วย 42702 — RETURNS TABLE output column ชื่อ invite_code /
-- expires_at / guardian_id / claimed_at ชนกับชื่อคอลัมน์จริงของ guardian_links แล้วถูกอ้าง
-- แบบไม่ qualify (บรรทัด `where ... expires_at < now()`) อยู่ในตัว function เอง —
-- ปัญหาเดียวกับที่เคยแก้ใน 20260916100000_fix_guardian_rpc_ambiguous_columns.sql (Module C)
-- เป๊ะ ใช้วิธีแก้เดียวกัน: เปลี่ยนชื่อ RETURNS TABLE column ที่ชนให้ไม่ชนแทน ไม่ต้องแก้ query
-- ข้างในเลย (bare reference เดิมจะ resolve เป็นคอลัมน์ตารางถูกต้องทันทีที่ variable ชื่อชน
-- หายไป)
--
-- ผลกระทบ: หัวข้อ "ผู้พิทักษ์" ในแท็บสังคมไม่เคยแสดงผลได้เลยตั้งแต่ PR #151 merge (error ถูก
-- catch เงียบๆ ฝั่ง frontend เป็น null) — ไม่ใช่ปัญหา deploy/schema cache ตามที่สงสัยตอนแรก
--
-- DROP FUNCTION ก่อน (ไม่ใช่แค่ CREATE OR REPLACE) เพราะเปลี่ยน output column name ถือเป็น
-- เปลี่ยน return type — Postgres ไม่ยอมให้ REPLACE ข้าม return type
--
-- ฝั่ง frontend (src/app/social/page.tsx) ต้องแก้ mapping ให้ตรงกับชื่อ column ใหม่ด้วย —
-- อยู่ใน patch แยกที่ส่งให้ Claude Code พร้อมกัน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.guardian_get_link_status();

create function public.guardian_get_link_status()
returns table (
  kind text,                       -- 'pending' | 'claimed'
  link_id uuid,
  link_invite_code text,           -- เฉพาะ kind='pending' (เดิมชื่อ invite_code — ชนคอลัมน์จริง)
  link_expires_at timestamptz,     -- เฉพาะ kind='pending' (เดิมชื่อ expires_at — ชนคอลัมน์จริง)
  linked_guardian_id uuid,         -- เฉพาะ kind='claimed' (เดิมชื่อ guardian_id — ชนคอลัมน์จริง)
  guardian_display_name text,      -- เฉพาะ kind='claimed'
  link_claimed_at timestamptz      -- เฉพาะ kind='claimed' (เดิมชื่อ claimed_at — ชนคอลัมน์จริง)
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

  -- ตอนนี้ bare "expires_at" หมายถึงคอลัมน์ของ guardian_links ชัดเจนแล้ว (ไม่มี OUT
  -- parameter ชื่อชนอีกต่อไป) เหมือนที่แก้ RPC อื่นๆ ใน Module C ไปก่อนหน้านี้
  update public.guardian_links
  set status = 'expired'
  where student_id = v_uid and status = 'pending' and expires_at < now();

  return query
  select
    'pending'::text, gl.id, gl.invite_code, gl.expires_at,
    null::uuid, null::text, null::timestamptz
  from public.guardian_links gl
  where gl.student_id = v_uid and gl.status = 'pending'
  union all
  select
    'claimed'::text, gl.id, null::text, null::timestamptz,
    g.id, g.display_name, gl.claimed_at
  from public.guardian_links gl
  join public.guardians g on g.id = gl.guardian_id
  where gl.student_id = v_uid and gl.status = 'claimed'
  order by 1 desc, 7 desc nulls last;
end;
$$;

comment on function public.guardian_get_link_status() is
  'เด็กดูสถานะการเชื่อมของตัวเอง — คืนรหัสเชิญที่ pending อยู่ (ถ้ามี) และผู้พิทักษ์ทุกคนที่ claimed แล้ว '
  '(รองรับมากกว่า 1 คน) ใช้แสดงหัวข้อ "ผู้พิทักษ์" ในแท็บสังคม. Output column ตั้งชื่อเลี่ยงชนกับ '
  'guardian_links จริง (invite_code→link_invite_code ฯลฯ) กัน 42702 ambiguous column.';

commit;
