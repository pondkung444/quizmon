-- Migration: 20260902180000_boss_raid_phase_1_rewards
-- Classroom Boss Raid — Phase 1 สไลซ์ 1.2: เลือกไข่รางวัล + แจก Top-N อัตโนมัติเมื่อชนะบอส
-- อ้างอิง: task brief (boss-raid-reward-eggs) — เคาะกับปอนด์แล้ว
--
-- กติกา:
--   * แจกเฉพาะ "ชนะบอส" (result = 'win', boss_hp = 0) — แพ้ (คริสตัลแตก) ไม่ได้อะไร
--   * ครูตั้งค่าตอนสร้าง/ตั้งค่าห้อง: reuse config jsonb เดิม เพิ่ม 2 key
--       reward_egg_type_id (text -> egg_types.id เชิงตรรกะ), reward_top_n (int)
--   * ชนิดไข่เลือกจาก dropdown dynamic ฝั่ง UI: tier in ('common','rare','epic') and is_obtainable
--     — ห้าม hardcode egg id, ห้าม legendary (สงวนให้ claim_weekly_leaderboard_reward เท่านั้น)
--   * จัดอันดับ total_damage DESC, joined_at ASC (tie-break เดียวกับ TV top-5) นับเฉพาะ total_damage > 0
--     — ถ้าคนที่ยิงโดนน้อยกว่า N แจกเท่าที่มี ไม่เติมคน damage=0
--   * ทุกคนใน N อันดับได้ไข่ชนิดเดียวกัน ไม่มี MVP พิเศษ
--   * แจกอัตโนมัติทันทีที่บอสตาย (ใน transaction เดียวกับ win-transition) — ไม่มีปุ่มเคลม
--
-- Survey:
--   * player_eggs.source ไม่มี CHECK constraint (เป็นแค่ text not null) — เพิ่มค่า 'boss_raid_reward'
--     ได้เลย ไม่ต้อง ALTER (pattern เดียวกับ weekly_leaderboard_reward / raid_reward / dungeon_claim)
--   * win-transition (status='ended', result='win') เกิด 2 จุด: submit_boss_raid_answer (correct-damage)
--     และ submit_boss_raid_event_answer (โบนัสฝนดาวตก) — hook distribution เข้าทั้งคู่
--   * กันแจกซ้ำ: boss_raid_sessions.reward_distributed_at + atomic claim
--     UPDATE ... WHERE reward_distributed_at IS NULL

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) Schema
-- ============================================================
alter table public.boss_raid_sessions
  add column reward_distributed_at timestamptz;

comment on column public.boss_raid_sessions.reward_distributed_at is
  'เวลาที่ระบบแจกไข่รางวัล Top-N สำเร็จ (null = ยังไม่แจก / ไม่ชนะ / ครูไม่ได้ตั้งรางวัล). '
  'atomic guard กันแจกซ้ำใน distribute_boss_raid_rewards().';

comment on column public.player_eggs.source is
  'ที่มาของไข่ — ค่าที่ใช้ตอนนี้: starter (ไข่ใบแรกตอนสมัคร), collection_choice (ผู้เล่นเลือกเองทุกครั้งหลังเก็บสัตว์เข้าสมุด), '
  'weekly_leaderboard_reward, raid_reward, dungeon_claim, boss_raid_reward (Top-N ตอนชนะ Classroom Boss Raid). '
  'ค่าเก่าที่เลิกใช้แล้วแต่ยังพบในข้อมูลเดิม: first_pet_reward. ใช้ text ตั้งใจ (เพิ่ม source ใหม่ไม่ต้อง ALTER)';

create table public.boss_raid_rewards (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.boss_raid_sessions(id) on delete cascade,
  participant_id uuid not null references public.boss_raid_participants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  egg_type_id    text not null references public.egg_types(id),
  player_egg_id  uuid references public.player_eggs(id) on delete set null,
  rank           int  not null,
  total_damage   int  not null,
  awarded_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);

