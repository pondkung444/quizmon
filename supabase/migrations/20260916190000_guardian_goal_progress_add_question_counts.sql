-- Migration: guardian_goal_progress_add_question_counts
-- เพิ่ม total_questions/total_correct ใน guardian_get_goal_progress() ตามคำขอ ปอนด์ 2026-09-16
-- Apply บน prod แล้ว (wmndxiuqzrnqbhrznmfg) verify ผ่าน simulated session แล้ว — ไฟล์นี้แค่ sync
-- เข้า repo ตาม pattern เดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.guardian_get_goal_progress(uuid);

create function public.guardian_get_goal_progress(p_student_id uuid)
returns table (
  goal_week_start date,
  has_goal boolean,
  goal_level text,
  bucket text,
  total_questions integer,
  total_correct integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_week_start_ts timestamptz;
  v_week_end_ts timestamptz;
  v_goal public.guardian_goal;
  v_total_points integer;
  v_total_q integer;
  v_total_correct integer;
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

  select wb.week_start_date, wb.week_start, wb.week_end
  into v_week_start, v_week_start_ts, v_week_end_ts
  from public.current_week_bounds_bkk() wb;

  select count(*)::integer, coalesce(sum((qa.is_correct)::integer), 0)::integer
  into v_total_q, v_total_correct
  from public.quiz_attempts qa
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= v_week_start_ts
    and qa.created_at < v_week_end_ts;

  select * into v_goal from public.guardian_goal
  where student_id = p_student_id and week_start = v_week_start;

  if not found then
    return query select v_week_start, false, null::text, null::text, v_total_q, v_total_correct;
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
    end,
    v_total_q,
    v_total_correct;
end;
$$;

comment on function public.guardian_get_goal_progress(uuid) is
  'ผู้ปกครองดูความคืบหน้าเป้าสัปดาห์นี้ — bucket เป็นข้อความเท่านั้น (ไม่มี %/target ตาม §5.7) '
  'บวก total_questions/total_correct เป็นตัวเลขดิบเสริม (เพิ่ม 2026-09-16 ตามคำขอ) ไม่เทียบเป้า.';

commit;
