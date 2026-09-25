-- =====================================================================
-- คาบตั้งใจ (Focus Mode) — Phase 3: EXP
-- ต่อจาก 20260925190000_classroom_focus_mode_phase_2
--
-- กติกา (เอกสารออกแบบ ข้อ 1–2): ก้อน 10 นาทีต่อเนื่องที่ครบ = 10 EXP, เพดาน 50 EXP/วัน/คน (เวลาไทย)
-- แยกถังจากเพดาน 180/วันของการตอบคำถาม — ไม่แตะ pets.exp_today/exp_today_date เลย
-- ค่าคงที่ต้องตรงกับ FOCUS_EXP_PER_BLOCK / FOCUS_DAILY_EXP_CAP ใน src/lib/exp.ts
--
-- ต่างจากเอกสารข้อ 10 (ให้ Next.js เขียน EXP ผ่าน exp.ts): คาบจบได้จาก trigger ปิดห้อง
-- (และ reaper ของ Phase 4) ซึ่งไม่มี request ของ Next.js — จึงแจกใน SQL ตอน finalize แบบเดียวกับ
-- PvP slice 3 (_pvp_resolve_round เขียน pets.exp เอง) แล้วให้ server action เช็ควิวัฒนาการ
-- ผ่าน evolvePet() ทีหลัง (idempotent; หน้า /pet เป็น safety net)
--
-- EXP เข้า "ตัวที่กำลังเลี้ยง" (pets.is_active) ณ ตอนจบคาบ — ไม่มีตัวที่เลี้ยงอยู่ = ไม่ได้ EXP
-- (ไม่กินโควตาวันนั้น) เหมือน PvP
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1) คอลัมน์ผลแจก EXP (exp_awarded มีอยู่แล้วตั้งแต่ Phase 1)
-- ---------------------------------------------------------------------

alter table public.classroom_focus_participants
  add column exp_awarded_at timestamptz,  -- null = ยังไม่ได้ตัดสิน EXP ของรอบนี้ (ใช้กันแจกซ้ำ)
  add column exp_pet_id     uuid references public.pets(id) on delete set null;

comment on column public.classroom_focus_participants.exp_awarded_at is
  'เวลาที่ตัดสิน EXP ของรอบนี้ (= เวลาจบคาบ) — ใช้นับเพดานรายวันตามวันที่ไทย และกันแจกซ้ำ';
comment on column public.classroom_focus_participants.exp_pet_id is
  'ตัวที่ได้ EXP (ตัวที่กำลังเลี้ยงตอนจบคาบ) — server action ใช้เช็ควิวัฒนาการต่อ';

-- เพดานรายวัน: รวม exp_awarded ของคนนั้นที่ตัดสินในวันเดียวกัน
create index classroom_focus_participants_exp_day_idx
  on public.classroom_focus_participants (user_id, exp_awarded_at)
  where exp_awarded_at is not null;

alter table public.classroom_focus_events
  drop constraint classroom_focus_events_event_type_check;
alter table public.classroom_focus_events
  add constraint classroom_focus_events_event_type_check
  check (event_type in (
    'background', 'foreground', 'tab_change', 'screen_touch',
    'warning', 'break', 'reset',
    'heartbeat_timeout',
    'wake_lock_unsupported',
    'resume', 'block_complete',
    'exp_award'
  ));


-- ---------------------------------------------------------------------
-- 2) EXP ที่ใช้ไปแล้ววันนี้ (วันที่ไทย) — ไม่นับรอบ p_exclude_focus
-- ---------------------------------------------------------------------

create or replace function public.focus_exp_used_on(
  p_user_id uuid,
  p_day date,
  p_exclude_focus uuid default null
)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(fp.exp_awarded), 0)::integer
  from public.classroom_focus_participants fp
  where fp.user_id = p_user_id
    and fp.exp_awarded_at is not null
    and fp.exp_awarded_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
    and fp.exp_awarded_at <  ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
    and (p_exclude_focus is null or fp.focus_session_id <> p_exclude_focus);
$$;


-- ---------------------------------------------------------------------
-- 3) แจก EXP ต่อคน — idempotent (exp_awarded_at ไม่ null = ตัดสินแล้ว ข้าม)
-- ---------------------------------------------------------------------

