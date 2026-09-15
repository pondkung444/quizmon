-- Migration: 20260915140000_guardian_module_c_plan_goal_rpcs
-- Guardian (ผู้พิทักษ์) — Module C: RPC layer สำหรับ /guardian/plan + /guardian/goal
-- อ้างอิง: quizmon-guardian-design-2026-09-09.md §5 (Module C)
-- ต่อจาก 20260915120000_guardian_module_c_plan_goal_rebuild.sql (schema + RLS)
--
-- ขอบเขตไฟล์นี้:
--   1) guardian_get_plan            — rewrite ให้ตรง schema ใหม่ (chapter queue)
--   2) guardian_get_available_chapters — RPC ใหม่ ป้อนข้อมูลให้ wizard เลือก/เรียง chapter
--      (แยกออกจาก guardian_create_plan โดยตั้งใจ — "auto-generate initial queue" ตาม framework
--      เป็น business logic ที่ยังไม่ fix แน่นอน (เช่น exam_prep จะ spread ยังไงเป๊ะๆ) ให้ frontend
--      คำนวณลำดับที่เสนอจาก RPC นี้ (chapter_order สำหรับ school, recent_accuracy สำหรับ
--      weak_spot, is_available สำหรับกรอง) แล้วส่ง chapter_keys ที่ยืนยันแล้วเข้า
--      guardian_create_plan — RPC สร้างแผนจึงแค่ validate+persist ไม่ต้องเดา business rule เอง)
--   3) guardian_get_categories      — rewrite จาก category เป็น chapter-level (30 วันล่าสุด)
--   4) guardian_get_goal_progress   — rewrite เป็น 5-band message (ผู้ปกครองเห็นแค่ band ไม่เห็นตัวเลข)
--   5) guardian_create_plan         — wizard-creation RPC (validate framework/duration/exam_date,
--      replace แผน active เดิม, สร้างคิว chapter, ตัวแรกเป็น current)
--   6) guardian_set_plan_chapter_queue — drag/add/remove รวมเป็น endpoint เดียว (ส่ง array
--      chapter_keys ใหม่ทั้งชุด — เหมาะกับ UX drag-and-drop ที่ post ลำดับใหม่ทั้งหมดอยู่แล้ว)
--   7) guardian_advance_plan_if_passed — chapter pass-gate (>=20 attempts, >=70% ใน 15 ครั้งล่าสุด)
--      + stuck-parking (>2 สัปดาห์) + เลื่อนคิว — เรียกโดยนักเรียนเจ้าของบัญชีเอง (ยังไม่ wire เข้า
--      quiz flow จริง — เป็นงาน frontend/session ถัดไป เรียกหลังจบแต่ละ quiz session)
--   8) guardian_set_goal            — ตั้ง goal level รายสัปดาห์ + คำนวณ computed_target ตาม median
--      4 สัปดาห์ล่าสุดที่มีข้อมูล (ไม่นับสัปดาห์ปัจจุบัน), floor 40 ceiling 300, default 60/80/100
--      ถ้า<2 สัปดาห์ประวัติ — เพิ่มเข้ามานอกเหนือรายการที่ระบุตรงๆ เพราะไม่มี write path ไปยัง
--      guardian_goal เลยไม่งั้น (ตาราง RLS ไม่มี insert policy ให้ client เขียนตรง)
--
-- หมายเหตุสำคัญ (ตั้งใจไม่ทำในไฟล์นี้ ต้อง confirm ก่อนทำต่อ):
--   - "reward ทันทีเมื่อข้ามเกณฑ์" ของ goal (spec บอกไม่รอ cron/week-end) — ไม่ implement ในไฟล์นี้
--     เพราะยังไม่มี mechanism/ledger ที่ระบุชัดว่า reward คืออะไร (ไข่? แต้ม?) การเดากลไก reward
--     เองมีความเสี่ยงสูง ต้อง confirm กับปอนด์ก่อนว่า reward table ใช้ตัวไหน
--   - reward ตอน chapter passed ก็เช่นกัน — guardian_advance_plan_if_passed แค่ mark
--     สถานะ passed/stuck และเลื่อนคิว ไม่ได้แจกรางวัลอะไร
--   - guardian_advance_plan_if_passed ยังไม่ถูกเรียกจาก quiz flow จริง (ต้องต่อสายจาก
--     src/app/quiz/actions.ts หรือใกล้เคียงในเซสชันถัดไป)
--   - หน้า child-facing goal (เห็นตัวเลขจริง ไม่ใช่ band) ยังไม่มี RPC เฉพาะ — ต้องสร้างเพิ่ม
--     (ไม่ใช่ guardian_* namespace เพราะ caller เป็นนักเรียนเอง ไม่ใช่ผู้ปกครอง)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) guardian_get_plan — แผน active + คิว chapter ทั้งหมด (เข้าถึงได้ทั้งผู้ปกครองที่ลิงก์แล้วและ
--    ตัวนักเรียนเอง เหมือน behavior เดิม)
-- ============================================================
create or replace function public.guardian_get_plan(p_student_id uuid)
returns table (
  plan_id uuid,
  framework text,
  duration_weeks integer,
  exam_date date,
  plan_status text,
  plan_created_at timestamptz,
  chapter_key text,
  subject text,
  branch text,
  chapter text,
  chapter_queue_order integer,
  chapter_status text,
  entered_current_at timestamptz,
  passed_at timestamptz
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

  if v_uid <> p_student_id and not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงแผนของนักเรียนคนนี้';
  end if;

  return query
  select
    gp.id, gp.framework, gp.duration_weeks, gp.exam_date, gp.status, gp.created_at,
    gpc.chapter_key, cc.subject, cc.branch, cc.chapter, gpc.queue_order, gpc.status,
    gpc.entered_current_at, gpc.passed_at
  from public.guardian_plan gp
  left join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
  left join public.curriculum_chapters cc on cc.chapter_key = gpc.chapter_key
  where gp.student_id = p_student_id and gp.status = 'active'
  order by gpc.queue_order nulls last;
end;
$$;

-- ============================================================
-- 2) guardian_get_available_chapters — chapter ทั้งหมดของ grade_band นักเรียนคนนี้ พร้อม
--    availability + สถิติ 30 วันล่าสุด (ให้ frontend ใช้เรียงลำดับตาม framework ที่เลือก)
-- ============================================================
create or replace function public.guardian_get_available_chapters(p_student_id uuid)
returns table (
  chapter_key text,
  subject text,
  branch text,
  chapter text,
  chapter_order integer,
  question_count integer,
  is_available boolean,
  recent_attempts integer,
  recent_accuracy numeric,
  already_in_active_plan boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_grade_band text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id and not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = p_student_id;

  if v_grade_band is null then
    raise exception 'ไม่พบข้อมูลระดับชั้นของนักเรียนคนนี้';
  end if;

  return query
  select
    cc.chapter_key,
    cc.subject,
    cc.branch,
    cc.chapter,
    cc.chapter_order,
    coalesce(cca.question_count, 0)::integer,
    coalesce(cca.is_available, false),
    coalesce(stats.attempts, 0)::integer as recent_attempts,
    stats.accuracy as recent_accuracy,
    exists (
      select 1 from public.guardian_plan gp
      join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
      where gp.student_id = p_student_id and gp.status = 'active' and gpc.chapter_key = cc.chapter_key
    ) as already_in_active_plan
  from public.curriculum_chapters cc
  join public.curriculum_chapter_availability cca
    on cca.chapter = cc.chapter and cca.subject = cc.subject
    and (cca.branch is not distinct from cc.branch) and cca.grade_band = cc.grade_band
  left join lateral (
    select
      count(*)::integer as attempts,
      round(count(*) filter (where qa.is_correct)::numeric / nullif(count(*), 0) * 100, 0) as accuracy
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and qa.created_at >= now() - interval '30 days'
      and q.subject = cc.subject
      and (q.branch is not distinct from cc.branch)
      and q.grade_band = cc.grade_band
      and q.chapter = cc.chapter
  ) stats on true
  where cc.grade_band = v_grade_band
  order by cc.subject, cc.chapter_order;
end;
$$;

-- ============================================================
-- 3) guardian_get_categories — สรุปหมวดที่นักเรียนตอบ 30 วันล่าสุด ระดับ chapter (ไม่ใช่ category
--    แบบเดิม) — join questions.chapter -> curriculum_chapters.chapter ตามที่ยืนยันแล้วว่าถูกต้อง
--    (ไม่ใช้ questions.category เพราะกว้างกว่า chapter จริง)
-- ============================================================
create or replace function public.guardian_get_categories(p_student_id uuid)
returns table (
  subject text,
  branch text,
  chapter_key text,
  chapter text,
  answered_count integer,
  accuracy numeric,
  tier text
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
  select
    cc.subject,
    cc.branch,
    cc.chapter_key,
    cc.chapter,
    count(*)::integer as answered_count,
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0) as accuracy,
    case
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.80 then 'คล่องแล้ว'
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.50 then 'กำลังไปได้'
      else 'ยังต้องฝึก'
    end as tier
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
    and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= now() - interval '30 days'
  group by cc.chapter_key, cc.subject, cc.branch, cc.chapter
  having count(*) >= 10
  order by cc.subject, cc.chapter;
