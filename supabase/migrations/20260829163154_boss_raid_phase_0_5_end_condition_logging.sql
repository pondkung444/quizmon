
alter table public.boss_raid_sessions
  add column result text check (result in ('win', 'lose'));

comment on column public.boss_raid_sessions.result is
  'ผลจบเกม: win = ตีบอสตาย (boss_hp=0), lose = คริสตัลแตก (crystal_hp=0). null = ยังไม่จบ. เขียนผ่าน submit_boss_raid_answer เท่านั้น.';

create table public.boss_raid_tier_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.boss_raid_sessions(id) on delete cascade,
  tier text not null check (tier in ('light', 'medium', 'heavy')),
  entered_at timestamptz not null default now()
);

comment on table public.boss_raid_tier_log is
  'Append-only log การเข้าแต่ละ tier. แถวแรก = light (ตอน start_boss_raid_game). แถวถัดไป = ตอน submit_boss_raid_answer ดัน tier ขึ้น. ใช้คำนวณ "เวลาอยู่แต่ละ tier" สำหรับ simulator Phase 1.';

create index idx_boss_raid_tier_log_session on public.boss_raid_tier_log (session_id);

alter table public.boss_raid_tier_log enable row level security;

create policy "boss_raid_tier_log: member select" on public.boss_raid_tier_log
  for select using (public.is_boss_raid_member(session_id));

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

  insert into public.boss_raid_tier_log (session_id, tier) values (p_session_id, 'light');

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

create or replace function public.submit_boss_raid_answer(
  p_participant_id uuid, p_question_id bigint,
  p_question_started_at timestamptz, p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.boss_raid_participants;
  v_s public.boss_raid_sessions;
  v_config jsonb;
  v_timer int;
  v_existing public.boss_raid_answers;
  v_q public.questions;
  v_is_correct boolean;
  v_is_crit boolean := false;
  v_damage int := 0;
  v_atk numeric; v_foc numeric; v_crit_chance int;
  v_inserted public.boss_raid_answers;
  v_boss_hp int;
  v_crystal_hp int;
  v_cur_tier text;
  v_ans text := btrim(coalesce(p_answer, ''));
  v_t1 int; v_t2 int;
  v_wrong_new int;
  v_avg_def numeric;
  v_target_rank int;
  v_new_rank int;
  v_new_tier text;
  v_crystal_damage int;
  v_status text;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_existing from public.boss_raid_answers
  where participant_id = p_participant_id and question_id = p_question_id
    and question_started_at = p_question_started_at;
  if found then
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  if v_p.current_question_id is distinct from p_question_id
     or v_p.question_started_at is distinct from p_question_started_at then
    raise exception 'ข้อนี้หมดอายุแล้ว ขอข้อใหม่';
  end if;

  v_config := coalesce(v_s.config, '{}'::jsonb);
  v_timer  := coalesce((v_config->>'timer_seconds')::int, 30)
              + round(coalesce((v_p.stat_snapshot->>'spd')::numeric,0)/20)::int;

  select * into v_q from public.questions where id = p_question_id;

  if now() > p_question_started_at + make_interval(secs => v_timer) then
    v_is_correct := false;
  else
    v_is_correct := (v_ans = v_q.correct_index::text)
                    or (v_ans <> '' and v_ans = (v_q.choices ->> v_q.correct_index));
  end if;

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
  end if;

  insert into public.boss_raid_answers
    (session_id, participant_id, question_id, question_started_at, is_correct, is_crit, damage_dealt)
  values (v_p.session_id, p_participant_id, p_question_id, p_question_started_at, v_is_correct,
          case when v_is_correct then v_is_crit end,
          case when v_is_correct then v_damage end)
  on conflict (participant_id, question_id, question_started_at) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing from public.boss_raid_answers
    where participant_id = p_participant_id and question_id = p_question_id
      and question_started_at = p_question_started_at;
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  if v_is_correct and v_damage > 0 then
    update public.boss_raid_sessions set boss_hp = greatest(0, coalesce(boss_hp,0) - v_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier;

  elsif not v_is_correct then
    case v_config->>'difficulty'
      when 'easy' then v_t1 := 10; v_t2 := 20;
      when 'hard' then v_t1 := 5;  v_t2 := 10;
      else             v_t1 := 7;  v_t2 := 14;
    end case;

    update public.boss_raid_sessions
      set wrong_count_total = wrong_count_total + 1
      where id = v_p.session_id
      returning wrong_count_total, current_tier,
               coalesce((avg_stat_snapshot->>'def')::numeric, 0)
      into v_wrong_new, v_cur_tier, v_avg_def;

    v_target_rank := case when v_wrong_new >= v_t2 then 3
                          when v_wrong_new >= v_t1 then 2
                          else 1 end;
    v_new_rank := greatest(
      v_target_rank,
      case v_cur_tier when 'heavy' then 3 when 'medium' then 2 else 1 end
    );
    v_new_tier := case v_new_rank when 3 then 'heavy' when 2 then 'medium' else 'light' end;

    v_crystal_damage := round(
      v_new_rank * (100.0 / coalesce(nullif(v_avg_def, 0), 100))
    )::int;

    if v_new_tier <> v_cur_tier then
      insert into public.boss_raid_tier_log (session_id, tier) values (v_p.session_id, v_new_tier);
    end if;

    update public.boss_raid_sessions
      set current_tier = v_new_tier,
          crystal_hp   = greatest(0, coalesce(crystal_hp, 0) - v_crystal_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier
      into v_boss_hp, v_crystal_hp, v_cur_tier;

  else
    select boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier
      from public.boss_raid_sessions where id = v_p.session_id;
  end if;

  v_status := v_s.status;
  if v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  elsif v_crystal_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'lose'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null
    where id = p_participant_id;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;
