-- =====================================================================
-- คาบตั้งใจ (Focus Mode) — Phase 1: โครงกระดูก Start/Stop
-- ขอบเขต: ตาราง + RLS + realtime + guard กันเปิดกิจกรรมซ้อน + RPC launch/join/end/clear
-- ยังไม่มี: heartbeat/signal (Phase 2), EXP (Phase 3), reaper/สรุป (Phase 4)
--
-- กฎ: ไม่แตะ boss_raid_* เลย (ตาราง/ฟังก์ชัน/trigger/cron) — อ่าน boss_raid_sessions.status
--     อย่างเดียวใน helper ด้านล่าง. ฝั่ง Focus เขียนเฉพาะคอลัมน์ของตัวเอง
--     (active_focus_session_id) + current_activity ของ classroom_sessions
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ตาราง
-- ---------------------------------------------------------------------

create table public.classroom_focus_sessions (
  id                   uuid primary key default gen_random_uuid(),
  classroom_session_id uuid not null references public.classroom_sessions(id),
  teacher_id           uuid not null references auth.users(id) on delete cascade,
  status               text not null default 'running'
                         check (status in ('running', 'ended')),
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  ended_reason         text check (ended_reason in ('host_ended', 'stale_timeout')),
  -- running <=> ยังไม่มี ended_at
  constraint classroom_focus_sessions_ended_consistency
    check ((status = 'running') = (ended_at is null))
);

comment on table public.classroom_focus_sessions is
  'คาบตั้งใจ 1 แถวต่อ 1 รอบ (child ของ classroom_sessions) — เขียนผ่าน RPC security definer เท่านั้น';

-- ห้องเดียวมี focus ที่ running ได้ทีละรอบ
create unique index classroom_focus_sessions_one_running_per_room
  on public.classroom_focus_sessions (classroom_session_id)
  where status = 'running';
create index classroom_focus_sessions_room_idx
  on public.classroom_focus_sessions (classroom_session_id, started_at desc);
create index classroom_focus_sessions_teacher_idx
  on public.classroom_focus_sessions (teacher_id);


create table public.classroom_focus_participants (
  focus_session_id uuid not null references public.classroom_focus_sessions(id),
  user_id          uuid not null references auth.users(id) on delete cascade,
  joined_at        timestamptz not null default now(),  -- EXP นับจากเวลาที่เข้าจริง (late-joiner)
  focused_seconds  integer not null default 0 check (focused_seconds >= 0),
  warned_count     integer not null default 0 check (warned_count >= 0),
  exp_awarded      integer not null default 0 check (exp_awarded >= 0),
  primary key (focus_session_id, user_id)
);

comment on table public.classroom_focus_participants is
  'ผู้เข้าร่วมคาบตั้งใจ — นักเรียนเห็นแค่แถวของตัวเอง ครูเห็นทั้งรอบ';

create index classroom_focus_participants_user_idx
  on public.classroom_focus_participants (user_id);


create table public.classroom_focus_events (
  id               bigint generated always as identity primary key,
  focus_session_id uuid not null references public.classroom_focus_sessions(id),
  user_id          uuid not null references auth.users(id) on delete cascade,
  event_type       text not null check (event_type in (
                     'background', 'foreground', 'tab_change', 'screen_touch',
                     'warning', 'break', 'reset',
                     'heartbeat_timeout',
                     'wake_lock_unsupported'
                   )),
  occurred_at      timestamptz not null default now(),
  meta             jsonb not null default '{}'::jsonb
);

comment on table public.classroom_focus_events is
  'append-only log ต่อคน (ใช้คำนวณเวลาจริง + debug false positive) — heartbeat ปกติไม่ลงตารางนี้';

create index classroom_focus_events_session_user_time_idx
  on public.classroom_focus_events (focus_session_id, user_id, occurred_at);
create index classroom_focus_events_user_idx
  on public.classroom_focus_events (user_id);


-- ---------------------------------------------------------------------
-- 2) classroom_sessions: pointer ของ Focus + อนุญาต tag 'focus_mode'
-- ---------------------------------------------------------------------

alter table public.classroom_sessions
  add column active_focus_session_id uuid references public.classroom_focus_sessions(id);

create index classroom_sessions_active_focus_idx
  on public.classroom_sessions (active_focus_session_id)
  where active_focus_session_id is not null;

alter table public.classroom_sessions
  drop constraint classroom_sessions_current_activity_check;
alter table public.classroom_sessions
  add constraint classroom_sessions_current_activity_check
  check (current_activity is null
         or current_activity = any (array['name_picker', 'boss_raid', 'focus_mode']));


