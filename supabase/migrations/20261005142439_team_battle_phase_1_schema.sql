-- ============================================================================
-- Team Battle — เฟส 1: ตาราง pvp_team_* + RLS + realtime + จุดเกี่ยวห้องเรียน
-- DRAFT 2026-10-05 — ยังไม่ apply (รอปอนด์ดู SQL เต็ม + diff แล้วอนุมัติ)
--
-- ขอบเขต: เพิ่มอย่างเดียว ไม่มี RPC เล่นเกม ไม่มี UI ไม่มีการ์ดทางเข้า
--   → ครูและนักเรียนไม่เห็นอะไรเปลี่ยนจนกว่าเฟส 2-4 จะเสร็จ
--
-- แตะของเดิม (ต้องอนุมัติ — ดู diff ในแชท):
--   1) classroom_sessions: เพิ่มคอลัมน์ active_team_battle_id + ขยาย CHECK current_activity
--   2) classroom_activity_is_busy(): เพิ่ม branch 'team_battle'
--   3) classroom_end_open_boss_raids(): เพิ่มการปิด battle ที่ค้างเมื่อห้องจบ
-- ไม่แตะ: pvp_*, boss_raid_*, raid_*, exp.ts, evolution.ts, clear_classroom_activity()
--
-- ความเป็นส่วนตัว: pvp_team_answers อ่านได้เฉพาะแถวของตัวเอง; ตาราง members ไม่เก็บ
--   ตัวนับถูก/ผิดรายคน → จอกลาง/เพื่อนผูกชื่อกับคำตอบผิดไม่ได้
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- 1. pvp_team_battles — child session ของห้องเรียน (1 แถว = 1 เกม)
-- ----------------------------------------------------------------------------
create table public.pvp_team_battles (
  id                    uuid primary key default gen_random_uuid(),
  classroom_session_id  uuid not null references public.classroom_sessions(id),
  teacher_id            uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'setup',
  config                jsonb not null default '{}'::jsonb,
  stat_a                jsonb,
  stat_b                jsonb,
  hp_a                  integer,
  hp_b                  integer,
  hp_max_a              integer,
  hp_max_b              integer,
  player_count_a        integer,
  player_count_b        integer,
  current_round         integer not null default 0,
  attacker_team         text,
  phase                 text,
  active_card_id        uuid,
  round_deadline        timestamptz,
  started_at            timestamptz,
  ends_at               timestamptz,
  ended_at              timestamptz,
  ended_reason          text,
  outcome               text,
  reward_distributed_at timestamptz,
  created_at            timestamptz not null default now(),
  last_action_at        timestamptz not null default now(),
  constraint pvp_team_battles_status_check
    check (status in ('setup', 'active', 'finished', 'abandoned')),
  constraint pvp_team_battles_attacker_team_check
    check (attacker_team is null or attacker_team in ('a', 'b')),
  constraint pvp_team_battles_phase_check
    check (phase is null or phase in ('picking', 'answering')),
  constraint pvp_team_battles_outcome_check
    check (outcome is null or outcome in ('a_win', 'b_win', 'draw')),
  constraint pvp_team_battles_ended_reason_check
    check (ended_reason is null or ended_reason in
      ('hp_zero', 'time_up', 'host_ended', 'stale_timeout', 'room_ended')),
  constraint pvp_team_battles_ended_consistency
    check ((status in ('setup', 'active')) = (ended_at is null)),
  constraint pvp_team_battles_outcome_only_finished
    check (outcome is null or status = 'finished')
);

comment on table public.pvp_team_battles is
  'Team Battle — child session ของ classroom_sessions (1 แถว = 1 เกม ทีม A vs B). เขียนผ่าน RPC security definer เท่านั้น (เฟส 2+) client ไม่มี write policy.';

-- ห้องละ 1 เกมที่ยังเปิดอยู่
create unique index pvp_team_battles_one_open_per_room
  on public.pvp_team_battles (classroom_session_id)
  where status in ('setup', 'active');

