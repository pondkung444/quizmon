-- =====================================================================
-- คาบตั้งใจ (Focus Mode) — Phase 2: heartbeat + สัญญาณหลุดโฟกัส + grace/reset
-- ต่อจาก 20260923145950_classroom_focus_mode_phase_1 / 20260925180000_classroom_end_closes_focus
--
-- กติกา (เอกสารออกแบบ ข้อ 3–6, 9, 15–16):
--   * ก้อนละ 10 นาทีต่อเนื่อง (completed_blocks — Phase 3 จะแปลงเป็น EXP)
--   * สัญญาณหลุด (background / tab_change / screen_touch) ครั้งแรกในก้อน = warning มี grace 10 วิ
--     กลับมาทัน = ก้อนเดิมนับต่อ; ไม่ทัน หรือหลุดครั้งที่ 2 ในก้อนเดียวกัน = reset ก้อนเป็น 0
--   * client ping ทุก 10 วิ — เงียบเกิน 25 วิ (10 รอบ ping + 10 grace + 5 เผื่อเน็ต) = หลุด
--     นับจาก heartbeat สุดท้าย (server ตัดสินเอง ไม่พึ่ง client รายงานว่าตัวเองหลุด)
--   * กลับเข้าแอปพร้อม hidden_ms (วัดในเครื่อง) ใช้ตัดสินย้อนหลังเมื่อสัญญาณ background ส่งไม่ทัน
--
-- server ประเมินแบบ lazy: ทุก RPC เรียก focus_advance_participant(now) ก่อนแก้ state เสมอ
-- ค่าคงที่ต้องตรงกับ src/lib/classroom/focusRules.ts
--
-- ไม่แตะ boss_raid_* (trigger function classroom_end_open_boss_raids ส่วน Raid คงเดิมทุกบรรทัด)
-- ยังไม่มี: EXP (Phase 3), pg_cron reaper + สรุปท้ายคาบ (Phase 4)
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 1) state ต่อคน (เปลี่ยนเฉพาะตอน transition — ไม่เขียนทุก heartbeat เพื่อไม่ให้ realtime ท่วม)
-- ---------------------------------------------------------------------

alter table public.classroom_focus_participants
  add column focus_state        text not null default 'away'
                                  check (focus_state in ('focusing', 'warning', 'away')),
  add column present_since      timestamptz,  -- เริ่มช่วงที่อยู่ต่อเนื่อง (ใช้สะสม focused_seconds)
  add column block_started_at   timestamptz,  -- เริ่มก้อน 10 นาทีปัจจุบัน
  add column grace_used         boolean not null default false,  -- ใช้ grace ของก้อนนี้ไปแล้ว
  add column warning_started_at timestamptz,
  add column completed_blocks   integer not null default 0 check (completed_blocks >= 0),
  add constraint classroom_focus_participants_state_consistency check (
    (focus_state = 'away'
       and present_since is null and block_started_at is null and warning_started_at is null)
    or (focus_state = 'focusing'
       and present_since is not null and block_started_at is not null and warning_started_at is null)
    or (focus_state = 'warning'
       and present_since is not null and block_started_at is not null and warning_started_at is not null)
  );

comment on column public.classroom_focus_participants.focused_seconds is
  'วินาทีที่อยู่ในคาบจริง (รวมก้อนที่ไม่ครบ 10 นาที) — สะสมตอนหลุด/จบคาบ';
comment on column public.classroom_focus_participants.completed_blocks is
  'จำนวนก้อน 10 นาทีต่อเนื่องที่ครบ — ฐานคำนวณ EXP ของ Phase 3';


-- heartbeat ล่าสุดแยกตาราง: ไม่อยู่ใน realtime publication และไม่มี policy (อ่าน/เขียนผ่าน RPC เท่านั้น)
create table public.classroom_focus_heartbeats (
  focus_session_id  uuid not null,
  user_id           uuid not null,
  last_heartbeat_at timestamptz not null,
  primary key (focus_session_id, user_id),
  foreign key (focus_session_id, user_id)
    references public.classroom_focus_participants (focus_session_id, user_id) on delete cascade
);

