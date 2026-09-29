-- Guardian เฟส 2 — โหมดทบทวน (ปอนด์ตัดสินใจ 2026-09-29: Q3 = วันรุ่งขึ้น, Q4 = ตามข้อเสนอ)
--
-- 1) ตาราง guardian_review_pause — "พักโหมดทบทวนวันนี้" (วันตามเวลาไทย) 2 สาเหตุ:
--      'student_closed' เด็กกดปิดเอง (spec §5.5: ปิดถึงสิ้นวัน แล้วกลับมาเปิดเองพรุ่งนี้)
--      'chapter_passed' ผ่านบท → ปิดอัตโนมัติถึงสิ้นวัน บทใหม่เริ่มพรุ่งนี้ (Q3 / §5.5)
--    รีเซ็ตเองทุกวันเพราะ key คือ (student_id, pause_date) — ไม่ต้องมี cron
-- 2) guardian_pause_review_today() — เด็กกดปิดเอง (ใช้ได้ทั้งแผนผู้ปกครองและแผน self-serve → ไม่ gate allowlist)
-- 3) guardian_get_injection_state(student, subject) — ให้ startQuizRound (service_role) ถามว่าวันนี้:
--      paused  = พักอยู่ไหม → ไม่ดึงข้อจากแผนเลย
--      reduced = ลดสัดส่วนไหม (Q4): ข้อในบท current ของวิชานั้น (นับตั้งแต่บทขึ้นคิว) ใน 3 วันล่าสุดที่เด็กเล่นจริง
--                ≥10 ข้อ และถูก <40% → ดึงจากแผน 1/5 แทน 3/5 · กลับคืนเองเมื่อ ≥40% · ไม่แจ้งใคร
-- 4) guardian_advance_plan_if_passed — ผ่านบทแล้ว insert pause 'chapter_passed' + คืน egg_awarded
--    (เปลี่ยน return type → ต้อง DROP + CREATE · โค้ดที่ deploy อยู่ไม่อ่านผลลัพธ์ จึงไม่กระทบ)
-- 5) guardian_check_weekly_goal_reward — คืน frame_id ที่เพิ่งได้ (หรือ NULL) แทน void ให้หน้าสรุปรอบแสดงได้
--    (เปลี่ยน return type → DROP + CREATE · โค้ดที่ deploy อยู่ไม่อ่านผลลัพธ์ จึงไม่กระทบ)
-- 6) guardian_get_my_hub — เพิ่ม "review_paused_today": null | 'student_closed' | 'chapter_passed'
--
-- DB-side เท่านั้น: ป้าย "กำลังทบทวน: X" / ปุ่มปิด / การใช้ reduced ใน startQuizRound / หน้าสรุปรอบ เป็นงาน Claude Code

-- =====================================================================
-- 1) ตาราง
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.guardian_review_pause (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pause_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('student_closed', 'chapter_passed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, pause_date)
);

ALTER TABLE public.guardian_review_pause ENABLE ROW LEVEL SECURITY;

-- เด็กอ่านของตัวเองได้ (เผื่อ UI) · เขียนผ่าน RPC เท่านั้น (ไม่มี insert/update/delete policy)
DROP POLICY IF EXISTS guardian_review_pause_select_own ON public.guardian_review_pause;
CREATE POLICY guardian_review_pause_select_own ON public.guardian_review_pause
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- =====================================================================
-- 2) เด็กกดปิดเอง
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guardian_pause_review_today()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- ไม่มีแผน active = ไม่มีอะไรให้ปิด (no-op เงียบๆ)
  if not exists (
    select 1 from public.guardian_plan gp where gp.student_id = v_uid and gp.status = 'active'
  ) then
    return;
  end if;

  -- ถ้าวันนี้พักอยู่แล้ว (เช่นผ่านบท) คงเหตุผลเดิมไว้
  insert into public.guardian_review_pause (student_id, pause_date, reason)
  values (v_uid, (now() at time zone 'Asia/Bangkok')::date, 'student_closed')
  on conflict (student_id, pause_date) do nothing;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardian_pause_review_today() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardian_pause_review_today() TO authenticated, service_role;