-- ---------------------------------------------------------------------
-- 3) Guard กันเปิดกิจกรรมซ้อน (อยู่บน classroom_sessions ไม่แตะ boss_raid_*)
--
-- "ว่าง" = current_activity เป็น null | name_picker (ไม่มี state ให้เสีย)
--          | boss_raid ที่ boss_raid_sessions.status = 'ended' (อ่านอย่างเดียว)
--          | focus_mode ที่ classroom_focus_sessions.status = 'ended'
-- ห้องที่ Raid/Focus จบไปแล้วจึงไม่ค้าง แม้ current_activity ยังเป็นค่าเดิม
-- ---------------------------------------------------------------------

create or replace function public.classroom_activity_is_busy(p_room public.classroom_sessions)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if p_room.current_activity = 'boss_raid' then
    return exists (
      select 1 from public.boss_raid_sessions b
      where b.id = p_room.active_boss_raid_session_id and b.status <> 'ended'
    );
  elsif p_room.current_activity = 'focus_mode' then
    return exists (
      select 1 from public.classroom_focus_sessions f
      where f.id = p_room.active_focus_session_id and f.status <> 'ended'
    );
  end if;
  -- null / name_picker
  return false;
end;
$$;

create or replace function public.classroom_activity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- ทำงานเฉพาะตอนเปลี่ยนไปเป็นกิจกรรมใหม่ที่ต่างจากเดิม (ดู WHEN ที่ trigger)
  if old.current_activity is not null and public.classroom_activity_is_busy(old) then
    raise exception 'classroom_activity_busy';
  end if;
  return new;
end;
$$;

create trigger classroom_sessions_activity_guard
  before update of current_activity on public.classroom_sessions
  for each row
  when (new.current_activity is not null
        and new.current_activity is distinct from old.current_activity)
  execute function public.classroom_activity_guard();

revoke all on function public.classroom_activity_is_busy(public.classroom_sessions) from public, anon, authenticated;
revoke all on function public.classroom_activity_guard() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4) RLS — อ่านได้ตามสิทธิ์ ส่วนเขียนผ่าน RPC security definer เท่านั้น
-- ---------------------------------------------------------------------

alter table public.classroom_focus_sessions     enable row level security;
alter table public.classroom_focus_participants enable row level security;
alter table public.classroom_focus_events       enable row level security;

create policy "classroom_focus_sessions: member select"
  on public.classroom_focus_sessions for select
  using (teacher_id = auth.uid() or public.is_classroom_member(classroom_session_id));

-- นักเรียนเห็นเฉพาะแถวตัวเอง (ไม่เปิดข้อมูลรายคนให้เพื่อน — ไม่ประจาน/ไม่ทำ leaderboard)
create policy "classroom_focus_participants: own or teacher select"
  on public.classroom_focus_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.classroom_focus_sessions fs
      where fs.id = classroom_focus_participants.focus_session_id
        and fs.teacher_id = auth.uid()
    )
  );

create policy "classroom_focus_events: own or teacher select"
  on public.classroom_focus_events for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.classroom_focus_sessions fs
      where fs.id = classroom_focus_events.focus_session_id
        and fs.teacher_id = auth.uid()
    )
  );

revoke insert, update, delete, truncate on public.classroom_focus_sessions     from anon, authenticated;
revoke insert, update, delete, truncate on public.classroom_focus_participants from anon, authenticated;
revoke insert, update, delete, truncate on public.classroom_focus_events       from anon, authenticated;


-- ---------------------------------------------------------------------
-- 5) Realtime (ให้หน้านักเรียน/ครูสลับตาม state สด) — events ไม่ต้อง live
-- ---------------------------------------------------------------------

alter table public.classroom_focus_sessions     replica identity full;
alter table public.classroom_focus_participants replica identity full;

alter publication supabase_realtime add table public.classroom_focus_sessions;
alter publication supabase_realtime add table public.classroom_focus_participants;


-- ---------------------------------------------------------------------
-- 6) RPC
-- ---------------------------------------------------------------------

-- ครูเริ่มคาบตั้งใจ: สร้างรอบ + ใส่ผู้เข้าห้องตอนนี้ทุกคน + set current_activity
-- ถ้ากิจกรรมเดิมยังไม่จบ guard trigger จะ raise 'classroom_activity_busy' และทั้ง tx rollback
create or replace function public.launch_focus_mode_from_classroom(p_session_id uuid)
returns public.classroom_focus_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room  public.classroom_sessions;
  v_focus public.classroom_focus_sessions;
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;

  select * into v_room
  from public.classroom_sessions
  where id = p_session_id and teacher_id = auth.uid() and status <> 'ended'
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  -- กันเริ่มซ้ำ: focus_mode -> focus_mode ไม่ผ่าน guard trigger (current_activity ไม่เปลี่ยน)
  if exists (
    select 1 from public.classroom_focus_sessions
    where classroom_session_id = p_session_id and status = 'running'
  ) then
    raise exception 'classroom_activity_busy';
  end if;

  insert into public.classroom_focus_sessions (classroom_session_id, teacher_id)
  values (p_session_id, auth.uid())
  returning * into v_focus;

  insert into public.classroom_focus_participants (focus_session_id, user_id)
  select v_focus.id, cp.user_id
  from public.classroom_participants cp
  where cp.session_id = p_session_id;

  update public.classroom_sessions
  set current_activity = 'focus_mode',
      active_focus_session_id = v_focus.id
  where id = p_session_id;

  return v_focus;
