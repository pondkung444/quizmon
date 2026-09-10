-- Item 1: Boss Raid sessions must always end with an explicit result.
-- - result gains 'incomplete' (ended early, boss + crystal both still alive)
-- - resolve_boss_raid_session(): single place that closes a raid without a natural win/lose
-- - end_boss_raid_session(): teacher-only manual "End Raid" (same guard as dismiss_boss_raid_event)
-- - close_stale_boss_raid_sessions(): stale cron now routes through the resolver
-- - backfill historical result IS NULL sessions

-- 1. widen result enum
alter table public.boss_raid_sessions drop constraint boss_raid_sessions_result_check;
alter table public.boss_raid_sessions add constraint boss_raid_sessions_result_check
  check (result = any (array['win','lose','incomplete']));

-- 2. audit columns (never silently skip a reward)
alter table public.boss_raid_sessions
  add column if not exists ended_reason text
    check (ended_reason in ('host_ended','stale_timeout')),
  add column if not exists reward_resolution text
    check (reward_resolution in ('distributed','skipped_incomplete','skipped_lose'));

comment on column public.boss_raid_sessions.ended_reason is
  'ทำไมรอบถึงจบผ่าน resolve_boss_raid_session(): host_ended (ครูกดจบ) / stale_timeout (cron). null = จบตามเกม (boss/crystal ถึง 0 ใน submit_boss_raid_answer).';
comment on column public.boss_raid_sessions.reward_resolution is
  'ผลการแจกไข่ตอนจบ: distributed / skipped_incomplete / skipped_lose. null = ชนะผ่าน submit path เดิม -> reward_distributed_at เป็นตัวยืนยันแทน.';

-- 3. internal resolver — ปิดเกมพร้อมตัดสิน result เสมอ (ไม่ทิ้ง null)
create or replace function public.resolve_boss_raid_session(
  p_session_id uuid, p_reason text default null
) returns text
language plpgsql security definer set search_path to 'public' as $$
declare
  v_s public.boss_raid_sessions;
  v_result text;
begin
  select * into v_s from public.boss_raid_sessions where id = p_session_id for update;
  if not found then return null; end if;

  -- submit_boss_raid_answer ตัดสิน win/lose ไปแล้ว -> no-op
  if v_s.status = 'ended' and v_s.result is not null then
    return v_s.result;
  end if;

  v_result := case
    when coalesce(v_s.boss_hp, 1)    <= 0 then 'win'
    when coalesce(v_s.crystal_hp, 1) <= 0 then 'lose'
    else 'incomplete'
  end;

  update public.boss_raid_sessions
    set status       = 'ended',
        result       = v_result,
        ended_at     = coalesce(ended_at, now()),
        ended_reason = coalesce(ended_reason, p_reason)
    where id = p_session_id;

  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(p_session_id);
    update public.boss_raid_sessions set reward_resolution = 'distributed'
      where id = p_session_id and reward_resolution is null;
  else
    update public.boss_raid_sessions
      set reward_resolution = case v_result when 'lose' then 'skipped_lose'
                                            else 'skipped_incomplete' end
      where id = p_session_id and reward_resolution is null;
  end if;

  return v_result;
end $$;
revoke all on function public.resolve_boss_raid_session(uuid, text) from public, anon, authenticated;

comment on function public.resolve_boss_raid_session(uuid, text) is
  'Internal helper — ปิด raid พร้อมตัดสิน result (win/lose/incomplete) และ trigger/skip การแจกไข่. เรียกจาก end_boss_raid_session() และ close_stale_boss_raid_sessions() เท่านั้น.';

-- 4. host "End Raid" RPC (teacher-only)
create or replace function public.end_boss_raid_session(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_s public.boss_raid_sessions;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_s from public.boss_raid_sessions where id = p_session_id;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v_s.teacher_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;
  if v_s.status = 'ended' then
    return jsonb_build_object('ok', true, 'already_ended', true, 'result', v_s.result);
  end if;
  v_result := public.resolve_boss_raid_session(p_session_id, 'host_ended');
  return jsonb_build_object('ok', true, 'result', v_result);
end $$;

comment on function public.end_boss_raid_session(uuid) is
  'ครู/เจ้าของห้องกดจบ raid ระหว่างเล่นได้ทุกเมื่อ — resolve result ชัดเจน (guard เดียวกับ dismiss_boss_raid_event).';

-- 5. stale-session cron now routes through the resolver
create or replace function public.close_stale_boss_raid_sessions(p_idle_minutes integer default 120)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    with stale as (
      select s.id, greatest(
        coalesce((select max(a.answered_at) from boss_raid_answers a where a.session_id = s.id), s.started_at, s.created_at),
        coalesce((select max(p.joined_at)  from boss_raid_participants p where p.session_id = s.id), s.created_at)
      ) as last_activity
      from boss_raid_sessions s
      where s.status in ('lobby', 'in_progress')
    )
    select id from stale where last_activity < now() - make_interval(mins => p_idle_minutes)
  loop
    -- ended_at = เวลาที่ห้องหยุดจริง ไม่ใช่ตอน cron วิ่ง (resolver จะ coalesce ค่านี้ไว้)
    update public.boss_raid_sessions t set ended_at = (
      select greatest(
        coalesce((select max(a.answered_at) from boss_raid_answers a where a.session_id = t.id), t.started_at, t.created_at),
        coalesce((select max(p.joined_at)  from boss_raid_participants p where p.session_id = t.id), t.created_at))
    ) where t.id = v_id and t.ended_at is null;

    perform public.resolve_boss_raid_session(v_id, 'stale_timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 6. backfill historical result IS NULL sessions
update public.boss_raid_sessions
  set result = case
        when coalesce(boss_hp, 1)    <= 0 then 'win'
        when coalesce(crystal_hp, 1) <= 0 then 'lose'
        else 'incomplete' end,
      reward_resolution = coalesce(reward_resolution, 'skipped_incomplete')
  where status = 'ended' and result is null;
