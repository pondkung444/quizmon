-- Migration: 20260915120000_guardian_module_c_plan_goal_rebuild
-- Guardian (ผู้พิทักษ์) — Module C: /guardian/plan + /guardian/goal schema rebuild
-- อ้างอิง: quizmon-guardian-design-2026-09-09.md §5 (Module C)
--
-- บริบท: guardian_plan/guardian_goal เดิม (จาก 20260914120000_guardian_schema_phase0.sql)
-- ใช้ shape ผิด (flat category + weekly-target-count) เพราะตอนนั้นยังไม่มี bridge table
-- ระหว่าง category<->chapter ที่ runtime ใช้ได้จริง — ตอนนี้ยืนยันแล้วว่า
-- curriculum_chapters.chapter join กับ questions.chapter (ไม่ใช่ questions.category) ให้ผลถูก
-- 100% สำหรับ junior chapters ทั้งหมด และมี view curriculum_chapter_availability ที่ทำ join
-- นี้ให้แล้ว จึงrebuild เป็น chapter-queue model ตาม spec จริง
--
-- Survey ก่อน apply (2026-09-15, ผ่าน Supabase MCP บน project wmndxiuqzrnqbhrznmfg):
--   - guardian_plan: 0 แถว, guardian_goal: 0 แถว — ไม่มี real user เคยตั้งค่าเลย ยืนยันปลอดภัยที่จะ drop
--   - RLS policy เดิม: มีแค่ select policy (guardian_plan_select_linked, guardian_goal_select_linked)
--     ไม่มี insert/update/delete policy ให้ client เลย (เขียนผ่าน RPC security definer เท่านั้น) —
--     คงหลักการเดิมในตารางใหม่
--   - grep src/ ไม่พบการเรียก guardian_get_plan / guardian_get_goal_progress / guardian_get_categories /
--     guardian_upsert_plan / guardian_upsert_goal จาก frontend เลย — ปลอดภัยที่จะ drop RPC เดิมทั้ง 5
--     ตัวไปพร้อมกับตาราง (ยังไม่ rewrite ให้ตรง schema ใหม่ในไฟล์นี้ — เป็นงาน session ถัดไปตามที่ระบุ
--     ใน task scope: schema + RLS เท่านั้นสำหรับรอบนี้)
--   - curriculum_chapters.chapter_key มี UNIQUE constraint (curriculum_chapters_chapter_key_unique)
--     และ format check ('^cc_[0-9a-f]{24}$') — ใช้เป็น FK target ได้ตรงไปตรงมา
--   - curriculum_chapter_availability view ไม่ expose chapter_key (มีแค่ chapter text) — ไม่กระทบ
--     migration นี้ (แค่สร้างตาราง) แต่ RPC ตัวถัดไปที่ query availability ต้อง join กลับ
--     curriculum_chapters ด้วย (subject, branch, grade_band, chapter) เพื่อได้ chapter_key
--   - 151/4836 questions มี chapter IS NULL (~3.1%) — เป็น known gap อยู่แล้ว ต้องระวังตอนสร้าง RPC
--     ที่นับ attempts ต่อ chapter ในเซสชันถัดไป ไม่กระทบ schema นี้
--
-- ทุก object ใช้ IF EXISTS / IF NOT EXISTS ให้ idempotent

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) Drop old RPCs ที่ return shape เดิม (flat category) — จะ rewrite ให้ตรง schema ใหม่ในเซสชันถัดไป
-- ============================================================
drop function if exists public.guardian_upsert_goal(uuid, text, text, integer);
drop function if exists public.guardian_upsert_plan(uuid, text);
drop function if exists public.guardian_get_plan(uuid);
drop function if exists public.guardian_get_goal_progress(uuid);
drop function if exists public.guardian_get_categories(uuid);

-- ============================================================
-- 2) Drop old tables (ยืนยันแล้วว่า 0 แถวทั้งคู่ — ไม่มี real user data)
--    guardian_goal ต้อง drop ก่อน (FK -> guardian_plan) แต่ cascade ครอบไว้เผื่อ drift
-- ============================================================
drop table if exists public.guardian_goal cascade;
drop table if exists public.guardian_plan cascade;

-- ============================================================
-- 3) guardian_plan — 1 แถวต่อแผน 1 แผน active ต่อ student ในเวลาเดียว (partial unique index)
-- ============================================================
create table public.guardian_plan (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  framework text not null check (framework in ('school', 'weak_spot', 'exam_prep')),
  duration_weeks int not null check (duration_weeks in (4, 8, 12)),
  exam_date date, -- ใช้เฉพาะตอน framework = 'exam_prep' — validate ฝั่ง RPC ตอนสร้าง/แก้แผน
  status text not null default 'active' check (status in ('active', 'completed', 'replaced')),
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);

create unique index guardian_plan_one_active_per_student
  on public.guardian_plan (student_id)
  where (status = 'active');

create index guardian_plan_guardian_idx
  on public.guardian_plan (guardian_id);

alter table public.guardian_plan enable row level security;

create policy "guardian_plan_select_linked" on public.guardian_plan
  for select using (auth.uid() = guardian_id or auth.uid() = student_id);

-- ไม่มี insert/update/delete policy ให้ client — เขียนผ่าน guardian_* RPC (security definer) เท่านั้น
-- ตาม F3 decision (§9.2): guardian access ต้องผ่าน guardian_get_*/guardian_*_plan RPC เสมอ ห้าม
-- อ่าน/เขียนตารางตรง