comment on table public.boss_raid_rewards is
  'Log การแจกไข่รางวัล Top-N เมื่อห้องชนะบอส — 1 แถวต่อผู้เล่นที่ได้รางวัล. '
  'เขียนผ่าน distribute_boss_raid_rewards() (security definer) เท่านั้น, client ห้าม insert/update ตรง.';

create index idx_boss_raid_rewards_session on public.boss_raid_rewards (session_id);
create index idx_boss_raid_rewards_participant on public.boss_raid_rewards (participant_id);
create index idx_boss_raid_rewards_user on public.boss_raid_rewards (user_id);

alter table public.boss_raid_rewards enable row level security;

-- select: pattern เดียวกับ boss_raid_participants/tier_log — เห็นเฉพาะห้องที่ตัวเองอยู่ (ครู/participant)
create policy "boss_raid_rewards: member select" on public.boss_raid_rewards
  for select using (public.is_boss_raid_member(session_id));

-- ตั้งใจไม่มี write policy: insert ผ่าน RPC security definer เท่านั้น

-- realtime: จอนักเรียน/TV subscribe เห็นแถวรางวัลโผล่ทันตอนจบ (pattern เดียวกับ boss_raid_answers)
alter publication supabase_realtime add table public.boss_raid_rewards;
alter table public.boss_raid_rewards replica identity full;

-- ============================================================
-- 2) distribute_boss_raid_rewards — แจกไข่ Top-N (เรียกจาก win-transition เท่านั้น)
--    idempotent: atomic claim ผ่าน reward_distributed_at IS NULL
-- ============================================================
create or replace function public.distribute_boss_raid_rewards(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_config jsonb;
  v_egg_type_id text;
  v_top_n int;
  v_row record;
  v_player_egg_id uuid;
begin
  -- atomic claim — คืน config เฉพาะครั้งแรกที่ชนะและยังไม่แจก
  update public.boss_raid_sessions
    set reward_distributed_at = now()
    where id = p_session_id
      and result = 'win'
      and reward_distributed_at is null
    returning config into v_config;

  if not found then
    return;  -- แจกไปแล้ว / ยังไม่ชนะ / ไม่พบห้อง
  end if;

  v_egg_type_id := v_config ->> 'reward_egg_type_id';
  v_top_n       := nullif(v_config ->> 'reward_top_n', '')::int;

  if v_egg_type_id is null or v_top_n is null or v_top_n <= 0 then
    return;  -- ครูไม่ได้ตั้งรางวัล
  end if;

  -- defense-in-depth: ไข่ต้องยัง obtainable + tier ที่อนุญาต (กัน legendary / id มั่ว / ไข่ถูกปิดภายหลัง)
  if not exists (
    select 1 from public.egg_types
    where id = v_egg_type_id
      and tier in ('common', 'rare', 'epic')
      and is_obtainable = true
  ) then
    return;
  end if;

  for v_row in
    select p.id as participant_id, p.user_id, p.total_damage,
           row_number() over (order by p.total_damage desc, p.joined_at asc) as rnk
    from public.boss_raid_participants p
    where p.session_id = p_session_id
      and p.total_damage > 0
    order by p.total_damage desc, p.joined_at asc
    limit v_top_n
  loop
    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_row.user_id, v_egg_type_id, 'boss_raid_reward')
    returning id into v_player_egg_id;

    insert into public.boss_raid_rewards
      (session_id, participant_id, user_id, egg_type_id, player_egg_id, rank, total_damage)
    values
      (p_session_id, v_row.participant_id, v_row.user_id, v_egg_type_id, v_player_egg_id,
       v_row.rnk::int, v_row.total_damage)
    on conflict (session_id, participant_id) do nothing;
  end loop;
end;
$$;

comment on function public.distribute_boss_raid_rewards(uuid) is
  'แจกไข่รางวัล Top-N เมื่อห้องชนะบอส. idempotent (atomic claim ผ่าน reward_distributed_at). '
  'เรียกจาก submit_boss_raid_answer / submit_boss_raid_event_answer หลัง set result=win เท่านั้น — ไม่ grant ให้ client.';

