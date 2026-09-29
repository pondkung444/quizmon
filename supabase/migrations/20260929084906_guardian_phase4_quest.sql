-- Guardian Phase 4: โจทย์จากผู้พิทักษ์ (guardian quest)
-- Spec: §7.4 (นับในโควตา 20 ข้อ/รอบ), §7.5 (ข้อความสำเร็จรูป), §8.2 (push ถึงเด็ก), §10.1, §10.2
-- กฎเหล็ก: ไม่มี RPC ใดคืนผลรายข้อของ "ข้อที่มีกรอบ" ให้ผู้พิทักษ์ และไม่คืนข้อมูลว่าเด็กเห็นข้อความแล้วหรือยัง

-- 1) ข้อความสำเร็จรูป ------------------------------------------------------
create table public.guardian_quest_messages (
  id          smallint primary key,
  text        text not null check (char_length(text) between 1 and 80),
  sort_order  smallint not null,
  active      boolean not null default true
);

alter table public.guardian_quest_messages enable row level security;
revoke all on public.guardian_quest_messages from public, anon, authenticated;
grant select on public.guardian_quest_messages to service_role;

insert into public.guardian_quest_messages (id, text, sort_order) values
  (1, 'เห็นความพยายามมาตลอด สู้ๆ นะ', 1),
  (2, 'เรื่องนี้อาจยากหน่อย ค่อยๆ ลองไปทีละข้อได้เลย', 2),
  (3, 'เก่งขึ้นทุกวันเลย', 3),
  (4, 'ไม่ต้องรีบ ทำเท่าที่สบายใจก็พอ', 4),
  (5, 'ภูมิใจในความตั้งใจนะ', 5),
  (6, 'ตอบถูกหรือผิดก็ได้เรียนรู้ทั้งนั้น', 6),
  (7, 'วันนี้ขอให้สนุกกับการเรียนรู้', 7),
  (8, 'มีข้อสงสัยอะไร มาเล่าให้ฟังได้เสมอ', 8);

-- 2) ข้อความที่ผู้พิทักษ์เลือกให้เด็ก (1 แถว/เด็ก, ไม่มีแถว = ไม่ได้เลือก) ------
create table public.guardian_quest (
  student_id  uuid primary key references public.profiles(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  message_id  smallint not null references public.guardian_quest_messages(id),
  updated_at  timestamptz not null default now()
);

alter table public.guardian_quest enable row level security;
revoke all on public.guardian_quest from public, anon, authenticated;
grant select, insert, update, delete on public.guardian_quest to service_role;

-- 3) บันทึกข้อที่ถูก "แสดง" ไปแล้วรายวัน (เพดาน 2 ข้อ/วัน) ---------------------
create table public.guardian_quest_deliveries (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  date_bkk    date not null,
  question_id bigint not null,
  created_at  timestamptz not null default now(),
  primary key (student_id, date_bkk, question_id)
);

alter table public.guardian_quest_deliveries enable row level security;
revoke all on public.guardian_quest_deliveries from public, anon, authenticated;
grant select, insert, delete on public.guardian_quest_deliveries to service_role;

-- 4) activity log: เพิ่ม event type -------------------------------------------
alter table public.guardian_activity_log
  drop constraint guardian_activity_log_event_type_check;
alter table public.guardian_activity_log
  add constraint guardian_activity_log_event_type_check
  check (event_type = any (array['view_insight','set_goal','view_plan','set_quest_message']));

-- 5) ผู้พิทักษ์: ดูตัวเลือก + ข้อความปัจจุบัน ----------------------------------
create or replace function public.guardian_get_quest_options(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_current smallint;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;
  if not exists (
    select 1 from public.guardian_links gl
    where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    raise exception 'ไม่พบการเชื่อมต่อกับนักเรียนคนนี้';
  end if;

  select q.message_id into v_current from public.guardian_quest q where q.student_id = p_student_id;

  return jsonb_build_object(
    'current_message_id', v_current,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'text', m.text) order by m.sort_order)
      from public.guardian_quest_messages m where m.active
    ), '[]'::jsonb)
  );
end;
$$;

-- 6) ผู้พิทักษ์: เลือก/ล้างข้อความ (p_message_id null = ล้าง) --------------------
create or replace function public.guardian_set_quest_message(p_student_id uuid, p_message_id smallint)
returns void
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
    select 1 from public.guardian_links gl
    where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    raise exception 'ไม่พบการเชื่อมต่อกับนักเรียนคนนี้';
  end if;

  if p_message_id is null then
    delete from public.guardian_quest where student_id = p_student_id;
  else
    if not exists (select 1 from public.guardian_quest_messages m where m.id = p_message_id and m.active) then
      raise exception 'ข้อความไม่ถูกต้อง';
    end if;
    insert into public.guardian_quest (student_id, guardian_id, message_id, updated_at)
    values (p_student_id, v_uid, p_message_id, now())
    on conflict (student_id) do update
      set guardian_id = excluded.guardian_id,
          message_id  = excluded.message_id,
          updated_at  = now();
  end if;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type, metadata)
  values (v_uid, p_student_id, 'set_quest_message', jsonb_build_object('message_id', p_message_id));
