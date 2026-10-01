-- เปิดฝั่ง "นักเรียน" ของระบบผู้พิทักษ์ให้ทุกคน (ม.1–3) โดยไม่ต้องอยู่ใน guardian_admin
-- เอา is_guardian_admin() ออกเฉพาะ 4 RPC ที่เป็นของนักเรียนล้วน (ใช้ auth.uid() ของเด็กเอง):
--   guardian_create_invite_code, guardian_get_link_status, guardian_revoke_link, guardian_get_my_hub
-- ฝั่งผู้ปกครอง/ครู (claim, get_students, create_plan/set_goal ให้คนอื่น, get_*, quest ฯลฯ) ยังเช็ค allowlist เหมือนเดิม
-- ข้อจำกัด junior-only ของ guardian_create_invite_code คงไว้

create or replace function public.guardian_create_invite_code()
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if coalesce((select p.grade_band from public.profiles p where p.id = v_uid), '') <> 'junior' then
    raise exception 'ระบบผู้พิทักษ์ยังเปิดให้ ม.1–3 ก่อน';
  end if;

  update public.guardian_links
  set status = 'revoked'
  where student_id = v_uid and status = 'pending';

  loop
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 8)
    );
    exit when not exists (
      select 1 from public.guardian_links gl where gl.invite_code = v_code and gl.status = 'pending'
    );
  end loop;

  v_expires := now() + interval '24 hours';

  insert into public.guardian_links (student_id, invite_code, expires_at)
  values (v_uid, v_code, v_expires);

  return query select v_code, v_expires;
end;
$$;

create or replace function public.guardian_get_link_status()
returns table(kind text, link_id uuid, link_invite_code text, link_expires_at timestamptz,
              linked_guardian_id uuid, guardian_display_name text, link_claimed_at timestamptz)
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

create or replace function public.guardian_revoke_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_guardian_id uuid;
  v_week_start date;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  update public.guardian_links
  set status = 'revoked',
      revoked_guardian_id = guardian_id,   -- จำไว้ก่อนล้าง (สำหรับข้อความฝั่งผู้ปกครอง)
      revoked_at = now(),
      guardian_id = null,
      claimed_at = null
  where id = p_link_id and student_id = v_uid and status = 'claimed'
  returning revoked_guardian_id into v_guardian_id;

  if v_guardian_id is null then
    raise exception 'ไม่พบการเชื่อมต่อนี้ หรือถูกถอดไปแล้ว';
  end if;

  -- แผนที่ผู้พิทักษ์คนนี้สร้างหยุดทันที → startQuizRound กลับเป็นสุ่ม 100% เอง (อ่านแค่ active)
  update public.guardian_plan
  set status = 'revoked', replaced_at = now()
  where student_id = v_uid and guardian_id = v_guardian_id and status = 'active';

  -- เป้าสัปดาห์นี้/ล่วงหน้าหยุดด้วย — เฉพาะเมื่อไม่เหลือผู้พิทักษ์คนอื่น และไม่ได้ใช้ "แผนของฉัน" (Premium)
  if not exists (
    select 1 from public.guardian_links gl
    where gl.student_id = v_uid and gl.status = 'claimed'
  ) and not exists (
    select 1 from public.self_serve_enrollment e
    where e.student_id = v_uid and e.status = 'active' and now() < e.expires_at
  ) then
    select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;
    delete from public.guardian_goal g
    where g.student_id = v_uid and g.week_start >= v_week_start;
  end if;
end;
$$;

create or replace function public.guardian_get_my_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid(); v_week_start date; v_goal public.guardian_goal; v_points integer; v_reached_weeks integer;
  v_goal_json jsonb := null; v_plan public.guardian_plan; v_plan_json jsonb := null; v_next_frame text; v_weeks_to_next integer;
  v_pause_reason text; v_quest_message text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not exists (select 1 from public.guardian_links gl where gl.student_id = v_uid and gl.status = 'claimed') then
    return jsonb_build_object('has_guardian', false); end if;
  select b.week_start_date into v_week_start from public.current_week_bounds_bkk() b;
  select * into v_goal from public.guardian_goal g where g.student_id = v_uid and g.week_start = v_week_start;
  if found then
    select coalesce(sum(d.day_points), 0)::int into v_points from public.guardian_daily_points_bkk(v_uid, v_week_start) d;
    v_goal_json := jsonb_build_object('level', v_goal.level, 'total_points', v_points, 'target', v_goal.computed_target, 'reached', v_points >= v_goal.computed_target);
  end if;
  select count(*)::int into v_reached_weeks from public.guardian_goal_reached_weeks w where w.student_id = v_uid;
  if v_reached_weeks = 0 then v_next_frame := 'guardian_basic'; v_weeks_to_next := 1;
  elsif v_reached_weeks < 4 then v_next_frame := 'guardian_mid'; v_weeks_to_next := 4 - v_reached_weeks;
  else v_next_frame := null; v_weeks_to_next := null; end if;
  select * into v_plan from public.guardian_plan gp where gp.student_id = v_uid and gp.status = 'active';
  if found then
    select jsonb_build_object('framework', v_plan.framework, 'duration_weeks', v_plan.duration_weeks, 'exam_date', v_plan.exam_date,
      'subjects', coalesce(jsonb_agg(s.obj order by s.subject), '[]'::jsonb))
    into v_plan_json
    from (
      select c.subject,
        jsonb_build_object('subject', c.subject,
          'current_chapter', max(cc.chapter) filter (where c.status = 'current'),
          'total', count(*),
          'position', least(count(*), count(*) filter (where c.status in ('passed', 'stuck')) + (case when bool_or(c.status = 'current') then 1 else 0 end)),
          'done', not bool_or(c.status in ('current', 'pending'))) as obj
      from public.guardian_plan_chapters c
      join public.curriculum_chapters cc on cc.chapter_key = c.chapter_key
      where c.plan_id = v_plan.id
        and not (c.status = 'passed' and c.passed_at is not null
          and (c.passed_at at time zone 'Asia/Bangkok')::date < (v_plan.created_at at time zone 'Asia/Bangkok')::date)
      group by c.subject) s;
  end if;
  select rp.reason into v_pause_reason from public.guardian_review_pause rp
    where rp.student_id = v_uid and rp.pause_date = (now() at time zone 'Asia/Bangkok')::date;
  select m.text into v_quest_message from public.guardian_quest q
    join public.guardian_quest_messages m on m.id = q.message_id and m.active
    join public.guardian_links gl on gl.student_id = q.student_id and gl.guardian_id = q.guardian_id and gl.status = 'claimed'
    where q.student_id = v_uid;
  return jsonb_build_object('has_guardian', true, 'goal', v_goal_json,
    'reward', jsonb_build_object('reached_weeks', v_reached_weeks, 'next_frame_id', v_next_frame, 'weeks_to_next', v_weeks_to_next),
    'plan', v_plan_json, 'review_paused_today', v_pause_reason, 'quest_message', v_quest_message);
end; $$;