-- ============================================================
-- 3) get_boss_raid_rewards — จอ TV / มือถือ อ่านผลรางวัลตอนจบ
-- ============================================================
create or replace function public.get_boss_raid_rewards(p_session_id uuid)
returns table (
  participant_id uuid,
  rank int,
  total_damage int,
  egg_type_id text,
  egg_name_th text,
  sprite_prefix text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_boss_raid_member(p_session_id) then
    raise exception 'ไม่มีสิทธิ์';
  end if;

  return query
    select r.participant_id, r.rank, r.total_damage, r.egg_type_id, e.name_th, e.sprite_prefix
    from public.boss_raid_rewards r
    join public.egg_types e on e.id = r.egg_type_id
    where r.session_id = p_session_id
    order by r.rank asc;
end;
$$;

grant execute on function public.get_boss_raid_rewards(uuid) to authenticated;

-- ============================================================
-- 4) submit_boss_raid_answer — hook distribution หลัง win-transition
--    body = สำเนาจาก 20260831130000_boss_raid_participant_total_damage.sql เป๊ะ
--    เพิ่มเฉพาะ: perform distribute_boss_raid_rewards(...) ก่อน return สุดท้าย เมื่อ v_result = 'win'
-- ============================================================
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
  v_base_t1 int; v_base_t2 int;
  v_n int;
  v_wrong_new int;
  v_avg_def numeric;
  v_target_rank int;
  v_new_rank int;
  v_new_tier text;
  v_crystal_damage int;
  v_status text;
  v_result text;
  v_weak_point_active boolean := false;
  v_roll numeric;
  v_band text;
  v_diff int;
  v_bonus_q public.questions;
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

  v_weak_point_active := (
    v_s.active_event ->> 'type' = 'weak_point'
    and (v_s.active_event ->> 'expires_at')::timestamptz > now()
  );

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
    if v_weak_point_active then v_damage := v_damage * 2; end if;
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
      when 'easy' then v_base_t1 := 10; v_base_t2 := 20;
      when 'hard' then v_base_t1 := 5;  v_base_t2 := 10;
      else             v_base_t1 := 7;  v_base_t2 := 14;
    end case;

    v_n  := greatest(coalesce(v_s.participant_count_at_start, 15), 1);
    v_t1 := greatest(1, round(v_base_t1 * v_n / 15.0)::int);
    v_t2 := greatest(v_t1 + 1, round(v_base_t2 * v_n / 15.0)::int);

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
  if v_is_correct and v_damage > 0 and v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  elsif (not v_is_correct) and v_crystal_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'lose'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  -- 1.1-UI-a: สะสม total_damage (v_damage = 0 เองตอนตอบผิด/timeout) — จุดเดียว, run ทุก path
  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null,
        total_damage = total_damage + v_damage
    where id = p_participant_id;

  if v_status = 'in_progress' and (
    v_s.active_event is null
    or (v_s.active_event ->> 'expires_at')::timestamptz <= now()
  ) then
    v_roll := random();
    if v_roll < 0.02 then
      update public.boss_raid_sessions
        set active_event = jsonb_build_object(
          'type', 'weak_point', 'expires_at', (now() + interval '20 seconds')::text
        )
        where id = v_p.session_id
          and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
      if found then
        insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'weak_point');
      end if;

    elsif v_roll < 0.04 then
      v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
      select grade_band into v_band from public.profiles where id = v_uid;
      v_band := coalesce(v_band, 'junior');

      select q.* into v_bonus_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;

      if found then
        update public.boss_raid_sessions
          set active_event = jsonb_build_object(
            'type', 'meteor',
            'question_id', v_bonus_q.id,
            'question_text', v_bonus_q.question_text,
            'choices', v_bonus_q.choices,
            'expires_at', (now() + interval '15 seconds')::text,
            'winner_participant_id', null
          )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
        if found then
          insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'meteor');
        end if;
      end if;
    end if;
  end if;

  -- ✅ 1.2: แจกไข่รางวัล Top-N ทันทีที่ห้องชนะ (idempotent — atomic guard ในฟังก์ชัน)
  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