end;
$$;

-- ============================================================
-- 4) guardian_get_goal_progress — 5-band message ของสัปดาห์ปัจจุบัน (ผู้ปกครองเห็นแค่ band
--    ไม่เห็นตัวเลข target/point ดิบ ตาม spec — เด็กเห็นตัวเลขจริงผ่าน RPC แยกต่างหาก ยังไม่สร้าง)
-- ============================================================
create or replace function public.guardian_get_goal_progress(p_student_id uuid)
returns table (
  week_start date,
  has_goal boolean,
  level text,
  bucket text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
  v_total_points integer;
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

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  select * into v_goal from public.guardian_goal
  where student_id = p_student_id and week_start = v_week_start;

  if not found then
    return query select v_week_start, false, null::text, null::text;
    return;
  end if;

  select coalesce(sum(d.day_points), 0)::integer into v_total_points
  from public.guardian_daily_points_bkk(p_student_id, v_week_start) d;

  return query
  select
    v_week_start,
    true,
    v_goal.level,
    case
      when v_total_points = 0 then 'ยังไม่เริ่ม'
      when v_total_points::numeric / v_goal.computed_target < 0.40 then 'เริ่มแล้ว'
      when v_total_points::numeric / v_goal.computed_target < 0.70 then 'ไปได้ดี'
      when v_total_points::numeric / v_goal.computed_target < 1.00 then 'เกือบถึงแล้ว'
      else 'ถึงเป้าแล้ว'
    end;
end;
$$;

-- ============================================================
-- 5) guardian_create_plan — สร้างแผนใหม่ + คิว chapter (chapter_keys ต้องเรียงลำดับมาจาก
--    frontend แล้ว — ดูหมายเหตุด้านบนว่าทำไมไม่ auto-generate ลำดับใน RPC นี้เอง)
-- ============================================================
create or replace function public.guardian_create_plan(
  p_student_id uuid,
  p_framework text,
  p_duration_weeks integer,
  p_chapter_keys text[],
  p_exam_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_chapter_key text;
  v_order integer := 0;
  v_bad_key text;
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
    raise exception 'ไม่มีสิทธิ์สร้างแผนให้นักเรียนคนนี้';
  end if;

  if p_framework not in ('school', 'weak_spot', 'exam_prep') then
    raise exception 'framework ไม่ถูกต้อง';
  end if;

  if p_duration_weeks not in (4, 8, 12) then
    raise exception 'duration_weeks ต้องเป็น 4, 8 หรือ 12';
  end if;

  if p_framework = 'exam_prep' and (p_exam_date is null or p_exam_date <= current_date) then
    raise exception 'exam_prep ต้องระบุ exam_date ที่เป็นอนาคต';
  end if;

  if p_chapter_keys is null or array_length(p_chapter_keys, 1) is null then
    raise exception 'ต้องเลือกอย่างน้อย 1 บทเรียน';
  end if;

  if (select count(distinct ck) from unnest(p_chapter_keys) ck) <> array_length(p_chapter_keys, 1) then
    raise exception 'chapter_key ซ้ำกันในคิว';
  end if;

  select ck into v_bad_key
  from unnest(p_chapter_keys) ck
  where not exists (select 1 from public.curriculum_chapters cc where cc.chapter_key = ck)
  limit 1;

  if v_bad_key is not null then
    raise exception 'chapter_key ไม่ถูกต้อง: %', v_bad_key;
  end if;

  -- แผนเดิม (ถ้ามี) ต้อง replaced ก่อน ไม่งั้น partial unique index
  -- guardian_plan_one_active_per_student จะ block insert
  update public.guardian_plan
  set status = 'replaced', replaced_at = now()
  where student_id = p_student_id and status = 'active';

  insert into public.guardian_plan (guardian_id, student_id, framework, duration_weeks, exam_date)
  values (
    v_uid, p_student_id, p_framework, p_duration_weeks,
    case when p_framework = 'exam_prep' then p_exam_date else null end
  )
  returning id into v_plan_id;

  foreach v_chapter_key in array p_chapter_keys loop
    insert into public.guardian_plan_chapters (plan_id, chapter_key, queue_order, status, entered_current_at)
    values (
      v_plan_id, v_chapter_key, v_order,
      case when v_order = 0 then 'current' else 'pending' end,
      case when v_order = 0 then now() else null end
    );
    v_order := v_order + 1;
  end loop;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, p_student_id, 'view_plan');

  return v_plan_id;
