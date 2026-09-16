-- Migration: 20260916180000_fix_guardian_revoke_link_claimed_consistency
-- Guardian (ผู้พิทักษ์) — fix guardian_revoke_link() ที่พังทุกครั้งด้วย check constraint
-- 23514 "guardian_links_claimed_consistency"
--
-- บริบท: พบระหว่าง simulate authenticated call (rolled back, ไม่กระทบข้อมูลจริง) ตอน verify
-- entry flow รอบ hotfix ambiguous-column — guardian_revoke_link() set status='revoked' แต่ไม่ได้
-- เคลียร์ guardian_id / claimed_at เลย ทำให้ชน constraint จาก phase0
-- (20260914120000_guardian_schema_phase0.sql):
--   constraint guardian_links_claimed_consistency
--     check ((status = 'claimed') = (guardian_id is not null and claimed_at is not null))
-- ผลคือปุ่ม "ถอดการเชื่อม" พังทุกครั้งตั้งแต่มี guardian_revoke_link() (PR #151) — ไม่เคยใช้งานได้จริง
--
-- ปลอดภัยที่จะ null guardian_id/claimed_at ตอน revoke เพราะ:
--   - guardian_links_one_claimed_per_pair เป็น partial unique index เฉพาะ status='claimed' เท่านั้น
--     (ไม่ผูกกับ revoked row) ผูกใหม่ในอนาคตจึงไม่ชน
--   - guardian_claim_invite_code() ทำงานกับ pending row ใหม่เสมอ ไม่แตะ revoked row เดิม
--
-- CREATE OR REPLACE พอ เพราะ return type (void) ไม่เปลี่ยน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.guardian_revoke_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  update public.guardian_links
  set status = 'revoked',
      guardian_id = null,
      claimed_at = null
  where id = p_link_id and student_id = v_uid and status = 'claimed';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'ไม่พบการเชื่อมต่อนี้ หรือถูกถอดไปแล้ว';
  end if;
end;
$$;

comment on function public.guardian_revoke_link(uuid) is
  'เด็กถอดการเชื่อมกับผู้พิทักษ์คนหนึ่ง (เจาะจงด้วย link_id ของ guardian_links) — ไม่กระทบผู้พิทักษ์คนอื่น '
  'ที่เชื่อมอยู่ (ถ้ามีมากกว่า 1 คน). เคลียร์ guardian_id/claimed_at ตอน revoke เพื่อผ่าน check '
  'constraint guardian_links_claimed_consistency (status=''claimed'' ต้องคู่กับสองคอลัมน์นี้เท่านั้น).';

commit;