create or replace function public.focus_award_exp(
  p_focus_session_id uuid,
  p_user_id uuid,
  p_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_per_block constant integer := 10;
  c_daily_cap constant integer := 50;
  v_p      public.classroom_focus_participants;
  v_earned integer;
  v_used   integer;
  v_award  integer;
  v_pet    uuid;
begin
  -- คนเดียวกันจบ 2 คาบพร้อมกัน (คนละห้อง) ต้องไม่เกินเพดานรวม
  perform pg_advisory_xact_lock(hashtext('focus_exp:' || p_user_id::text));

  select * into v_p
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id and user_id = p_user_id
  for update;

  if not found or v_p.exp_awarded_at is not null then
    return coalesce(v_p.exp_awarded, 0);
  end if;

  v_earned := v_p.completed_blocks * c_per_block;
  v_used := public.focus_exp_used_on(p_user_id, (p_at at time zone 'Asia/Bangkok')::date, p_focus_session_id);
  v_award := greatest(0, least(v_earned, c_daily_cap - v_used));

  -- บันทึกตัวที่เลี้ยงอยู่เสมอ (แม้ชนเพดาน) — exp_pet_id null จึงแปลว่า "ไม่มีตัวที่เลี้ยง" อย่างเดียว
  select id into v_pet
  from public.pets
  where user_id = p_user_id and is_active = true
  limit 1;

  if v_pet is null then
    v_award := 0;
  elsif v_award > 0 then
    -- ไม่แตะ exp_today/exp_today_date — ถังของการตอบคำถามแยกขาด
    update public.pets set exp = exp + v_award where id = v_pet;
  end if;

  update public.classroom_focus_participants
  set exp_awarded = v_award,
      exp_awarded_at = p_at,
      exp_pet_id = v_pet
  where focus_session_id = p_focus_session_id and user_id = p_user_id;

  if v_earned > 0 then
    insert into public.classroom_focus_events (focus_session_id, user_id, event_type, occurred_at, meta)
    values (p_focus_session_id, p_user_id, 'exp_award', p_at,
            jsonb_build_object('blocks', v_p.completed_blocks, 'earned', v_earned,
                               'awarded', v_award, 'used_before', v_used, 'pet_id', v_pet));
  end if;

  return v_award;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) finalize: ปิดทุกคนแล้วแจก EXP (ทุกทางจบคาบผ่านที่นี่ — ครูกดหยุด / ปิดห้อง / reaper)
-- ---------------------------------------------------------------------

create or replace function public.finalize_focus_session(p_focus_session_id uuid, p_reason text)
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
    set status = 'ended', ended_at = now(), ended_reason = p_reason
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

  -- แจก EXP ครั้งเดียวต่อคนต่อรอบ (รอบที่จบก่อน Phase 3 ไม่มีก้อน → ได้ 0)
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


-- ---------------------------------------------------------------------
-- 5) สถานะที่ client เห็นระหว่างคาบ + EXP ที่จะได้ถ้าจบตอนนี้ (หักเพดานวันนี้แล้ว)
-- ---------------------------------------------------------------------

create or replace function public.focus_participant_json(
  p public.classroom_focus_participants,
  p_now timestamptz
)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'status', 'running',
    'state', p.focus_state,
    'present_since', p.present_since,
    'block_started_at', p.block_started_at,
    'grace_used', p.grace_used,
    'warning_started_at', p.warning_started_at,
    'completed_blocks', p.completed_blocks,
    'focused_seconds', p.focused_seconds,
    'warned_count', p.warned_count,
    'exp_cap_left', greatest(0, 50 - u.used),
    'exp_pending', least(p.completed_blocks * 10, greatest(0, 50 - u.used)),
    'server_now', p_now
  )
  from (
    select public.focus_exp_used_on(p.user_id, (p_now at time zone 'Asia/Bangkok')::date,
                                    p.focus_session_id) as used
  ) u;
$$;


revoke all on function public.focus_exp_used_on(uuid, date, uuid)           from public, anon, authenticated;
revoke all on function public.focus_award_exp(uuid, uuid, timestamptz)       from public, anon, authenticated;
revoke all on function public.finalize_focus_session(uuid, text)            from public, anon, authenticated;
revoke all on function public.focus_participant_json(public.classroom_focus_participants, timestamptz) from public, anon, authenticated;

commit;

-- ============================================================
-- Rollback (ย้อนเป็น Phase 2 — EXP ที่แจกไปแล้วใน pets.exp ไม่ถูกหักคืน):
--   finalize_focus_session / focus_participant_json คืนตาม 20260925190000;
--   drop function focus_award_exp, focus_exp_used_on;
--   drop index classroom_focus_participants_exp_day_idx;
--   alter table classroom_focus_participants drop column exp_awarded_at, drop column exp_pet_id;
--   คืน check ของ classroom_focus_events.event_type (ตัด exp_award — ลบแถวชนิดนั้นก่อน)
-- ============================================================