end;
$$;

-- ============================================================
-- 6) guardian_set_plan_chapter_queue — reorder/add/remove รวมเป็น endpoint เดียว รับ array
--    chapter_keys ใหม่ทั้งชุด (เฉพาะส่วน pending/current/stuck — passed เก็บเป็นประวัติ ไม่แก้)
-- ============================================================
create or replace function public.guardian_set_plan_chapter_queue(p_plan_id uuid, p_chapter_keys text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_chapter_key text;
  v_order integer;
  v_bad_key text;
  v_current_removed boolean;
  v_next_current_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_plan from public.guardian_plan where id = p_plan_id;

  if not found or v_plan.guardian_id <> v_uid then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if v_plan.status <> 'active' then
    raise exception 'แก้ไขได้เฉพาะแผนที่ active อยู่';
  end if;

  if p_chapter_keys is null or array_length(p_chapter_keys, 1) is null then
    raise exception 'คิวต้องมีอย่างน้อย 1 บทเรียน';
  end if;

  if (select count(distinct ck) from unnest(p_chapter_keys) ck) <> array_length(p_chapter_keys, 1) then
    raise exception 'chapter_key ซ้ำกันในคิว';
  end if;

  select ck into v_bad_key
  from unnest(p_chapter_keys) ck
  where not exists (select 1 from public.curriculum_chapters cc where cc.chapter_key = ck)
  limit 1;

  if v_bad_key is not null then
    raise exception 'chapter_key ไม่ถูกต้อง: %', v_bad_key;
  end if;

  select (gpc.chapter_key <> all (p_chapter_keys)) into v_current_removed
  from public.guardian_plan_chapters gpc
  where gpc.plan_id = p_plan_id and gpc.status = 'current';

  -- ลบ chapter ที่ไม่ passed และไม่อยู่ในคิวใหม่แล้ว (passed คือประวัติ แก้ไม่ได้ผ่าน endpoint นี้)
  delete from public.guardian_plan_chapters
  where plan_id = p_plan_id
    and status <> 'passed'
    and chapter_key <> all (p_chapter_keys);

  -- เพิ่ม chapter ใหม่ที่ยังไม่เคยอยู่ในแผน (pending) — ตัวที่มีอยู่แล้ว (รวม passed) ถูกข้ามด้วย
  -- on conflict
  foreach v_chapter_key in array p_chapter_keys loop
    insert into public.guardian_plan_chapters (plan_id, chapter_key, queue_order, status)
    values (p_plan_id, v_chapter_key, 0, 'pending')
    on conflict (plan_id, chapter_key) do nothing;
  end loop;

  -- เรียง queue_order ใหม่ตามลำดับที่ส่งมา (เฉพาะแถวที่ไม่ passed)
  v_order := 0;
  foreach v_chapter_key in array p_chapter_keys loop
    update public.guardian_plan_chapters
    set queue_order = v_order
    where plan_id = p_plan_id and chapter_key = v_chapter_key and status <> 'passed';
    v_order := v_order + 1;
  end loop;

  -- ถ้า current chapter เดิมถูกเอาออกจากคิว ให้เลื่อน chapter แรกที่เป็น pending ขึ้นเป็น current
  if v_current_removed then
    select chapter_key into v_next_current_key
    from public.guardian_plan_chapters
    where plan_id = p_plan_id and status = 'pending'
    order by queue_order
    limit 1;

    if v_next_current_key is not null then
      update public.guardian_plan_chapters
      set status = 'current', entered_current_at = now()
      where plan_id = p_plan_id and chapter_key = v_next_current_key;
    end if;
  end if;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, v_plan.student_id, 'view_plan');
