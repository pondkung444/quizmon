-- Migration: 20260916160000_guardian_entry_flow_student_rpcs
-- Guardian (ผู้พิทักษ์) — Entry flow ฝั่งเด็ก: RPC สำหรับดูสถานะการเชื่อม + ถอดการเชื่อม
-- อ้างอิง: quizmon-guardian-design-2026-09-09.md ส่วนที่ 7 (โมดูล D) + รูที่ 5 (การถอดการเชื่อม)
-- และการตัดสินใจใน Notion "กำลังทำอะไรอยู่ตอนนี้" (2026-09-16): entry flow ให้จบก่อนต่อ UX/UI
--
-- ขอบเขต: หน้าที่ "ผู้พิทักษ์" ในแท็บสังคม (ฝั่งเด็ก) ยังไม่มี RPC ให้เรียกเลยสักตัว —
-- guardian_create_invite_code() มีอยู่แล้วจาก phase0 แต่ไม่เคยมี frontend เรียกใช้จริง
-- (รหัสทดสอบที่ผ่านมา insert ตรงผ่าน SQL ทั้งคู่ — เจอจาก survey สด 2026-09-16)
--
-- ตัดสินใจกับปอนด์ระหว่างร่าง (2026-09-16):
--   1) จบ /guardian/link หลังผูกสำเร็จ → redirect ไป /guardian/[studentId] ทันที (ไม่โชว์ UUID ดิบ)
--   2) รองรับผู้พิทักษ์มากกว่า 1 คนต่อนักเรียนตั้งแต่ v1 นี้ — เด็กกดสร้างรหัสเชิญใหม่ได้เสมอ
--      แม้มีผู้พิทักษ์ claimed อยู่แล้ว (ไม่ล็อกเป็น 1:1) — guardian_links ไม่มีข้อจำกัดเรื่องนี้อยู่แล้ว
--      (มีแค่ partial unique index กันคู่ guardian/student เดิมซ้ำ ไม่ได้กันหลายคู่ต่างผู้พิทักษ์)
--      → guardian_revoke_link() จึงรับ p_link_id เจาะจงแถว ไม่ revoke ทุกแถวเหมารวม
--
-- Survey ก่อนร่าง (ผ่าน Supabase MCP บน project wmndxiuqzrnqbhrznmfg):
--   - pg_proc ไม่มี guardian_get_link_status / guardian_revoke_link อยู่ก่อนแล้ว (ยืนยันว่าไม่ใช่ของซ้ำ)
--   - guardian_links columns ตรงกับ migration 20260914120000 เป๊ะ ไม่มี drift
--   - test data จริง: Dawu (b497d6dd) claimed กับ guardian 792b8e1d แต่ Dawu ไม่อยู่ใน guardian_admin
--     allowlist (มีแค่ซันซัน+PonDKunG) — ดังนั้นหัวข้อ "ผู้พิทักษ์" จะไม่โผล่ให้ Dawu เห็นจนกว่าจะเพิ่ม
--     Dawu เข้า allowlist ต่างหาก (ถ้าต้องการเทส unlink กับบัญชีนี้)
--
-- ทุก object ใช้ CREATE OR REPLACE ให้ idempotent

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) guardian_get_link_status — เด็กเรียกดูสถานะการเชื่อมของตัวเอง
--    คืนได้หลายแถว: อย่างมาก 1 แถว kind='pending' (รหัสเชิญที่ยังไม่หมดอายุ/ยังไม่ถูกใช้)
--    + 0..N แถว kind='claimed' (ผู้พิทักษ์ทุกคนที่เชื่อมอยู่ตอนนี้)
--    gate ด้วย is_guardian_admin เหมือน guardian RPC ทุกตัว (feature อยู่ระหว่าง rollout)
-- ============================================================
create or replace function public.guardian_get_link_status()
returns table (
  kind text,                  -- 'pending' | 'claimed'
  link_id uuid,
  invite_code text,           -- เฉพาะ kind='pending'
  expires_at timestamptz,     -- เฉพาะ kind='pending'
  guardian_id uuid,           -- เฉพาะ kind='claimed'
  guardian_display_name text, -- เฉพาะ kind='claimed'
  claimed_at timestamptz      -- เฉพาะ kind='claimed'
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

  -- เก็บกวาดรหัสเชิญที่หมดอายุแล้วแต่ยังค้างสถานะ pending (lazy expiry — ตรงกับ pattern เดิมที่
  -- guardian_claim_invite_code ใช้ตอน claim ไม่ทัน ไม่ต้องมี cron แยก)
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
  order by 1 desc, claimed_at desc nulls last;
end;
$$;

comment on function public.guardian_get_link_status() is
  'เด็กดูสถานะการเชื่อมของตัวเอง — คืนรหัสเชิญที่ pending อยู่ (ถ้ามี) และผู้พิทักษ์ทุกคนที่ claimed แล้ว '
  '(รองรับมากกว่า 1 คน) ใช้แสดงหัวข้อ "ผู้พิทักษ์" ในแท็บสังคม.';

-- ============================================================
-- 2) guardian_revoke_link — เด็กถอดการเชื่อมกับผู้พิทักษ์คนใดคนหนึ่ง (เจาะจงด้วย link_id)
--    ตาม รูที่ 5 ของเอกสารออกแบบ: ตัดขาดทันที (guardian_get_plan/guardian_get_students อื่นๆ
--    เช็ค status='claimed' อยู่แล้วทุกจุด จึงไม่เห็นข้อมูลทันทีที่ revoke โดยไม่ต้องแก้จุดอื่นเพิ่ม)
--    ไม่แตะ guardian_plan/guardian_goal ที่มีอยู่ — ผูกใหม่ภายหลังเห็นย้อนหลังได้ปกติตามสเปกที่ล็อกไว้
-- ============================================================
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
  set status = 'revoked'
  where id = p_link_id and student_id = v_uid and status = 'claimed';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'ไม่พบการเชื่อมต่อนี้ หรือถูกถอดไปแล้ว';
  end if;
end;
$$;

comment on function public.guardian_revoke_link(uuid) is
  'เด็กถอดการเชื่อมกับผู้พิทักษ์คนหนึ่ง (เจาะจงด้วย link_id ของ guardian_links) — ไม่กระทบผู้พิทักษ์คนอื่น '
  'ที่เชื่อมอยู่ (ถ้ามีมากกว่า 1 คน).';

commit;
