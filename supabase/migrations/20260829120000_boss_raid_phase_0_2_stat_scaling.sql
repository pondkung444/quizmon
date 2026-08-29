-- Migration: 20260829120000_boss_raid_phase_0_2_stat_scaling
-- Classroom Boss Raid — Phase 0.2 (Stat Aggregation + HP Scaling)
-- อ้างอิง: claude_classroom-boss-raid-design-2026-08-28-v2.md §11 (sub-phase 0.2)
--
-- ครูกด "เริ่มเกม" -> start_boss_raid_game() (security definer):
--   นับ + average stat_snapshot ของ participant ทั้งห้อง -> คำนวณ boss/crystal HP max
--   (สูตร placeholder — ตัวเลขจริงรอ simulator tune Phase 0.4/0.5) -> lobby -> in_progress
--   client เห็นผ่าน realtime UPDATE ของ boss_raid_sessions (subscribe อยู่แล้วจาก 0.1)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.boss_raid_sessions
  add column avg_stat_snapshot jsonb,
  add column participant_count_at_start integer;

comment on column public.boss_raid_sessions.avg_stat_snapshot is
  'ค่าเฉลี่ย stat_snapshot ทุกแกน (hp/atk/def/spd/foc) ของ participant ทั้งห้อง ณ ตอนกดเริ่มเกม — เก็บครบไว้ log/debug.';
comment on column public.boss_raid_sessions.participant_count_at_start is
  'จำนวน participant ณ ตอนกดเริ่มเกม (ใช้ในสูตร HP scaling).';

-- ============================================================
-- start_boss_raid_game — ครูเจ้าของห้องกดเริ่มเกม (lobby -> in_progress)
-- ============================================================
create or replace function public.start_boss_raid_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
  v_count integer;
  v_avg jsonb;
  v_avg_atk numeric;
  v_avg_def numeric;
  v_boss_hp_max integer;
  v_crystal_hp_max integer;
  c_target_correct constant numeric := 17.5;
  c_target_wrong   constant numeric := 9;
  c_stat_baseline  constant numeric := 100;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_session
  from public.boss_raid_sessions
  where id = p_session_id;

  if not found then
    raise exception 'ไม่พบห้องนี้';
  end if;

  if v_session.teacher_id <> v_user_id then
    raise exception 'ไม่มีสิทธิ์เริ่มเกมนี้';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'ห้องนี้เริ่มไปแล้วหรือจบแล้ว';
  end if;

  select
    count(*),
    jsonb_build_object(
      'hp',  avg(coalesce((stat_snapshot ->> 'hp')::numeric, 0)),
      'atk', avg(coalesce((stat_snapshot ->> 'atk')::numeric, 0)),
      'def', avg(coalesce((stat_snapshot ->> 'def')::numeric, 0)),
      'spd', avg(coalesce((stat_snapshot ->> 'spd')::numeric, 0)),
      'foc', avg(coalesce((stat_snapshot ->> 'foc')::numeric, 0))
    )
  into v_count, v_avg
  from public.boss_raid_participants
  where session_id = p_session_id;

  if v_count = 0 then
    raise exception 'ยังไม่มีใครเข้าห้อง';
  end if;

  v_avg_atk := (v_avg ->> 'atk')::numeric;
  v_avg_def := (v_avg ->> 'def')::numeric;

  v_boss_hp_max    := round(c_target_correct * v_count * (v_avg_atk / c_stat_baseline));
  v_crystal_hp_max := round(c_target_wrong   * v_count * (v_avg_def / c_stat_baseline));

  update public.boss_raid_sessions
  set boss_hp                    = v_boss_hp_max,
      boss_hp_max                = v_boss_hp_max,
      crystal_hp                 = v_crystal_hp_max,
      crystal_hp_max             = v_crystal_hp_max,
      avg_stat_snapshot          = v_avg,
      participant_count_at_start = v_count,
      status                     = 'in_progress',
      started_at                 = now()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id',                 v_session.id,
    'status',                     v_session.status,
    'join_code',                  v_session.join_code,
    'config',                     v_session.config,
    'boss_hp',                    v_session.boss_hp,
    'boss_hp_max',                v_session.boss_hp_max,
    'crystal_hp',                 v_session.crystal_hp,
    'crystal_hp_max',             v_session.crystal_hp_max,
    'avg_stat_snapshot',          v_session.avg_stat_snapshot,
    'participant_count_at_start', v_session.participant_count_at_start,
    'started_at',                 v_session.started_at
  );
end;
$$;

grant execute on function public.start_boss_raid_game(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
-- ============================================================
-- begin;
-- drop function if exists public.start_boss_raid_game(uuid);
-- alter table public.boss_raid_sessions
--   drop column if exists participant_count_at_start,
--   drop column if exists avg_stat_snapshot;
-- commit;