create index pvp_team_battles_room_idx
  on public.pvp_team_battles (classroom_session_id, created_at desc);

create index pvp_team_battles_teacher_idx
  on public.pvp_team_battles (teacher_id);

-- ----------------------------------------------------------------------------
-- 2. pvp_team_members — รายชื่อทีม (ล็อกตอนเริ่ม)
--    ไม่มีตัวนับถูก/ผิดรายคนในตารางนี้โดยตั้งใจ (กฎ "ไม่โชว์ชื่อคนตอบผิด")
-- ----------------------------------------------------------------------------
create table public.pvp_team_members (
  battle_id        uuid not null references public.pvp_team_battles(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  team             text not null,
  pet_id           uuid references public.pets(id) on delete set null,
  stat_snapshot    jsonb not null default '{}'::jsonb,
  is_player        boolean not null default true,
  commander_order  integer,
  joined_at        timestamptz not null default now(),
  primary key (battle_id, user_id),
  constraint pvp_team_members_team_check check (team in ('a', 'b'))
);

comment on table public.pvp_team_members is
  'Team Battle — สมาชิกทีม. is_player=false = เข้าช้า ดูอย่างเดียว. ไม่เก็บผลตอบรายคน.';

create index pvp_team_members_user_idx
  on public.pvp_team_members (user_id);

-- ----------------------------------------------------------------------------
-- 3. pvp_team_cards — มือการ์ดของผู้บัญชาการต่อยก (ใบที่ไม่เลือกถูกลบตอนเลือก เหมือน PvP)
-- ----------------------------------------------------------------------------
create table public.pvp_team_cards (
  id                 uuid primary key default gen_random_uuid(),
  battle_id          uuid not null references public.pvp_team_battles(id) on delete cascade,
  round_no           integer not null,
  team               text not null,
  drawn_for_user_id  uuid not null references auth.users(id) on delete cascade,
  chapter            text not null,
  subject            text not null,
  difficulty         smallint not null,
  effect_id          text references public.pvp_card_effects(id),
  question_id        bigint not null references public.questions(id),
  played_at          timestamptz,
  created_at         timestamptz not null default now(),
  constraint pvp_team_cards_team_check check (team in ('a', 'b'))
);

comment on table public.pvp_team_cards is
  'Team Battle — มือการ์ด. SELECT ได้เฉพาะมือของผู้บัญชาการเอง + การ์ดที่ลงสนามแล้ว (ผู้ชมในห้อง).';

create index pvp_team_cards_battle_round_idx
  on public.pvp_team_cards (battle_id, round_no);

alter table public.pvp_team_battles
  add constraint pvp_team_battles_active_card_fk
  foreign key (active_card_id) references public.pvp_team_cards(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4. pvp_team_answers — คำตอบรายคน (อ่านได้เฉพาะของตัวเอง)
-- ----------------------------------------------------------------------------
create table public.pvp_team_answers (
  battle_id     uuid not null references public.pvp_team_battles(id) on delete cascade,
  round_no      integer not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  card_id       uuid not null references public.pvp_team_cards(id) on delete cascade,
  answer_index  integer,
  is_correct    boolean not null,
  timed_out     boolean not null default false,
  answered_ms   integer,
  answered_at   timestamptz not null default now(),
  primary key (battle_id, round_no, user_id)
);

comment on table public.pvp_team_answers is
  'Team Battle — คำตอบรายคน. RLS: เห็นเฉพาะแถวของตัวเอง; ตัวเลขรวมออกผ่าน RPC aggregate เท่านั้น (ห้ามส่ง user_id คนตอบผิดออกจอกลาง).';

create index pvp_team_answers_user_idx
  on public.pvp_team_answers (user_id);

-- ----------------------------------------------------------------------------
-- 5. pvp_team_rounds — ผลต่อยก (aggregate เท่านั้น ไม่มี user_id)
--    คอลัมน์องค์ประกอบดาเมจเป็นค่าเริ่มต้นสำหรับเฟส 3 ปรับเพิ่มแบบ additive ได้
-- ----------------------------------------------------------------------------
create table public.pvp_team_rounds (
  battle_id         uuid not null references public.pvp_team_battles(id) on delete cascade,
  round_no          integer not null,
  attacker_team     text not null,
  card_id           uuid references public.pvp_team_cards(id) on delete set null,
  effect_id         text references public.pvp_card_effects(id),
  defenders_total   integer not null,
  correct_count     integer not null,
  wrong_count       integer not null,
  no_answer_count   integer not null default 0,
  damage            integer not null default 0,
  crit              boolean not null default false,
  effect_triggered  boolean not null default false,
  self_damage       integer not null default 0,
  heal_self         integer not null default 0,
  heal_defender     integer not null default 0,
  pierce            integer not null default 0,
  hp_a_after        integer not null,
  hp_b_after        integer not null,
  timed_out         boolean not null default false,
  resolved_at       timestamptz not null default now(),
  primary key (battle_id, round_no),
  constraint pvp_team_rounds_attacker_team_check check (attacker_team in ('a', 'b'))
);

comment on table public.pvp_team_rounds is
  'Team Battle — ผลต่อยก (aggregate). อ่านได้โดยครู + สมาชิกห้อง. ไม่มี user_id.';

-- ----------------------------------------------------------------------------
-- 6. helper สำหรับ RLS (ผู้ชม = ครูเจ้าของห้อง หรือสมาชิกห้อง)
-- ----------------------------------------------------------------------------
create or replace function public.is_pvp_team_battle_viewer(p_battle_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.pvp_team_battles b
    where b.id = p_battle_id
      and (b.teacher_id = auth.uid() or public.is_classroom_member(b.classroom_session_id))
  );
$function$;

revoke all on function public.is_pvp_team_battle_viewer(uuid) from public, anon;
grant execute on function public.is_pvp_team_battle_viewer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RLS — SELECT เท่านั้น ไม่มี INSERT/UPDATE/DELETE policy (เขียนผ่าน RPC)
-- ----------------------------------------------------------------------------
alter table public.pvp_team_battles enable row level security;
alter table public.pvp_team_members enable row level security;
alter table public.pvp_team_cards   enable row level security;
alter table public.pvp_team_answers enable row level security;
alter table public.pvp_team_rounds  enable row level security;

create policy "pvp_team_battles: teacher or room member select"
  on public.pvp_team_battles for select
  using (teacher_id = auth.uid() or public.is_classroom_member(classroom_session_id));

create policy "pvp_team_members: viewer select"
  on public.pvp_team_members for select
  using (public.is_pvp_team_battle_viewer(battle_id));

create policy "pvp_team_cards: own hand or played"
  on public.pvp_team_cards for select
  using (
    drawn_for_user_id = auth.uid()
    or (played_at is not null and public.is_pvp_team_battle_viewer(battle_id))
  );

create policy "pvp_team_answers: own select"
  on public.pvp_team_answers for select
  using (user_id = auth.uid());

create policy "pvp_team_rounds: viewer select"
  on public.pvp_team_rounds for select
  using (public.is_pvp_team_battle_viewer(battle_id));

-- ถอนสิทธิ์เขียนตรงจาก client (Supabase default grant ให้ครบ — ถอนให้เหลือ SELECT)
revoke all on table
  public.pvp_team_battles,
  public.pvp_team_members,
  public.pvp_team_cards,
  public.pvp_team_answers,
  public.pvp_team_rounds
from anon, authenticated;

grant select on table
  public.pvp_team_battles,
  public.pvp_team_members,
  public.pvp_team_cards,
  public.pvp_team_answers,
  public.pvp_team_rounds
to authenticated;

-- ----------------------------------------------------------------------------
-- 8. realtime (ไม่รวม pvp_team_answers — ไม่ broadcast คำตอบรายคน)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pvp_team_battles', 'pvp_team_members', 'pvp_team_cards', 'pvp_team_rounds']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 9. จุดเกี่ยวห้องเรียน (แตะของเดิม — เพิ่ม branch เท่านั้น ตาม precedent focus_mode phase 1)
-- ----------------------------------------------------------------------------

-- 9.1 คอลัมน์ชี้ battle ที่ active (nullable — แถวเดิมไม่กระทบ)
alter table public.classroom_sessions
  add column active_team_battle_id uuid references public.pvp_team_battles(id);

create index classroom_sessions_active_team_battle_idx
  on public.classroom_sessions (active_team_battle_id)
  where active_team_battle_id is not null;

-- 9.2 ขยาย CHECK ของ current_activity
alter table public.classroom_sessions
  drop constraint classroom_sessions_current_activity_check;

alter table public.classroom_sessions
  add constraint classroom_sessions_current_activity_check
  check (
    current_activity is null
    or current_activity = any (array['name_picker', 'boss_raid', 'focus_mode', 'team_battle']::text[])
  );

-- 9.3 classroom_activity_is_busy — เพิ่ม branch team_battle (ที่เหลือเหมือน prod ทุกตัวอักษร)
create or replace function public.classroom_activity_is_busy(p_room classroom_sessions)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
  elsif p_room.current_activity = 'team_battle' then
    return exists (
      select 1 from public.pvp_team_battles t
      where t.id = p_room.active_team_battle_id and t.status in ('setup', 'active')
    );
  end if;
  -- null / name_picker
  return false;
end;
$function$;

-- 9.4 classroom_end_open_boss_raids — เพิ่มการปิด battle ที่ค้างเมื่อห้องจบ (ที่เหลือเหมือน prod)
create or replace function public.classroom_end_open_boss_raids()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Team Battle ที่ยังเปิดอยู่ (ห้องละไม่เกิน 1 เกม — unique index one_open_per_room)
  -- เฟส 1: ปิดเป็น abandoned เฉย ๆ ไม่แจกรางวัล (เฟส 3/6 จะเปลี่ยนเป็นฟังก์ชัน finalize)
  update public.pvp_team_battles
  set status = 'abandoned',
      ended_at = now(),
      ended_reason = 'room_ended',
      round_deadline = null,
      last_action_at = now()
  where classroom_session_id = new.id
    and status in ('setup', 'active');

  return new;
end;
$function$;

commit;

-- ============================================================================
-- ตรวจหลัง apply (read-only):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'classroom_sessions_current_activity_check';
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename like 'pvp_team_%';
--   select tablename, policyname, cmd from pg_policies where tablename like 'pvp_team_%';
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_name like 'pvp_team_%' and grantee in ('anon','authenticated');
--   + get_advisors (security, performance)
--
-- ROLLBACK (ทำเมื่อยังไม่มีแถว current_activity='team_battle' และยังไม่มีข้อมูลในตาราง pvp_team_*):
--   begin;
--   -- คืนฟังก์ชันสองตัวเป็นเวอร์ชัน prod เดิม (ดู diff: ลบ branch team_battle / ลบ update pvp_team_battles)
--   alter table public.classroom_sessions drop constraint classroom_sessions_current_activity_check;
--   alter table public.classroom_sessions add constraint classroom_sessions_current_activity_check
--     check (current_activity is null or current_activity = any (array['name_picker','boss_raid','focus_mode']::text[]));
--   drop index if exists public.classroom_sessions_active_team_battle_idx;
--   alter table public.classroom_sessions drop column active_team_battle_id;
--   drop table public.pvp_team_rounds, public.pvp_team_answers, public.pvp_team_cards,
--              public.pvp_team_members, public.pvp_team_battles;   -- (ตามลำดับ FK; ใช้ cascade ถ้าจำเป็น)
--   drop function public.is_pvp_team_battle_viewer(uuid);
--   commit;
-- ============================================================================
