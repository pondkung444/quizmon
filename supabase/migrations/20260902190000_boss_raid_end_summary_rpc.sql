-- Migration: 20260902190000_boss_raid_end_summary_rpc
-- Classroom Boss Raid — Phase 1 สไลซ์ 1.3: หน้าสรุปผลท้ายเกม (TV + มือถือ)
-- อ้างอิง: task brief (boss-raid end summary) — ข้อมูลครบใน DB แล้ว ไม่มี schema change
--
-- RPC เดียว get_boss_raid_summary(session_id) — member-gated เหมือน get_boss_raid_rewards.
-- คืน jsonb { status, result, team{...}, ranking[...] } — TV เอา ranking[0..5] + team,
-- มือถือ filter หาแถวของตัวเองจาก ranking + team (ไม่ต้องแยก RPC 2 ตัว)
--
-- ranking = เต็มห้อง เรียง total_damage DESC, joined_at ASC (tie-break เดียวกับ reward distribution
-- / TV top-5). correct/wrong นับจาก boss_raid_answers (timeout ก็เป็นแถว is_correct=false).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_boss_raid_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_s public.boss_raid_sessions;
  v_team jsonb;
  v_ranking jsonb;
begin
  if not public.is_boss_raid_member(p_session_id) then
    raise exception 'ไม่มีสิทธิ์';
  end if;

  select * into v_s from public.boss_raid_sessions where id = p_session_id;
  if not found then
    raise exception 'ไม่พบห้องนี้';
  end if;

  -- ===== team =====
  select jsonb_build_object(
    'duration_seconds',
      case
        when v_s.started_at is not null and v_s.ended_at is not null
          then round(extract(epoch from (v_s.ended_at - v_s.started_at)))::int
      end,
    'total_answers',   count(*),
    'total_correct',   count(*) filter (where a.is_correct),
    'accuracy_pct',
      case when count(*) > 0
        then round(count(*) filter (where a.is_correct) * 100.0 / count(*))::int
        else 0 end,
    'wrong_count_total', coalesce(v_s.wrong_count_total, 0),
    'total_damage_dealt',
      coalesce(sum(a.damage_dealt) filter (where a.is_correct), 0)::int
  )
  into v_team
  from public.boss_raid_answers a
  where a.session_id = p_session_id;

  -- ===== ranking เต็มห้อง =====
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'participant_id', x.participant_id,
        'user_id',        x.user_id,
        'total_damage',   x.total_damage,
        'correct_count',  x.correct_count,
        'wrong_count',    x.wrong_count,
        'accuracy_pct',   x.accuracy_pct,
        'rank',           x.rnk
      )
      order by x.rnk
    ),
    '[]'::jsonb
  )
  into v_ranking
  from (
    select
      p.id                                            as participant_id,
      p.user_id                                       as user_id,
      p.total_damage                                  as total_damage,
      count(*) filter (where a.is_correct)            as correct_count,
      count(*) filter (where a.is_correct = false)    as wrong_count,
      case when count(a.id) > 0
        then round(count(*) filter (where a.is_correct) * 100.0 / count(a.id))::int
        else 0 end                                    as accuracy_pct,
      row_number() over (order by p.total_damage desc, p.joined_at asc) as rnk
    from public.boss_raid_participants p
    left join public.boss_raid_answers a on a.participant_id = p.id
    where p.session_id = p_session_id
    group by p.id, p.user_id, p.total_damage, p.joined_at
  ) x;

  return jsonb_build_object(
    'status',  v_s.status,
    'result',  v_s.result,
    'team',    v_team,
    'ranking', v_ranking
  );
end;
$$;

grant execute on function public.get_boss_raid_summary(uuid) to authenticated;

comment on function public.get_boss_raid_summary(uuid) is
  'สรุปผลท้ายเกม Boss Raid — team stats + ranking เต็มห้อง (jsonb). member-gated. '
  'ใช้ทั้งจอ TV (top-5 + team) และมือถือ (แถวของตัวเอง + team). ไม่มี schema change.';

commit;

-- ============================================================
-- Rollback:
--   drop function if exists public.get_boss_raid_summary(uuid);
-- ============================================================
