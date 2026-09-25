-- =====================================================================
-- คาบตั้งใจ (Focus Mode) — Phase 4: reaper + สรุปท้ายคาบฝั่งครู
-- ต่อจาก 20260925200000_classroom_focus_mode_phase_3
--
-- (เอกสารออกแบบ ข้อ 11) คาบที่ครูลืมกดหยุด: pg_cron ปิดคาบที่ "ไม่มีความเคลื่อนไหว" เกิน 60 นาที
--   ความเคลื่อนไหว = heartbeat ล่าสุดของใครก็ได้ในรอบ / มีคนเข้าร่วม / เวลาเริ่มคาบ (ตามแบบ
--   close_stale_boss_raid_sessions ที่นับ idle 120 นาที) — ไม่ตัดคาบยาวที่นักเรียนยังตั้งใจอยู่จริง
--   ended_at = เวลาความเคลื่อนไหวสุดท้าย (ไม่ใช่ตอน cron วิ่ง) → EXP ลงวันที่ถูกต้อง
--   ปิดผ่าน finalize_focus_session → ได้ EXP เหมือนครูกดหยุดทุกอย่าง แล้วคืนห้องกลับ lobby
-- (ข้อ 17) สรุปท้ายคาบ: จำนวนรวมเท่านั้น ไม่มีชื่อ/ข้อมูลรายคน — ขยาย get_focus_live_summary
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1) finalize รับเวลาจบได้ (reaper ใช้เวลาความเคลื่อนไหวสุดท้าย)
--    ต้อง drop ตัวเดิม — เพิ่มพารามิเตอร์ default แบบ create or replace จะได้ overload
--    แล้วการเรียก 2 อาร์กิวเมนต์จะกำกวม (end_focus_mode_session / trigger ปิดห้อง เรียกแบบ 2 อาร์กิวเมนต์)
-- ---------------------------------------------------------------------

drop function public.finalize_focus_session(uuid, text);

create function public.finalize_focus_session(
  p_focus_session_id uuid,
  p_reason text,
  p_ended_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_focus public.classroom_focus_sessions;
  v_user  uuid;
  v_sum   jsonb;
begin
  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id
  for update;

  if not found then
    return null;
  end if;

  if v_focus.status = 'running' then
    update public.classroom_focus_sessions
    set status = 'ended',
        ended_at = greatest(v_focus.started_at, least(coalesce(p_ended_at, now()), now())),
        ended_reason = p_reason
    where id = p_focus_session_id
    returning * into v_focus;
  end if;

  -- ปิดทุกคนที่ยังอยู่ ณ เวลาจบ (ก้อนที่ครบก่อนจบนับ, ก้อนที่ไม่ครบนับเป็นเวลาอย่างเดียว)
  for v_user in
    select user_id from public.classroom_focus_participants
    where focus_session_id = p_focus_session_id and focus_state <> 'away'
  loop
    perform public.focus_advance_participant(p_focus_session_id, v_user, v_focus.ended_at);
    perform public.focus_reset_participant(p_focus_session_id, v_user, v_focus.ended_at, 'session_ended');
  end loop;

  -- แจก EXP ครั้งเดียวต่อคนต่อรอบ
  for v_user in
    select user_id from public.classroom_focus_participants
    where focus_session_id = p_focus_session_id and exp_awarded_at is null
  loop
    perform public.focus_award_exp(p_focus_session_id, v_user, v_focus.ended_at);
  end loop;

  select jsonb_build_object(
    'participant_count', count(*),
    'completed_blocks', coalesce(sum(completed_blocks), 0),
    'focused_seconds', coalesce(sum(focused_seconds), 0),
    'exp_awarded', coalesce(sum(exp_awarded), 0)
  ) into v_sum
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id;

  return v_sum;
end;
$$;

revoke all on function public.finalize_focus_session(uuid, text, timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2) reaper
-- ---------------------------------------------------------------------

create or replace function public.close_stale_focus_sessions(p_idle_minutes integer default 60)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    with activity as (
      select f.id, f.classroom_session_id,
             greatest(
               f.started_at,
               coalesce((select max(h.last_heartbeat_at) from public.classroom_focus_heartbeats h
                         where h.focus_session_id = f.id), f.started_at),
               coalesce((select max(p.joined_at) from public.classroom_focus_participants p
                         where p.focus_session_id = f.id), f.started_at)
             ) as last_activity
      from public.classroom_focus_sessions f
      where f.status = 'running'
    )
    select * from activity
    where last_activity < now() - make_interval(mins => p_idle_minutes)
  loop
    perform public.finalize_focus_session(v_row.id, 'stale_timeout', v_row.last_activity);

    -- คืนห้องกลับ lobby เหมือนครูกดหยุด (ห้องที่จบแล้วตั้ง current_activity = null ไว้แล้ว)
    update public.classroom_sessions
    set current_activity = null,
        active_focus_session_id = null
    where id = v_row.classroom_session_id
      and current_activity = 'focus_mode'
      and active_focus_session_id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.close_stale_focus_sessions(integer) is
  'pg_cron (close-stale-focus-sessions): ปิดคาบตั้งใจที่ไม่มีความเคลื่อนไหวเกิน p_idle_minutes ผ่าน finalize_focus_session (แจก EXP) แล้วคืนห้องกลับ lobby';

revoke all on function public.close_stale_focus_sessions(integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) สรุปสำหรับครู (ระหว่างคาบ + หลังจบ) — จำนวนรวมเท่านั้น
-- ---------------------------------------------------------------------

create or replace function public.get_focus_live_summary(p_focus_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now   timestamptz := now();
  v_focus public.classroom_focus_sessions;
  v_user  uuid;
  v_sum   jsonb;
begin
  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id and teacher_id = auth.uid()
  for share;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  if v_focus.status = 'running' then
    for v_user in
      select user_id from public.classroom_focus_participants
      where focus_session_id = p_focus_session_id and focus_state <> 'away'
    loop
      perform public.focus_advance_participant(p_focus_session_id, v_user, v_now);
    end loop;
  end if;

  select jsonb_build_object(
    'status', v_focus.status,
    'ended_reason', v_focus.ended_reason,
    'started_at', v_focus.started_at,
    'ended_at', v_focus.ended_at,
    'total', count(*),
    'focusing', count(*) filter (where focus_state = 'focusing'),
    'warning', count(*) filter (where focus_state = 'warning'),
    'away', count(*) filter (where focus_state = 'away'),
    'completed_blocks', coalesce(sum(completed_blocks), 0),
    'focused_students', count(*) filter (where completed_blocks > 0),
    'focused_seconds', coalesce(sum(focused_seconds), 0),
    'exp_awarded', coalesce(sum(exp_awarded), 0),
    'server_now', v_now
  ) into v_sum
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id;

  return v_sum;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) ตั้ง cron ทุก 5 นาที (ค่าใช้จ่ายต่ำ: ดูเฉพาะรอบที่ running)
-- ---------------------------------------------------------------------

select cron.schedule(
  'close-stale-focus-sessions',
  '*/5 * * * *',
  'select public.close_stale_focus_sessions()'
);

commit;

-- ============================================================
-- Rollback:
--   select cron.unschedule('close-stale-focus-sessions');
--   drop function close_stale_focus_sessions(integer);
--   drop function finalize_focus_session(uuid, text, timestamptz);
--   สร้าง finalize_focus_session(uuid, text) + get_focus_live_summary คืนตาม 20260925200000 / 20260925190000
-- ============================================================