comment on table public.classroom_focus_heartbeats is
  'heartbeat ล่าสุดต่อคน (เขียนทุก ~10 วิ) — แยกจาก participants เพื่อไม่ให้ realtime ยิงทุก ping';

alter table public.classroom_focus_heartbeats enable row level security;
revoke all on public.classroom_focus_heartbeats from anon, authenticated;


alter table public.classroom_focus_events
  drop constraint classroom_focus_events_event_type_check;
alter table public.classroom_focus_events
  add constraint classroom_focus_events_event_type_check
  check (event_type in (
    'background', 'foreground', 'tab_change', 'screen_touch',
    'warning', 'break', 'reset',
    'heartbeat_timeout',
    'wake_lock_unsupported',
    'resume', 'block_complete'
  ));


-- ---------------------------------------------------------------------
-- 2) helper ภายใน (ไม่ให้ client เรียก)
-- ---------------------------------------------------------------------

-- ปิดช่วงที่อยู่: สะสม focused_seconds แล้วกลับเป็น away (ก้อนที่ยังไม่ครบทิ้ง)
-- ถ้าอยู่ใน warning นับเวลาได้ถึงจุดเริ่ม warning เท่านั้น
create or replace function public.focus_reset_participant(
  p_focus_session_id uuid,
  p_user_id uuid,
  p_at timestamptz,
  p_reason text,
  p_meta jsonb default '{}'::jsonb
)
returns public.classroom_focus_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_p   public.classroom_focus_participants;
  v_end timestamptz;
begin
  select * into v_p
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id and user_id = p_user_id
  for update;

  if not found or v_p.focus_state = 'away' then
    return v_p;
  end if;

  v_end := case when v_p.focus_state = 'warning'
                then least(p_at, v_p.warning_started_at)
                else p_at end;

  update public.classroom_focus_participants
  set focused_seconds = focused_seconds
                        + greatest(0, floor(extract(epoch from (v_end - present_since))))::integer,
      focus_state = 'away',
      present_since = null,
      block_started_at = null,
      warning_started_at = null,
      grace_used = false
  where focus_session_id = p_focus_session_id and user_id = p_user_id
  returning * into v_p;

  insert into public.classroom_focus_events (focus_session_id, user_id, event_type, occurred_at, meta)
  values (p_focus_session_id, p_user_id, 'reset', p_at,
          jsonb_build_object('reason', p_reason) || coalesce(p_meta, '{}'::jsonb));

  return v_p;
end;
$$;


-- ประเมิน state ตามเวลา (lazy) จนถึง p_now: ตรวจเงียบเกิน / grace หมด / ปัดก้อน 10 นาทีที่ครบ
-- ต้องเรียกก่อนแก้ state ทุกครั้ง — ก้อนจึงถูกปัดเฉพาะช่วงที่ไม่มีเหตุการณ์อื่นแทรก
create or replace function public.focus_advance_participant(
  p_focus_session_id uuid,
  p_user_id uuid,
  p_now timestamptz
)
returns public.classroom_focus_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_block      constant interval := interval '10 minutes';
  c_grace      constant interval := interval '10 seconds';
  c_hb_timeout constant interval := interval '25 seconds';
  v_p      public.classroom_focus_participants;
  v_hb     timestamptz;
  v_stop   timestamptz;
  v_reason text;
  v_limit  timestamptz;
  v_n      integer;