end;
$$;

-- ============================================================
-- 7) guardian_advance_plan_if_passed — chapter pass-gate: >=20 attempts และ >=70% accuracy
--    ใน 15 attempts ล่าสุดของ chapter ปัจจุบัน หรือ stuck (>14 วัน) -> park + เลื่อนคิว
--    เรียกโดยตัวนักเรียนเจ้าของบัญชีเอง (ยังไม่ wire เข้า quiz flow จริงในไฟล์นี้)
-- ============================================================
create or replace function public.guardian_advance_plan_if_passed(p_student_id uuid)
returns table (chapter_key text, new_status text, promoted_chapter_key text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean := false;
  v_stuck boolean := false;
  v_next_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id then
    raise exception 'เรียกได้เฉพาะตัวนักเรียนเจ้าของบัญชีเท่านั้น';
  end if;

  select * into v_plan from public.guardian_plan
  where student_id = p_student_id and status = 'active';

  if not found then
    return;
  end if;

  select * into v_current from public.guardian_plan_chapters
  where plan_id = v_plan.id and status = 'current';

  if not found then
    return;
  end if;

  select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

  select count(*) into v_total_attempts
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.user_id = p_student_id
    and qa.source is null
    and q.subject = v_cc.subject
    and (q.branch is not distinct from v_cc.branch)
    and q.grade_band = v_cc.grade_band
    and q.chapter = v_cc.chapter;

  select count(*) filter (where sub.is_correct), count(*)
    into v_recent_correct, v_recent_count
  from (
    select qa.is_correct
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and q.subject = v_cc.subject
      and (q.branch is not distinct from v_cc.branch)
      and q.grade_band = v_cc.grade_band
      and q.chapter = v_cc.chapter
    order by qa.created_at desc
    limit 15
  ) sub;

  if v_total_attempts >= 20 and v_recent_count > 0
     and v_recent_correct::numeric / v_recent_count >= 0.70 then
    v_passed := true;
  elsif v_current.entered_current_at is not null
    and v_current.entered_current_at < now() - interval '14 days' then
    v_stuck := true;
  end if;

  if v_passed then
    update public.guardian_plan_chapters
    set status = 'passed', passed_at = now()
    where id = v_current.id;
  elsif v_stuck and v_current.status <> 'stuck' then
    update public.guardian_plan_chapters
    set status = 'stuck'
    where id = v_current.id;
  else
    return query select v_current.chapter_key, v_current.status, null::text;
    return;
  end if;

  select gpc.chapter_key into v_next_key
  from public.guardian_plan_chapters gpc
  where gpc.plan_id = v_plan.id and gpc.status = 'pending'
  order by gpc.queue_order
  limit 1;

  if v_next_key is not null then
    update public.guardian_plan_chapters
    set status = 'current', entered_current_at = now()
    where plan_id = v_plan.id and chapter_key = v_next_key;
  else
    update public.guardian_plan
    set status = 'completed'
    where id = v_plan.id;
  end if;

  return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;
end;
$$;

-- ============================================================
-- 8) guardian_set_goal — ตั้ง/แก้ level ของสัปดาห์ปัจจุบัน + snapshot computed_target
--    (median 4 สัปดาห์ล่าสุดที่มีข้อมูลจริง ไม่รวมสัปดาห์นี้, floor 40 ceiling 300,
--    default ตายตัว 60/80/100 ถ้านักเรียนมีประวัติ <2 สัปดาห์)
-- ============================================================
create or replace function public.guardian_set_goal(p_student_id uuid, p_level text)
returns table (week_start date, level text, computed_target integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_grade_band text;
  v_points integer[] := array[]::integer[];
  v_candidate_week date;
  v_week_points integer;
  v_median numeric;
  v_multiplier numeric;
  v_target integer;
  v_weeks_found integer := 0;
  i integer;
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
    raise exception 'ไม่มีสิทธิ์ตั้งเป้าหมายให้นักเรียนคนนี้';
  end if;

  if p_level not in ('relaxed', 'steady', 'challenging') then
    raise exception 'level ไม่ถูกต้อง';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = p_student_id;

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  -- ไล่ย้อนหลังสูงสุด 8 สัปดาห์ เก็บสูงสุด 4 สัปดาห์ล่าสุดที่มี activity จริง (ไม่รวมสัปดาห์ปัจจุบัน)
  for i in 1..8 loop
    exit when v_weeks_found >= 4;
    v_candidate_week := v_week_start - (7 * i);

    select ws.total_points into v_week_points
    from public.weekly_scores_bkk_for_week(v_candidate_week, v_grade_band) ws
    where ws.user_id = p_student_id;

    if found then
      v_points := array_append(v_points, v_week_points);
      v_weeks_found := v_weeks_found + 1;
    end if;
  end loop;

  if v_weeks_found < 2 then
    v_target := case p_level
      when 'relaxed' then 60
      when 'steady' then 80
      else 100
    end;
  else
    select percentile_cont(0.5) within group (order by v)
    into v_median
    from unnest(v_points) v;

    v_multiplier := case p_level
      when 'relaxed' then 1.0
      when 'steady' then 1.3
      else 1.6
    end;

    v_target := greatest(40, least(300, round(v_median * v_multiplier)::integer));
  end if;

  insert into public.guardian_goal (student_id, level, week_start, computed_target)
  values (p_student_id, p_level, v_week_start, v_target)
  on conflict (student_id, week_start)
  do update set level = excluded.level, computed_target = excluded.computed_target;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, p_student_id, 'set_goal');

  return query select v_week_start, p_level, v_target;
end;
$$;

commit;
