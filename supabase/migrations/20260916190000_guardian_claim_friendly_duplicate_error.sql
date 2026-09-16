-- Migration: 20260916190000_guardian_claim_friendly_duplicate_error
-- Guardian (ผู้พิทักษ์) — guardian_claim_invite_code(): กัน raw Postgres error โผล่ตรงหน้าผู้ใช้
--
-- บริบท: ระหว่าง verify entry flow จริง (claim รหัสเชิญใหม่ทั้งที่ guardian คนเดิมผูกกับ
-- student คนเดิมอยู่แล้ว) เจอว่า error ที่โชว์บนหน้า /guardian/link เป็น raw Postgres error
-- ตรงๆ:
--   duplicate key value violates unique constraint "guardian_links_one_claimed_per_pair"
-- เพราะ UPDATE สุดท้ายของฟังก์ชันชน partial unique index
-- guardian_links_one_claimed_per_pair (guardian_id, student_id) where status='claimed'
-- (index นี้ตั้งใจกันคู่ guardian/student เดิมผูกซ้ำ — ทำงานถูกต้อง ปัญหาคือ error message
-- ไม่เป็นมิตรกับผู้ใช้ ไม่ใช่ตัว logic เอง)
--
-- แก้: เพิ่มเช็คก่อน UPDATE สุดท้าย raise exception ข้อความไทยแทน (สไตล์เดียวกับ error
-- message อื่นๆ ในฟังก์ชันนี้) — ไม่กระทบ return type จึงใช้ CREATE OR REPLACE ได้เลย
-- ไม่ต้อง DROP

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.guardian_claim_invite_code(p_invite_code text)
returns table(student_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.guardian_links;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'บัญชีนี้ไม่ใช่บัญชีผู้ปกครอง';
  end if;

  select * into v_link
  from public.guardian_links
  where invite_code = upper(btrim(p_invite_code))
    and status = 'pending'
  for update;

  if not found then
    raise exception 'รหัสเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว';
  end if;

  if v_link.expires_at < now() then
    update public.guardian_links set status = 'expired' where id = v_link.id;
    raise exception 'รหัสเชิญหมดอายุแล้ว';
  end if;

  -- เช็คก่อนกันชน guardian_links_one_claimed_per_pair ด้วย error message ที่อ่านรู้เรื่อง
  -- แทนที่จะปล่อยให้ raw Postgres unique-violation โผล่ตรงหน้าผู้ใช้ — ใช้ table alias gl2
  -- กัน 42702 ambiguous column ซ้ำ (bare student_id ชนกับ OUT parameter ของฟังก์ชันเอง)
  if exists (
    select 1 from public.guardian_links gl2
    where gl2.guardian_id = v_uid and gl2.student_id = v_link.student_id and gl2.status = 'claimed'
  ) then
    raise exception 'ผู้ปกครองคนนี้เชื่อมกับบัญชีนี้อยู่แล้ว';
  end if;

  update public.guardian_links
  set status = 'claimed', guardian_id = v_uid, claimed_at = now()
  where id = v_link.id;

  return query select v_link.student_id;
end;
$$;

comment on function public.guardian_claim_invite_code(text) is
  'ผู้ปกครอง claim รหัสเชิญ 8 หลัก — เช็คซ้ำคู่ guardian/student เดิมก่อน raise exception ข้อความไทย '
  'กัน raw unique-constraint error โผล่หน้าผู้ใช้ (guardian_links_one_claimed_per_pair).';

commit;