begin
  select * into v_p
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id and user_id = p_user_id
  for update;

  if not found or v_p.focus_state = 'away' then
    return v_p;
  end if;

  select h.last_heartbeat_at into v_hb
  from public.classroom_focus_heartbeats h
  where h.focus_session_id = p_focus_session_id and h.user_id = p_user_id;

  -- (ก) เงียบเกินกำหนด → หลุดตั้งแต่ heartbeat สุดท้าย (หลักฐานสุดท้ายว่ายังอยู่)
  if v_hb is null or p_now - v_hb > c_hb_timeout then
    v_stop := greatest(coalesce(v_hb, v_p.present_since), v_p.present_since);
    v_reason := 'heartbeat_timeout';
  end if;

  -- (ข) warning ที่ไม่กลับมาภายใน grace → หลุดตั้งแต่จุดเริ่ม warning
  if v_p.focus_state = 'warning'
     and p_now > v_p.warning_started_at + c_grace
     and (v_stop is null or v_p.warning_started_at < v_stop) then
    v_stop := v_p.warning_started_at;
    v_reason := 'grace_expired';
  end if;

  -- (ค) ปัดก้อนที่ครบ — warning ที่ยังไม่ตัดสินนับได้ถึงจุดเริ่ม warning เท่านั้น
  v_limit := coalesce(v_stop,
                      case when v_p.focus_state = 'warning' then v_p.warning_started_at else p_now end);
  v_n := floor(extract(epoch from (v_limit - v_p.block_started_at)) / extract(epoch from c_block))::integer;

  if v_n > 0 then
    update public.classroom_focus_participants
    set completed_blocks = completed_blocks + v_n,
        block_started_at = block_started_at + c_block * v_n,
        -- ก้อนใหม่ได้ grace ใหม่ (warning ที่ค้างอยู่ยังถือเป็นของก้อนปัจจุบัน)
        grace_used = case when focus_state = 'warning' then grace_used else false end
    where focus_session_id = p_focus_session_id and user_id = p_user_id
    returning * into v_p;

    insert into public.classroom_focus_events (focus_session_id, user_id, event_type, occurred_at, meta)
    values (p_focus_session_id, p_user_id, 'block_complete', v_p.block_started_at,
            jsonb_build_object('blocks', v_n, 'completed_blocks', v_p.completed_blocks));
  end if;

  -- (ง) หลุด → reset
  if v_stop is not null then
    if v_reason = 'heartbeat_timeout' then
      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, occurred_at, meta)
      values (p_focus_session_id, p_user_id, 'heartbeat_timeout', v_stop,
              jsonb_build_object('last_heartbeat_at', v_hb, 'detected_at', p_now));
    end if;
    v_p := public.focus_reset_participant(p_focus_session_id, p_user_id, v_stop, v_reason);
  end if;

  return v_p;
end;
$$;


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
    'server_now', p_now
  );
$$;


-- จุดจบเดียวของคาบ (ครูกดหยุด / ปิดห้อง / reaper ของ Phase 4) — idempotent
-- Phase 3 ใส่การคำนวณ EXP ที่นี่ที่เดียว ทุกทางจบจะได้ EXP เท่ากัน
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

  select jsonb_build_object(
    'participant_count', count(*),
    'completed_blocks', coalesce(sum(completed_blocks), 0),
    'focused_seconds', coalesce(sum(focused_seconds), 0)
  ) into v_sum
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id;

  return v_sum;
end;
$$;