end;
$$;

-- 7) service_role: จองช่อง "ข้อที่มีกรอบ" ของวันนี้ (race-safe, สูงสุด 2 ข้อ/วัน) ----
-- p_candidate_ids = id ข้อที่ถูก inject จากแผนในรอบนี้ (เรียงตามที่ต้องการให้ได้กรอบก่อน)
-- คืน {framed_ids:[...], message: text|null}; paused / ไม่มี link claimed → framed_ids ว่าง
create or replace function public.guardian_reserve_quest_slots(p_student_id uuid, p_candidate_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_daily_cap constant integer := 2;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_used integer;
  v_left integer;
  v_id bigint;
  v_framed bigint[] := '{}';
  v_msg text;
begin
  if p_candidate_ids is null or coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    return jsonb_build_object('framed_ids', '[]'::jsonb, 'message', null);
  end if;

  if not exists (
    select 1 from public.guardian_links gl
    where gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    return jsonb_build_object('framed_ids', '[]'::jsonb, 'message', null);
  end if;

  if exists (
    select 1 from public.guardian_review_pause rp
    where rp.student_id = p_student_id and rp.pause_date = v_today
  ) then
    return jsonb_build_object('framed_ids', '[]'::jsonb, 'message', null);
  end if;

  -- ล็อกรายเด็ก/รายวัน กันหลายรอบเริ่มพร้อมกันแล้วเกินโควตา
  perform pg_advisory_xact_lock(hashtextextended('guardian_quest:' || p_student_id::text || ':' || v_today::text, 0));

  select count(*)::int into v_used
  from public.guardian_quest_deliveries d
  where d.student_id = p_student_id and d.date_bkk = v_today;

  v_left := c_daily_cap - v_used;

  if v_left > 0 then
    foreach v_id in array p_candidate_ids loop
      exit when v_left <= 0;
      insert into public.guardian_quest_deliveries (student_id, date_bkk, question_id)
      values (p_student_id, v_today, v_id)
      on conflict do nothing;
      if found then
        v_framed := v_framed || v_id;
        v_left := v_left - 1;
      end if;
    end loop;
  end if;

  select m.text into v_msg
  from public.guardian_quest q
  join public.guardian_quest_messages m on m.id = q.message_id and m.active
  where q.student_id = p_student_id;

  return jsonb_build_object('framed_ids', to_jsonb(v_framed), 'message', v_msg);
end;
$$;

-- 8) เด็กอ่านข้อความซ้ำได้จากฮับ (ห้ามมี "เห็นแล้วเมื่อไหร่") -----------------------
create or replace function public.guardian_get_my_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
  v_pause_reason text;
  v_quest_message text;                                   -- NEW (phase 4)
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

  select rp.reason into v_pause_reason
  from public.guardian_review_pause rp
  where rp.student_id = v_uid and rp.pause_date = (now() at time zone 'Asia/Bangkok')::date;

  -- NEW (phase 4): ข้อความจากผู้พิทักษ์ (เฉพาะที่ link ยัง claimed และผู้เลือกคือผู้พิทักษ์ที่ผูกอยู่)
  select m.text into v_quest_message
  from public.guardian_quest q
  join public.guardian_quest_messages m on m.id = q.message_id and m.active
  join public.guardian_links gl on gl.student_id = q.student_id
       and gl.guardian_id = q.guardian_id and gl.status = 'claimed'
  where q.student_id = v_uid;

  return jsonb_build_object(
    'has_guardian', true,
    'goal', v_goal_json,
    'reward', jsonb_build_object(
      'reached_weeks', v_reached_weeks,
      'next_frame_id', v_next_frame,
      'weeks_to_next', v_weeks_to_next
    ),
    'plan', v_plan_json,
    'review_paused_today', v_pause_reason,
    'quest_message', v_quest_message                      -- NEW
  );
end;
$$;

-- 9) สิทธิ์ ------------------------------------------------------------------
revoke all on function public.guardian_get_quest_options(uuid) from public, anon;
revoke all on function public.guardian_set_quest_message(uuid, smallint) from public, anon;
revoke all on function public.guardian_reserve_quest_slots(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.guardian_get_quest_options(uuid) to authenticated, service_role;
grant execute on function public.guardian_set_quest_message(uuid, smallint) to authenticated, service_role;
grant execute on function public.guardian_reserve_quest_slots(uuid, bigint[]) to service_role;
-- guardian_get_my_hub: สิทธิ์เดิมคงอยู่จาก CREATE OR REPLACE