comment on table public.guardian_plan is
  'แผนฝึกของนักเรียน 1 คน ตั้งโดยผู้ปกครองที่ลิงก์แล้ว — เป็นคิว chapter ที่เรียงลำดับได้ '
  '(ดู guardian_plan_chapters) ไม่ใช่ category + weekly-target แบบเดิม (Module C rebuild).';

comment on column public.guardian_plan.exam_date is
  'ใช้เฉพาะ framework=exam_prep (ไม่มี CHECK ผูกกับ framework — validate ฝั่ง RPC แทน '
  'เพราะ CHECK ข้ามคอลัมน์ต้องใช้ trigger ซึ่งซับซ้อนเกินความจำเป็นสำหรับ validation ระดับนี้).';

-- ============================================================
-- 4) guardian_plan_chapters — คิว chapter ที่เรียงลำดับได้ภายในแผน (drag/reorder/add/remove)
-- ============================================================
create table public.guardian_plan_chapters (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.guardian_plan(id) on delete cascade,
  chapter_key text not null references public.curriculum_chapters(chapter_key),
  queue_order int not null,
  status text not null default 'pending' check (status in ('pending', 'current', 'passed', 'stuck')),
  entered_current_at timestamptz, -- เซ็ตตอน status -> 'current' ใช้เช็ค stuck >2 สัปดาห์
  passed_at timestamptz,
  unique (plan_id, chapter_key)
);

create index guardian_plan_chapters_plan_order_idx
  on public.guardian_plan_chapters (plan_id, queue_order);

alter table public.guardian_plan_chapters enable row level security;

create policy "guardian_plan_chapters_select_linked" on public.guardian_plan_chapters
  for select using (
    exists (
      select 1 from public.guardian_plan gp
      where gp.id = guardian_plan_chapters.plan_id
        and (gp.guardian_id = auth.uid() or gp.student_id = auth.uid())
    )
  );

-- ไม่มี insert/update/delete policy ให้ client — เขียนผ่าน guardian_* RPC เท่านั้น (drag/reorder/
-- add/remove RPC เป็นงาน session ถัดไป)

comment on table public.guardian_plan_chapters is
  'คิว chapter ที่เรียงลำดับได้ภายในแผน 1 แผน — ผู้ปกครอง drag/reorder/add/remove ได้ตลอด '
  'ไม่ใช่แค่ตอนสร้างแผน. status current ตัวเดียวต่อ plan คือ chapter ที่กำลังเรียน/ทบทวนอยู่ '
  '(บังคับที่ RPC layer ไม่ใช่ CHECK constraint).';

comment on column public.guardian_plan_chapters.chapter_key is
  'FK -> curriculum_chapters.chapter_key. คำถามของ chapter นี้หาได้จาก '
  'questions.chapter = curriculum_chapters.chapter (join ผ่าน chapter_key) — '
  'ห้ามใช้ questions.category เพราะ category กว้างกว่า chapter (หลาย chapter รวมกัน 1 category '
  'ในบาง junior math chapters) ยืนยันแล้วจาก DB survey 2026-09-15.';

-- ============================================================
-- 5) guardian_goal — 1 แถวต่อสัปดาห์ที่ผู้ปกครองตั้ง level จริง ไม่มีแถว = ไม่มีเป้าหมายสัปดาห์นั้น
--    (ไม่ auto-carry level เดิมมาสัปดาห์ใหม่)
-- ============================================================
create table public.guardian_goal (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  level text not null check (level in ('relaxed', 'steady', 'challenging')),
  week_start date not null, -- ตรงกับ current_week_bounds_bkk().week_start_date
  computed_target int not null check (computed_target between 40 and 300),
  created_at timestamptz not null default now(),
  unique (student_id, week_start)
);

create index guardian_goal_student_idx
  on public.guardian_goal (student_id);

alter table public.guardian_goal enable row level security;

create policy "guardian_goal_select_linked" on public.guardian_goal
  for select using (
    auth.uid() = student_id
    or exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = auth.uid()
        and gl.student_id = guardian_goal.student_id
        and gl.status = 'claimed'
    )
  );

-- ไม่มี insert/update/delete policy ให้ client — เขียนผ่าน guardian_* RPC เท่านั้น (goal-setting RPC
-- เป็นงาน session ถัดไป — ต้อง snapshot computed_target ครั้งเดียวตอนตั้ง level ไม่ recompute ตอนอ่าน)

comment on table public.guardian_goal is
  'เป้าหมายความสม่ำเสมอรายสัปดาห์ — ผู้ปกครองล็อก level (relaxed/steady/challenging) ไม่ใช่ตัวเลข '
  'ตัวเลข computed_target คำนวณจาก median 4 สัปดาห์ล่าสุดที่จบแล้ว (floor 40, ceiling 300, '
  'default 60/80/100 ถ้า<2 สัปดาห์ประวัติ) snapshot ครั้งเดียวตอนตั้งสัปดาห์นั้น ไม่ recompute ทีหลัง. '
  'ไม่มีแถว = สัปดาห์นั้นไม่มีเป้าหมาย (ไม่ auto-carry จาก level สัปดาห์ก่อน).';

commit;