-- =====================================================================
-- 3) สถานะการดึงข้อจากแผน (เรียกจาก server เท่านั้น — service_role)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guardian_get_injection_state(p_student_id uuid, p_subject text)
 RETURNS TABLE(paused boolean, pause_reason text, reduced boolean, recent_count integer, recent_accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_reason text;
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_count integer := 0;
  v_correct integer := 0;
begin
  select rp.reason into v_reason
  from public.guardian_review_pause rp
  where rp.student_id = p_student_id and rp.pause_date = v_today;

  select * into v_plan from public.guardian_plan gp
  where gp.student_id = p_student_id and gp.status = 'active';

  if found then
    select * into v_current from public.guardian_plan_chapters c
    where c.plan_id = v_plan.id and c.status = 'current' and c.subject = p_subject
    limit 1;

    if found then
      select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

      -- 3 วันล่าสุด (เวลาไทย) ที่เด็กเล่น main loop จริง — ไม่ใช่ 3 วันปฏิทิน (เด็กหายไปหลายวันไม่ถูกนับ)
      with play_days as (
        select distinct (qa.created_at at time zone 'Asia/Bangkok')::date as d
        from public.quiz_attempts qa
        where qa.user_id = p_student_id and qa.source is null
        order by 1 desc
        limit 3
      )
      select count(*)::int, count(*) filter (where qa.is_correct)::int
        into v_count, v_correct
      from public.quiz_attempts qa
      join public.questions q on q.id = qa.question_id
      where qa.user_id = p_student_id
        and qa.source is null
        and qa.created_at >= coalesce(v_current.entered_current_at, v_plan.created_at)
        and (qa.created_at at time zone 'Asia/Bangkok')::date in (select d from play_days)
        and q.subject = v_cc.subject
        and (q.branch is not distinct from v_cc.branch)
        and q.grade_band = v_cc.grade_band
        and q.chapter = v_cc.chapter;
    end if;
  end if;

  return query select
    v_reason is not null,
    v_reason,
    (v_count >= 10 and v_correct::numeric / v_count < 0.40),
    v_count,
    case when v_count > 0 then round(v_correct::numeric / v_count * 100, 1) end;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardian_get_injection_state(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_get_injection_state(uuid, text) TO service_role;

-- =====================================================================
-- 4) advance: ผ่านบท → พักถึงสิ้นวัน + คืน egg_awarded
--    เนื้อหาเหมือน 20260928160032 ทุกบรรทัด ยกเว้นจุดที่ติด NEW (2026-09-29)
-- =====================================================================

DROP FUNCTION IF EXISTS public.guardian_advance_plan_if_passed(uuid);

CREATE FUNCTION public.guardian_advance_plan_if_passed(p_student_id uuid)
 RETURNS TABLE(affected_chapter_key text, new_status text, promoted_chapter_key text, egg_awarded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_since timestamptz;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean;
  v_stuck boolean;
  v_target_week integer;
  v_real_week integer;
  v_next_key text;
  v_passed_chapter_count integer;
  v_egg boolean;                                          -- NEW (2026-09-29)
  v_reward_egg_type_id constant text := 'egg_epic_02'; -- hardcoded per ปอนด์ decision (2026-09-17)
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

  v_real_week := greatest(0, least(
    v_plan.duration_weeks - 1,
    ((now() at time zone 'Asia/Bangkok')::date - (v_plan.created_at at time zone 'Asia/Bangkok')::date) / 7
  ));

  -- one current per subject: evaluate each independently
  for v_current in
    select * from public.guardian_plan_chapters
    where plan_id = v_plan.id and status = 'current'
    order by subject, queue_order
    for update
  loop
    -- catch-up: เช็คบท current ของวิชานี้ซ้ำไปเรื่อยๆ หลัง promote จนกว่าจะไม่ค้างอีก หรือหมดคิว
    -- เพื่อให้เด็กที่หายไปหลายสัปดาห์กระโดดไปบทที่ควรเรียน ณ ตอนนี้ได้ในครั้งเดียว
    loop
      v_passed := false;
      v_stuck := false;
      v_egg := false;                                     -- NEW (2026-09-29)

      select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

      -- (2026-09-28): นับเฉพาะข้อหลังบทนี้ขึ้นเป็น current
      v_since := coalesce(v_current.entered_current_at, v_plan.created_at);

      select count(*) into v_total_attempts
      from public.quiz_attempts qa
      join public.questions q on q.id = qa.question_id
      where qa.user_id = p_student_id
        and qa.source is null
        and qa.created_at >= v_since
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
          and qa.created_at >= v_since
          and q.subject = v_cc.subject
          and (q.branch is not distinct from v_cc.branch)
          and q.grade_band = v_cc.grade_band
          and q.chapter = v_cc.chapter
        order by qa.created_at desc
        limit 15
      ) sub;

      -- target week ของบท current นี้ตามคิวที่วางแผนไว้ — สูตรเดียวกับ placeChapters() ฝั่ง frontend
      -- (เรียง queue_order ข้ามทุกสถานะของวิชานั้น ไม่รวมบทที่ผ่านก่อนวันเริ่มแผน)
      select floor(r.i * v_plan.duration_weeks::numeric / r.m)::int
        into v_target_week
      from (
        select gpc.id,
          row_number() over (order by gpc.queue_order, gpc.id) - 1 as i,
          count(*) over () as m
        from public.guardian_plan_chapters gpc
        where gpc.plan_id = v_plan.id
          and gpc.subject = v_current.subject
          and not (
            gpc.status = 'passed'
            and gpc.passed_at is not null
            and (gpc.passed_at at time zone 'Asia/Bangkok')::date
              < (v_plan.created_at at time zone 'Asia/Bangkok')::date
          )
      ) r
      where r.id = v_current.id;

      v_target_week := least(v_target_week, v_plan.duration_weeks - 1);

      if v_total_attempts >= 20 and v_recent_count > 0
         and v_recent_correct::numeric / v_recent_count >= 0.70 then
        v_passed := true;
      elsif v_real_week > v_target_week then
        v_stuck := true;
      end if;

      if not v_passed and not v_stuck then
        return query select v_current.chapter_key, v_current.status, null::text, false;
        exit; -- บทนี้ยังไม่ถึงกำหนดเลื่อน — ไปวิชาถัดไป
      end if;

      if v_passed then
        update public.guardian_plan_chapters
        set status = 'passed', passed_at = now()
        where id = v_current.id;

        -- (2026-09-28, Q1): ไข่ที่บทที่ 1, 3, 5, … ของแผน นับเฉพาะบทที่ผ่านตั้งแต่วันเริ่มแผน
        select count(*) into v_passed_chapter_count
        from public.guardian_plan_chapters gpc
        where gpc.plan_id = v_plan.id
          and gpc.status = 'passed'
          and gpc.passed_at is not null
          and (gpc.passed_at at time zone 'Asia/Bangkok')::date
            >= (v_plan.created_at at time zone 'Asia/Bangkok')::date;

        if v_passed_chapter_count % 2 = 1 then
          insert into public.player_eggs (user_id, egg_type_id, source)
          values (p_student_id, v_reward_egg_type_id, 'guardian_plan_reward');
          v_egg := true;                                  -- NEW (2026-09-29)
        end if;

        -- NEW (2026-09-29, Q3): ผ่านบท → โหมดทบทวนปิดถึงสิ้นวัน บทใหม่เริ่มดึงคำถามพรุ่งนี้ (spec §5.5)
        -- ถ้าเด็กกดปิดเองไปก่อนแล้ววันนี้ คงเหตุผลเดิมไว้
        insert into public.guardian_review_pause (student_id, pause_date, reason)
        values (p_student_id, (now() at time zone 'Asia/Bangkok')::date, 'chapter_passed')
        on conflict (student_id, pause_date) do nothing;
      else
        update public.guardian_plan_chapters
        set status = 'stuck'
        where id = v_current.id;
      end if;

      -- promote the next pending chapter of the SAME subject only
      select gpc.chapter_key into v_next_key
      from public.guardian_plan_chapters gpc
      where gpc.plan_id = v_plan.id and gpc.subject = v_current.subject and gpc.status = 'pending'
      order by gpc.queue_order
      limit 1;

      if v_next_key is not null then
        update public.guardian_plan_chapters
        set status = 'current', entered_current_at = now()
        where plan_id = v_plan.id and chapter_key = v_next_key;
      end if;

      return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key, v_egg;

      exit when v_next_key is null; -- หมดคิววิชานี้แล้ว

      select * into v_current from public.guardian_plan_chapters
      where plan_id = v_plan.id and chapter_key = v_next_key
      for update;
    end loop;
  end loop;

  -- plan is done once no subject has a current or pending chapter left
  if not exists (
    select 1 from public.guardian_plan_chapters
    where plan_id = v_plan.id and status in ('current', 'pending')
  ) then
    update public.guardian_plan set status = 'completed' where id = v_plan.id;

    perform public.grant_profile_frame(p_student_id, 'guardian_special', 'guardian_plan_complete');
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardian_advance_plan_if_passed(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardian_advance_plan_if_passed(uuid) TO authenticated, service_role;

-- =====================================================================
-- 5) goal reward: คืน frame_id ที่เพิ่งได้ (NULL = ไม่ได้อะไรใหม่รอบนี้)
--    ตรรกะเหมือนเดิมทุกบรรทัด เปลี่ยนแค่ return
-- =====================================================================

DROP FUNCTION IF EXISTS public.guardian_check_weekly_goal_reward();

CREATE FUNCTION public.guardian_check_weekly_goal_reward()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
  v_total_points integer;
  v_inserted public.guardian_goal_reached_weeks;
  v_total_reached integer;
begin
  if v_uid is null then
    return null;
  end if;

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  select * into v_goal from public.guardian_goal
  where student_id = v_uid and week_start = v_week_start;

  if not found then
    return null;
  end if;

  select coalesce(sum(d.day_points), 0) into v_total_points
  from public.guardian_daily_points_bkk(v_uid, v_week_start) d;

  if v_total_points < v_goal.computed_target then
    return null;
  end if;

  insert into public.guardian_goal_reached_weeks (student_id, week_start)
  values (v_uid, v_week_start)
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.student_id is null then
    return null;
  end if;

  select count(*) into v_total_reached
  from public.guardian_goal_reached_weeks ggw
  where ggw.student_id = v_uid;

  if v_total_reached = 1 then
    perform public.grant_profile_frame(v_uid, 'guardian_basic', 'guardian_goal_first_week');
    return 'guardian_basic';
  elsif v_total_reached = 4 then
    perform public.grant_profile_frame(v_uid, 'guardian_mid', 'guardian_goal_4_weeks');
    return 'guardian_mid';
  end if;

  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardian_check_weekly_goal_reward() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardian_check_weekly_goal_reward() TO authenticated, service_role;

-- =====================================================================
-- 6) hub: เพิ่ม review_paused_today (เนื้อหาเดิมจาก 20260928165422 + จุด NEW)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guardian_get_my_hub()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
  v_points integer;
  v_reached_weeks integer;
  v_goal_json jsonb := null;
  v_plan public.guardian_plan;
  v_plan_json jsonb := null;
  v_next_frame text;
  v_weeks_to_next integer;
  v_pause_reason text;                                    -- NEW (2026-09-29)
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (
    select 1 from public.guardian_links gl
    where gl.student_id = v_uid and gl.status = 'claimed'
  ) then
    return jsonb_build_object('has_guardian', false);
  end if;

  select b.week_start_date into v_week_start from public.current_week_bounds_bkk() b;

  select * into v_goal from public.guardian_goal g
  where g.student_id = v_uid and g.week_start = v_week_start;

  if found then
    select coalesce(sum(d.day_points), 0)::int into v_points
    from public.guardian_daily_points_bkk(v_uid, v_week_start) d;

    v_goal_json := jsonb_build_object(
      'level', v_goal.level,
      'total_points', v_points,
      'target', v_goal.computed_target,
      'reached', v_points >= v_goal.computed_target
    );
  end if;

  select count(*)::int into v_reached_weeks
  from public.guardian_goal_reached_weeks w
  where w.student_id = v_uid;

  if v_reached_weeks = 0 then
    v_next_frame := 'guardian_basic';
    v_weeks_to_next := 1;
  elsif v_reached_weeks < 4 then
    v_next_frame := 'guardian_mid';
    v_weeks_to_next := 4 - v_reached_weeks;
  else
    v_next_frame := null;
    v_weeks_to_next := null;
  end if;

  select * into v_plan from public.guardian_plan gp
  where gp.student_id = v_uid and gp.status = 'active';

  if found then
    select jsonb_build_object(
      'framework', v_plan.framework,
      'duration_weeks', v_plan.duration_weeks,
      'exam_date', v_plan.exam_date,
      'subjects', coalesce(jsonb_agg(s.obj order by s.subject), '[]'::jsonb)
    )
    into v_plan_json
    from (
      select
        c.subject,
        jsonb_build_object(
          'subject', c.subject,
          'current_chapter', max(cc.chapter) filter (where c.status = 'current'),
          'total', count(*),
          'position', least(
            count(*),
            count(*) filter (where c.status in ('passed', 'stuck'))
              + (case when bool_or(c.status = 'current') then 1 else 0 end)
          ),
          'done', not bool_or(c.status in ('current', 'pending'))
        ) as obj
      from public.guardian_plan_chapters c
      join public.curriculum_chapters cc on cc.chapter_key = c.chapter_key
      where c.plan_id = v_plan.id
        and not (
          c.status = 'passed'
          and c.passed_at is not null
          and (c.passed_at at time zone 'Asia/Bangkok')::date
            < (v_plan.created_at at time zone 'Asia/Bangkok')::date
        )
      group by c.subject
    ) s;
  end if;

  -- NEW (2026-09-29): วันนี้พักโหมดทบทวนอยู่ไหม (เด็กกดปิด / ผ่านบทวันนี้)
  select rp.reason into v_pause_reason
  from public.guardian_review_pause rp
  where rp.student_id = v_uid and rp.pause_date = (now() at time zone 'Asia/Bangkok')::date;

  return jsonb_build_object(
    'has_guardian', true,
    'goal', v_goal_json,
    'reward', jsonb_build_object(
      'reached_weeks', v_reached_weeks,
      'next_frame_id', v_next_frame,
      'weeks_to_next', v_weeks_to_next
    ),
    'plan', v_plan_json,
    'review_paused_today', v_pause_reason                 -- NEW
  );
end;
$function$;