-- ============================================================
-- 5) submit_boss_raid_event_answer — hook distribution หลัง win-transition
--    body = สำเนาจาก 20260831120000_boss_raid_phase_1_events.sql เป๊ะ
--    เพิ่มเฉพาะ: perform distribute_boss_raid_rewards(...) ก่อน return สุดท้าย เมื่อ v_result = 'win'
-- ============================================================
create or replace function public.submit_boss_raid_event_answer(
  p_participant_id uuid, p_answer text
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
  v_ans text := btrim(coalesce(p_answer, ''));
  v_is_correct boolean;
  v_correct_index int;
  v_question_id bigint;
  v_trig_at timestamptz;
  v_attempt_id uuid;
  c_bonus_damage constant int := 15;
  v_boss_hp int;
  v_status text;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  if coalesce(v_s.active_event ->> 'type', '') <> 'meteor'
     or (v_s.active_event ->> 'expires_at')::timestamptz <= now() then
    return jsonb_build_object('event_active', false);
  end if;

  select max(triggered_at) into v_trig_at
    from public.boss_raid_event_log
    where session_id = v_p.session_id and event_type = 'meteor';
  v_trig_at := coalesce(v_trig_at,
                        (v_s.active_event ->> 'expires_at')::timestamptz - interval '15 seconds');

  insert into public.boss_raid_event_log (session_id, event_type, participant_id, triggered_at)
  values (v_p.session_id, 'meteor_attempt', p_participant_id, v_trig_at)
  on conflict do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    return jsonb_build_object('event_active', true, 'already_answered', true,
      'is_correct', null, 'won', false);
  end if;

  v_question_id := (v_s.active_event ->> 'question_id')::bigint;
  select correct_index into v_correct_index from public.questions where id = v_question_id;
  v_is_correct := (v_ans <> '' and v_ans = v_correct_index::text);

  if not v_is_correct then
    return jsonb_build_object('event_active', true, 'is_correct', false, 'won', false);
  end if;

  update public.boss_raid_sessions
    set active_event = active_event || jsonb_build_object('winner_participant_id', p_participant_id::text),
        boss_hp = greatest(0, coalesce(boss_hp, 0) - c_bonus_damage)
    where id = v_p.session_id
      and active_event ->> 'type' = 'meteor'
      and active_event ->> 'winner_participant_id' is null
      and (active_event ->> 'expires_at')::timestamptz > now()
    returning boss_hp, status, result into v_boss_hp, v_status, v_result;

  if not found then
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('event_active', true, 'is_correct', true, 'won', false, 'boss_hp', v_boss_hp);
  end if;

  update public.boss_raid_event_log
    set winner_participant_id = p_participant_id, bonus_damage = c_bonus_damage
    where session_id = v_p.session_id and event_type = 'meteor'
      and triggered_at = v_trig_at;

  if v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  -- ✅ 1.2: แจกไข่รางวัล Top-N ทันทีที่ห้องชนะ (idempotent — atomic guard ในฟังก์ชัน)
  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object('event_active', true, 'is_correct', true, 'won', true,
    'bonus_damage', c_bonus_damage, 'boss_hp', v_boss_hp,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_event_answer(uuid, text) to authenticated;

commit;

-- ============================================================
-- Rollback:
-- ============================================================
-- begin;
-- drop function if exists public.get_boss_raid_rewards(uuid);
-- -- re-apply submit_boss_raid_answer จาก 20260831130000_boss_raid_participant_total_damage.sql
-- -- re-apply submit_boss_raid_event_answer จาก 20260831120000_boss_raid_phase_1_events.sql
-- drop function if exists public.distribute_boss_raid_rewards(uuid);
-- alter publication supabase_realtime drop table public.boss_raid_rewards;
-- drop table if exists public.boss_raid_rewards;
-- alter table public.boss_raid_sessions drop column if exists reward_distributed_at;
-- commit;
