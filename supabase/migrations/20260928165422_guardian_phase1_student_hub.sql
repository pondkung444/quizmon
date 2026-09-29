-- Guardian เฟส 1 — ศูนย์ผู้พิทักษ์ฝั่งเด็ก (แท็บสังคม, อ่านอย่างเดียว)  [ปอนด์เลือกทาง A 2026-09-28]
--
-- ทำไมเป็น RPC ใหม่ตัวเดียว แทนการขยาย self-access ของ RPC เดิม 4 ตัว:
--   - RPC เดิม (guardian_get_goal_points / guardian_get_plan / ...) self-branch ผูกกับ Premium (self_serve_enrollment)
--     ถ้าไปขยายเงื่อนไข จะแตะทุกตัวที่ /my-plan กับหน้าผู้ปกครองใช้อยู่ — เสี่ยงกว่า และสิทธิ์กระจายหลายจุด
--   - ตัวนี้ไม่มี parameter เลย อ่านได้เฉพาะข้อมูลของ auth.uid() เอง → ไม่มีทางอ่านของคนอื่น (F3: จุดควบคุมเดียว)
--   - คืนเฉพาะสิ่งที่ spec §7.2 ให้เด็กเห็น: เป้าสัปดาห์นี้พร้อมตัวเลข + รางวัลถัดไป + บทที่กำลังทบทวน
--     (ผู้พิทักษ์ของฉัน มาจาก guardian_get_link_status เดิม / "สิ่งที่ผู้พิทักษ์เห็น" เป็นข้อความคงที่ฝั่ง UI)
--   - ไม่คืนเวลาที่ผู้พิทักษ์เปิดดู (Q9: spec §10.1 ห้ามแจ้งเด็ก)
--
-- เงื่อนไขเห็นข้อมูล: ต้องมีลิงก์ claimed อย่างน้อย 1 ลิงก์ (ไม่ต้องมี Premium) · ไม่มีลิงก์ → {"has_guardian": false}
-- gate is_guardian_admin เหมือน RPC ผู้พิทักษ์ทุกตัว (allowlist ช่วง pilot)
--
-- รูปแบบผลลัพธ์ (jsonb):
-- {
--   "has_guardian": true,
--   "goal": null | { "level": "relaxed|steady|challenging", "total_points": int, "target": int, "reached": bool },
--   "reward": { "reached_weeks": int, "next_frame_id": "guardian_basic"|"guardian_mid"|null, "weeks_to_next": int|null },
--   "plan": null | { "framework": text, "duration_weeks": int, "exam_date": date|null,
--                    "subjects": [ { "subject": "math|science", "current_chapter": text|null,
--                                    "position": int, "total": int, "done": bool } ] }
-- }
-- position/total ต่อวิชา: ไม่นับบทที่ผ่านก่อนวันเริ่มแผน (เงื่อนไขเดียวกับ target week ใน guardian_advance_plan_if_passed)
--   position = บทที่ผ่าน/พักไว้ในแผนแล้ว + 1 (บท current) · ถ้าหมดคิววิชานั้น position = total, done = true
--   ไม่มีคำว่า "ช้ากว่าแผน" — มีแค่ "บทที่ X จาก N" (spec §5.3)

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

  -- เป้าสัปดาห์นี้ (เด็กเห็นตัวเลข — §5.7)
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

  -- รางวัลถัดไปจากเป้า (สอดคล้อง guardian_check_weekly_goal_reward: ครั้งแรก = basic, ครบ 4 = mid)
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

  -- แผนที่ active (บทที่กำลังทบทวน ต่อวิชา)
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

  return jsonb_build_object(
    'has_guardian', true,
    'goal', v_goal_json,
    'reward', jsonb_build_object(
      'reached_weeks', v_reached_weeks,
      'next_frame_id', v_next_frame,
      'weeks_to_next', v_weeks_to_next
    ),
    'plan', v_plan_json
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardian_get_my_hub() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardian_get_my_hub() TO authenticated, service_role;

COMMENT ON FUNCTION public.guardian_get_my_hub() IS
  'ศูนย์ผู้พิทักษ์ฝั่งเด็ก (เฟส 1): เป้าสัปดาห์นี้+ตัวเลข, รางวัลกรอบถัดไป, บท current ต่อวิชา "บทที่ X จาก N" — อ่านได้เฉพาะของตัวเอง ต้องมีลิงก์ claimed ไม่ต้องมี Premium ไม่คืนเวลาที่ผู้พิทักษ์เปิดดู';