end;
$$;


-- นักเรียนที่สแกนเข้าห้องระหว่างที่คาบตั้งใจรันอยู่แล้ว (late-joiner) — client เรียกเมื่อเห็น
-- current_activity = 'focus_mode' (ไม่แก้ join_classroom_session). idempotent
create or replace function public.join_focus_session(p_focus_session_id uuid)
returns public.classroom_focus_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_focus public.classroom_focus_sessions;
  v_part  public.classroom_focus_participants;
begin
  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id;

  if not found or v_focus.status <> 'running' then
    raise exception 'focus_session_not_running';
  end if;

  if not public.is_classroom_member(v_focus.classroom_session_id) then
    raise exception 'not_a_classroom_member';
  end if;

  insert into public.classroom_focus_participants (focus_session_id, user_id)
  values (p_focus_session_id, auth.uid())
  on conflict (focus_session_id, user_id) do nothing;

  select * into v_part
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id and user_id = auth.uid();

  return v_part;
end;
$$;


-- ครูกดหยุด: ปิดรอบ + คืนห้องกลับ lobby (current_activity = null) ให้เลือกกิจกรรมถัดไปได้
-- idempotent (กดซ้ำได้). Phase 1 ปิดอย่างเดียว; Phase 3 จะขยาย jsonb ที่คืนให้มีจำนวน EXP
-- (คืน jsonb ตั้งแต่ตอนนี้เพื่อไม่ต้อง drop function ตอนเปลี่ยนรูปแบบผลลัพธ์)
create or replace function public.end_focus_mode_session(p_focus_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_focus public.classroom_focus_sessions;
  v_count integer;
begin
  select * into v_focus
  from public.classroom_focus_sessions
  where id = p_focus_session_id and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  select count(*) into v_count
  from public.classroom_focus_participants
  where focus_session_id = p_focus_session_id;

  if v_focus.status = 'ended' then
    return jsonb_build_object(
      'focus_session_id', v_focus.id,
      'already_ended', true,
      'participant_count', v_count
    );
  end if;

  update public.classroom_focus_sessions
  set status = 'ended', ended_at = now(), ended_reason = 'host_ended'
  where id = v_focus.id;

  update public.classroom_sessions
  set current_activity = null,
      active_focus_session_id = null
  where id = v_focus.classroom_session_id
    and current_activity = 'focus_mode'
    and active_focus_session_id = v_focus.id;

  return jsonb_build_object(
    'focus_session_id', v_focus.id,
    'already_ended', false,
    'participant_count', v_count
  );
end;
$$;


-- ครูเคลียร์กิจกรรมที่จบแล้ว/ไม่มี state (เช่น name_picker) กลับ lobby
-- ปฏิเสธถ้ากิจกรรมยังรันอยู่ — ห้ามทิ้ง Raid/Focus ที่ยังเล่นอยู่ให้ค้างกลางทาง
create or replace function public.clear_classroom_activity(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room public.classroom_sessions;
begin
  select * into v_room
  from public.classroom_sessions
  where id = p_session_id and teacher_id = auth.uid() and status <> 'ended'
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  if v_room.current_activity is null then
    return;
  end if;

  if public.classroom_activity_is_busy(v_room) then
    raise exception 'classroom_activity_busy';
  end if;

  update public.classroom_sessions
  set current_activity = null,
      active_focus_session_id = null
  where id = p_session_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 7) สิทธิ์เรียก RPC — เฉพาะผู้ล็อกอิน (ตรวจสิทธิ์ครู/สมาชิกห้องในตัว RPC เอง)
-- ---------------------------------------------------------------------

revoke all on function public.launch_focus_mode_from_classroom(uuid) from public, anon;
revoke all on function public.join_focus_session(uuid)               from public, anon;
revoke all on function public.end_focus_mode_session(uuid)           from public, anon;
revoke all on function public.clear_classroom_activity(uuid)         from public, anon;

grant execute on function public.launch_focus_mode_from_classroom(uuid) to authenticated;
grant execute on function public.join_focus_session(uuid)               to authenticated;
grant execute on function public.end_focus_mode_session(uuid)           to authenticated;
grant execute on function public.clear_classroom_activity(uuid)         to authenticated;