revoke all on function public.focus_reset_participant(uuid, uuid, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.focus_advance_participant(uuid, uuid, timestamptz)             from public, anon, authenticated;
revoke all on function public.focus_participant_json(public.classroom_focus_participants, timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_focus_session(uuid, text)                            from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) RPC ของนักเรียน (เรียกจาก browser ตรง — ไม่ผ่าน server action เพราะยิงทุก 10 วิ)
-- ---------------------------------------------------------------------

-- ล็อกรอบแบบ share: กันจังหวะที่ครูกดหยุดพร้อมกัน แล้วนักเรียนถูกเปิดก้อนใหม่ในรอบที่จบไปแล้ว
create or replace function public.report_focus_heartbeat(p_focus_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_focus public.classroom_focus_sessions;
  v_p     public.classroom_focus_participants;
begin
  if v_uid is null then
    raise exception 'not_authorized_or_not_found';
  end if;

  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id
  for share;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
  if v_focus.status <> 'running' then
    return jsonb_build_object('status', 'ended', 'server_now', v_now);
  end if;

  v_p := public.focus_advance_participant(p_focus_session_id, v_uid, v_now);
  if v_p.user_id is null then
    raise exception 'not_a_focus_participant';
  end if;

  insert into public.classroom_focus_heartbeats (focus_session_id, user_id, last_heartbeat_at)
  values (p_focus_session_id, v_uid, v_now)
  on conflict (focus_session_id, user_id) do update set last_heartbeat_at = excluded.last_heartbeat_at;

  return public.focus_participant_json(v_p, v_now);
end;
$$;


-- p_event_type:
--   หลุด:  background | tab_change | screen_touch
--   กลับ:  foreground (กลับเข้าแอป/แท็บ, meta.hidden_ms = เวลาที่หายไปวัดในเครื่อง) — ปิด warning ที่ทัน grace
--          resume (client วางนิ่งแล้ว) — ปิด warning ที่ทัน grace หรือเริ่มก้อนใหม่ถ้า away
--   log:   wake_lock_unsupported (ครั้งเดียวต่อคนต่อรอบ)
create or replace function public.report_focus_signal(
  p_focus_session_id uuid,
  p_event_type text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_grace constant interval := interval '10 seconds';
  v_uid      uuid := auth.uid();
  v_now      timestamptz := now();
  v_focus    public.classroom_focus_sessions;
  v_p        public.classroom_focus_participants;
  v_meta     jsonb;
  v_hidden   interval := interval '0';
  v_break_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authorized_or_not_found';
  end if;
  if p_event_type is null or p_event_type not in (
    'background', 'tab_change', 'screen_touch', 'foreground', 'resume', 'wake_lock_unsupported'
  ) then
    raise exception 'invalid_focus_signal';
  end if;

  -- meta จาก client: เก็บเฉพาะ object เล็กๆ (debug false positive) ไม่ให้ยัดข้อมูลก้อนใหญ่
  v_meta := case when jsonb_typeof(p_meta) = 'object' and length(p_meta::text) <= 500
                 then p_meta else '{}'::jsonb end;
  if jsonb_typeof(v_meta -> 'hidden_ms') = 'number' then
    v_hidden := make_interval(secs => least(greatest((v_meta ->> 'hidden_ms')::numeric, 0), 3600000) / 1000);
  end if;

  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id
  for share;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
  if v_focus.status <> 'running' then
    return jsonb_build_object('status', 'ended', 'server_now', v_now);
  end if;

  -- กลับจาก background พร้อม hidden_ms: ประเมินถึงตอนเริ่มหายไปก่อน ก้อนที่ "ครบ" ระหว่างหายไปจะไม่ถูกนับ
  v_break_at := case when p_event_type = 'foreground' and v_hidden >= interval '1 second'
                     then v_now - v_hidden else v_now end;
  v_p := public.focus_advance_participant(p_focus_session_id, v_uid, v_break_at);
  if v_p.user_id is null then
    raise exception 'not_a_focus_participant';
  end if;

  if p_event_type = 'wake_lock_unsupported' then
    if not exists (
      select 1 from public.classroom_focus_events
      where focus_session_id = p_focus_session_id and user_id = v_uid
        and event_type = 'wake_lock_unsupported'
    ) then
      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
      values (p_focus_session_id, v_uid, 'wake_lock_unsupported', v_meta);
    end if;

  elsif p_event_type in ('background', 'tab_change', 'screen_touch') then
    -- warning/away อยู่แล้ว = การหลุดครั้งเดิม ไม่นับซ้ำ (client ส่งครั้งเดียวต่อช่วงหลุดอยู่แล้ว)
    if v_p.focus_state = 'focusing' then
      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
      values (p_focus_session_id, v_uid, p_event_type, v_meta);

      if not v_p.grace_used then
        update public.classroom_focus_participants
        set focus_state = 'warning',
            warning_started_at = v_now,
            grace_used = true,
            warned_count = warned_count + 1
        where focus_session_id = p_focus_session_id and user_id = v_uid
        returning * into v_p;

        insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
        values (p_focus_session_id, v_uid, 'warning', jsonb_build_object('signal', p_event_type));
      else
        v_p := public.focus_reset_participant(p_focus_session_id, v_uid, v_now, 'second_break',
                                              jsonb_build_object('signal', p_event_type));
      end if;
    end if;

  else  -- foreground | resume
    if p_event_type = 'foreground' then
      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
      values (p_focus_session_id, v_uid, 'foreground', v_meta);
    end if;

    -- หายไปแต่สัญญาณ background ไม่ถึง server (JS ถูกหยุดก่อนส่ง) → ตัดสินย้อนหลังจาก hidden_ms
    if p_event_type = 'foreground' and v_p.focus_state = 'focusing'
       and v_hidden >= interval '1 second' then
      v_break_at := greatest(v_break_at, v_p.present_since);

      if not v_p.grace_used and v_hidden <= c_grace then
        update public.classroom_focus_participants
        set grace_used = true,
            warned_count = warned_count + 1
        where focus_session_id = p_focus_session_id and user_id = v_uid
        returning * into v_p;

        insert into public.classroom_focus_events (focus_session_id, user_id, event_type, occurred_at, meta)
        values (p_focus_session_id, v_uid, 'warning', v_break_at,
                jsonb_build_object('signal', 'background', 'retro', true,
                                   'hidden_ms', v_meta -> 'hidden_ms'));
      else
        v_p := public.focus_reset_participant(
          p_focus_session_id, v_uid, v_break_at,
          case when v_p.grace_used then 'second_break' else 'grace_expired' end,
          jsonb_build_object('retro', true, 'hidden_ms', v_meta -> 'hidden_ms'));
      end if;
    end if;

    -- ประเมินต่อถึงตอนนี้ (grace ของ warning ที่ server ได้รับไว้ก่อนหน้าอาจหมดระหว่างที่หายไป)
    v_p := public.focus_advance_participant(p_focus_session_id, v_uid, v_now);

    if v_p.focus_state = 'warning' then
      -- กลับมาทัน grace (ถ้าไม่ทัน advance ด้านบนเปลี่ยนเป็น away ไปแล้ว)
      update public.classroom_focus_participants
      set focus_state = 'focusing', warning_started_at = null
      where focus_session_id = p_focus_session_id and user_id = v_uid
      returning * into v_p;

      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
      values (p_focus_session_id, v_uid, 'resume', jsonb_build_object('from', 'warning'));

    elsif v_p.focus_state = 'away' and p_event_type = 'resume' then
      -- เริ่มก้อนใหม่ นับ 0 — เฉพาะ resume (client ส่งเมื่อวางนิ่งแล้ว) ไม่ใช่ตอนเพิ่งกลับเข้าแอปขณะยังถือเครื่อง
      update public.classroom_focus_participants
      set focus_state = 'focusing',
          present_since = v_now,
          block_started_at = v_now,
          grace_used = false
      where focus_session_id = p_focus_session_id and user_id = v_uid
      returning * into v_p;

      insert into public.classroom_focus_events (focus_session_id, user_id, event_type, meta)
      values (p_focus_session_id, v_uid, 'resume', jsonb_build_object('from', 'away'));
    end if;

    insert into public.classroom_focus_heartbeats (focus_session_id, user_id, last_heartbeat_at)
    values (p_focus_session_id, v_uid, v_now)
    on conflict (focus_session_id, user_id) do update set last_heartbeat_at = excluded.last_heartbeat_at;
  end if;

  return public.focus_participant_json(v_p, v_now);
end;
$$;


-- ครู: จำนวนรวมสด (ไม่มีรายชื่อ/ข้อมูลรายคน) — ประเมิน lazy ทุกคนก่อนนับ คนที่เงียบไปจึงไม่ค้างเป็น "ตั้งใจอยู่"
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
    'total', count(*),
    'focusing', count(*) filter (where focus_state = 'focusing'),
    'warning', count(*) filter (where focus_state = 'warning'),
    'away', count(*) filter (where focus_state = 'away'),
    'completed_blocks', coalesce(sum(completed_blocks), 0),
    'server_now', v_now
  ) into v_sum
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id;

  return v_sum;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) ทางจบคาบทุกทางผ่าน finalize_focus_session
-- ---------------------------------------------------------------------

-- ครูกดหยุด: signature/รูปแบบผลลัพธ์เดิม + completed_blocks/focused_seconds
create or replace function public.end_focus_mode_session(p_focus_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_focus       public.classroom_focus_sessions;
  v_was_running boolean;
  v_sum         jsonb;
begin
  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  v_was_running := v_focus.status = 'running';
  v_sum := public.finalize_focus_session(p_focus_session_id, 'host_ended');

  if v_was_running then
    update public.classroom_sessions
    set current_activity = null,
        active_focus_session_id = null
    where id = v_focus.classroom_session_id
      and current_activity = 'focus_mode'
      and active_focus_session_id = v_focus.id;
  end if;

  return jsonb_build_object(
    'focus_session_id', v_focus.id,
    'already_ended', not v_was_running
  ) || v_sum;
end;
$$;


-- ห้องจบ → จบ Raid ที่ค้าง (เดิมทุกบรรทัด) + ปิดคาบตั้งใจผ่าน finalize แทน update ตรงๆ
create or replace function public.classroom_end_open_boss_raids()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_raid  uuid;
  v_focus uuid;
begin
  for v_raid in
    select b.id
    from public.classroom_boss_raids cbr
    join public.boss_raid_sessions b on b.id = cbr.boss_raid_session_id
    where cbr.classroom_session_id = new.id and b.status <> 'ended'
  loop
    perform public.resolve_boss_raid_session(v_raid, 'host_ended');
  end loop;

  -- คาบตั้งใจที่ยังรันอยู่ (ห้องละไม่เกิน 1 รอบ — unique index one_running_per_room)
  for v_focus in
    select id from public.classroom_focus_sessions
    where classroom_session_id = new.id and status = 'running'
  loop
    perform public.finalize_focus_session(v_focus, 'host_ended');
  end loop;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5) สิทธิ์
-- ---------------------------------------------------------------------

revoke all on function public.report_focus_heartbeat(uuid)             from public, anon;
revoke all on function public.report_focus_signal(uuid, text, jsonb)   from public, anon;
revoke all on function public.get_focus_live_summary(uuid)             from public, anon;

grant execute on function public.report_focus_heartbeat(uuid)           to authenticated;
grant execute on function public.report_focus_signal(uuid, text, jsonb) to authenticated;
grant execute on function public.get_focus_live_summary(uuid)           to authenticated;

commit;

-- ============================================================
-- Rollback (ย้อนเป็น Phase 1 + 20260925180000):
--   drop function report_focus_heartbeat, report_focus_signal, get_focus_live_summary,
--        finalize_focus_session, focus_participant_json, focus_advance_participant, focus_reset_participant;
--   create or replace end_focus_mode_session / classroom_end_open_boss_raids ตามไฟล์เดิม;
--   drop table classroom_focus_heartbeats;
--   alter table classroom_focus_participants drop constraint classroom_focus_participants_state_consistency,
--     drop column focus_state, present_since, block_started_at, grace_used, warning_started_at, completed_blocks;
--   คืน check ของ classroom_focus_events.event_type (ตัด resume, block_complete — ลบแถวชนิดนั้นก่อน)
-- ============================================================
