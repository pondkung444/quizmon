-- Boss Raid — meteor (ฝนดาวตก) freezes the normal question flow (2026-09-08)
--
-- Before: 'meteor' active_event only rendered a TV overlay + an unused RPC
-- (submit_boss_raid_event_answer). The student's normal question kept ticking underneath,
-- and get_next_boss_raid_question kept handing out fresh normal questions mid-meteor.
--
-- After: while a meteor is live (active_event.type = 'meteor', expires_at in the future) —
--   1) submit_boss_raid_answer returns {frozen:true} (same shape as chosen_warrior) so a
--      normal-question answer can't land during the event.
--   2) get_next_boss_raid_question returns {frozen:true} so no new normal question is issued.
--   3) at meteor trigger time we push every OTHER participant's question_started_at forward
--      by 15s (= the meteor lifetime), so their normal-question timer doesn't burn down
--      while they're on the bonus question. The triggering participant already had their
--      current_question_id / question_started_at cleared earlier in submit_boss_raid_answer,
--      so the `question_started_at is not null` guard excludes them.
--
-- chosen_warrior gives time back at RESOLUTION (variable duration, via its resolve RPC).
-- meteor has no resolve RPC (it just lapses at expires_at) and a FIXED 15s lifetime, so we
-- credit the full 15s up front instead. 15s is coupled to the `interval '15 seconds'` used
-- when the meteor active_event is created (below) and in submit_boss_raid_event_answer.
--
-- submit_boss_raid_event_answer itself is unchanged (its logic is already correct).
-- Only two lines of behaviour change vs 20260908120000 for submit_boss_raid_answer, plus
-- one new freeze branch in get_next_boss_raid_question.

create or replace function public.submit_boss_raid_answer(p_participant_id uuid, p_question_id bigint, p_question_started_at timestamp with time zone, p_answer text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_prev_tier text;
  v_crystal_damage int;
  v_status text;
  v_result text;
  v_buff_mult numeric := 1;
  v_roll numeric;
  v_band text;
  v_diff int;
  v_bonus_q public.questions;
  v_wrong_streak int := 0;
  v_cw_trigger boolean := false;
  v_streak_n int;
  v_cw_criterion text;
  v_cw_stat text;
  v_cw_chosen uuid;
  v_cw_value numeric;
  v_cw_name text;
  v_cw_q public.questions;
  v_enrage_fired boolean := false;
  v_new_milestones jsonb;
  v_event_free boolean;
  -- ✅ ใหม่ (combo_burst)
  v_combo_streak int := 0;
  v_combo_burst boolean := false;
  c_combo_n constant int := 8;
  c_combo_dmg constant int := 40;
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

  -- freeze: มี event ที่หยุดคำถามปกติทั้งห้อง — chosen_warrior (ไม่มีอายุ) หรือ meteor (ยังไม่หมดอายุ)
  if coalesce(v_s.active_event ->> 'type', '') = 'chosen_warrior'
     or (coalesce(v_s.active_event ->> 'type', '') = 'meteor'
         and (v_s.active_event ->> 'expires_at')::timestamptz > now()) then
    return jsonb_build_object('frozen', true, 'is_correct', null, 'is_crit', false,
      'damage_dealt', 0, 'boss_hp', v_s.boss_hp, 'crystal_hp', v_s.crystal_hp,
      'current_tier', v_s.current_tier, 'crystal_damage', null,
      'status', v_s.status, 'result', v_s.result);
  end if;

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

  if coalesce(v_s.active_event ->> 'type', '') in ('weak_point', 'enrage')
     and (v_s.active_event ->> 'expires_at')::timestamptz > now() then
    v_buff_mult := coalesce((v_s.active_event ->> 'multiplier')::numeric, 1);
  end if;

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
    if v_buff_mult > 1 then v_damage := round(v_damage * v_buff_mult); end if;
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

  v_prev_tier := v_s.current_tier;

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

    v_crystal_damage := v_new_rank * 5;

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

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null,
        total_damage = total_damage + v_damage
    where id = p_participant_id;

  -- ===== streak bookkeeping: wrong_streak + correct_streak + combo_burst =====
  if v_is_correct then
    update public.boss_raid_sessions
      set wrong_streak_current = 0,
          correct_streak_current = correct_streak_current + 1
      where id = v_p.session_id
      returning correct_streak_current into v_combo_streak;
    v_wrong_streak := 0;

    -- combo burst — ตอบถูกติดกันครบ N -> หักบอส +40 คงที่ + reset streak
    if v_combo_streak >= c_combo_n and v_status = 'in_progress' then
      update public.boss_raid_sessions
        set boss_hp = greatest(0, coalesce(boss_hp, 0) - c_combo_dmg),
            correct_streak_current = 0
        where id = v_p.session_id
        returning boss_hp into v_boss_hp;
      insert into public.boss_raid_event_log (session_id, event_type, bonus_damage)
        values (v_p.session_id, 'combo_burst', c_combo_dmg);
      v_combo_burst := true;

      if v_boss_hp = 0 and v_status = 'in_progress' then
        update public.boss_raid_sessions
          set status = 'ended', ended_at = now(), result = 'win'
          where id = v_p.session_id and status = 'in_progress'
          returning status, result into v_status, v_result;
      end if;
    end if;
  else
    update public.boss_raid_sessions
      set wrong_streak_current = wrong_streak_current + 1,
          correct_streak_current = 0
      where id = v_p.session_id
      returning wrong_streak_current into v_wrong_streak;
  end if;

  v_event_free := (v_s.active_event is null
                   or (v_s.active_event ->> 'expires_at')::timestamptz <= now());

  -- ===== chosen_warrior trigger (ตอบผิด) =====
  if v_status = 'in_progress' and v_event_free
     and coalesce(v_s.active_event ->> 'type', '') <> 'chosen_warrior'
     and not v_is_correct
  then
    v_streak_n := case when v_cur_tier = 'light' then coalesce(v_t1, 999) else coalesce(v_t2, 999) end;
    if (v_new_tier = 'heavy' and v_prev_tier <> 'heavy')
       or v_wrong_streak >= v_streak_n
    then
      v_cw_trigger := true;
    end if;
  end if;

  if v_cw_trigger then
    update public.boss_raid_sessions set wrong_streak_current = 0 where id = v_p.session_id;

    v_cw_criterion := case when random() < 0.5 then 'single' else 'total' end;
    if v_cw_criterion = 'single' then
      v_cw_stat := (array['atk','def','spd','foc','hp'])[floor(random() * 5) + 1];
    end if;

    with w as (
      select p.id,
        case when v_cw_criterion = 'total'
          then coalesce((p.stat_snapshot->>'hp')::numeric,0) + coalesce((p.stat_snapshot->>'atk')::numeric,0)
             + coalesce((p.stat_snapshot->>'def')::numeric,0) + coalesce((p.stat_snapshot->>'spd')::numeric,0)
             + coalesce((p.stat_snapshot->>'foc')::numeric,0)
          else coalesce((p.stat_snapshot->>v_cw_stat)::numeric, 0)
        end as weight
      from public.boss_raid_participants p
      where p.session_id = v_p.session_id
    )
    select id, weight into v_cw_chosen, v_cw_value
    from w where weight > 0
    order by power(random(), 1.0 / weight) desc
    limit 1;

    if v_cw_chosen is not null then
      v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
      select prof.grade_band into v_band
        from public.boss_raid_participants p
        join public.profiles prof on prof.id = p.user_id
        where p.id = v_cw_chosen;
      v_band := coalesce(v_band, 'junior');

      select q.* into v_cw_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;

      if found then
        select coalesce(pt.nickname, 'Qmon ของ ' || prof.username) into v_cw_name
          from public.boss_raid_participants p
          join public.pets pt on pt.id = p.pet_id
          join public.profiles prof on prof.id = p.user_id
          where p.id = v_cw_chosen;

        update public.boss_raid_sessions
          set active_event = jsonb_build_object(
            'type', 'chosen_warrior',
            'started_at', now()::text,
            'chosen_participant_id', v_cw_chosen::text,
            'chosen_name', coalesce(v_cw_name, 'ผู้เล่น'),
            'criterion', v_cw_criterion,
            'stat_key', case when v_cw_criterion = 'single' then v_cw_stat else null end,
            'stat_value', round(v_cw_value)::int,
            'question_id', v_cw_q.id,
            'question_text', v_cw_q.question_text,
            'choices', v_cw_q.choices
          )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());

        if found then
          update public.boss_raid_participants
            set current_question_id = v_cw_q.id, question_started_at = now()
            where id = v_cw_chosen;
          insert into public.boss_raid_event_log (session_id, event_type, participant_id)
            values (v_p.session_id, 'chosen_warrior', v_cw_chosen);
        end if;
      end if;
    end if;
  end if;

  -- ===== enrage trigger (ตอบถูก + บอสเสียเลือดผ่าน milestone 75/50/25) =====
  if not v_cw_trigger and v_is_correct and v_damage > 0 and v_status = 'in_progress'
     and coalesce(jsonb_array_length(v_s.enrage_milestones_fired), 0) < 3
  then
    select coalesce(jsonb_agg(x.m order by x.m desc), '[]'::jsonb) into v_new_milestones
    from (select unnest(array[75, 50, 25]) as m) x
    where v_boss_hp <= floor(x.m / 100.0 * coalesce(nullif(v_s.boss_hp_max, 0), v_boss_hp))
      and not (v_s.enrage_milestones_fired @> to_jsonb(x.m));

    if jsonb_array_length(v_new_milestones) > 0 then
      if v_event_free then
        update public.boss_raid_sessions
          set enrage_milestones_fired = enrage_milestones_fired || v_new_milestones,
              active_event = jsonb_build_object(
                'type', 'enrage',
                'expires_at', (now() + interval '15 seconds')::text,
                'multiplier', 2.5
              )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
        if found then
          insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'enrage');
          v_enrage_fired := true;
        else
          update public.boss_raid_sessions
            set enrage_milestones_fired = enrage_milestones_fired || v_new_milestones
            where id = v_p.session_id;
        end if;
      else
        update public.boss_raid_sessions
          set enrage_milestones_fired = enrage_milestones_fired || v_new_milestones
          where id = v_p.session_id;
      end if;
    end if;
  end if;

  -- ===== weak_point / meteor roll (สุ่ม) — ข้ามถ้ามี event เพิ่ง trigger =====
  if not v_cw_trigger and not v_enrage_fired and v_status = 'in_progress' and v_event_free then
    v_roll := random();
    if v_roll < 0.02 then
      update public.boss_raid_sessions
        set active_event = jsonb_build_object(
          'type', 'weak_point', 'expires_at', (now() + interval '20 seconds')::text, 'multiplier', 2
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
          -- freeze คำถามปกติทั้งห้อง 15 วิ (= อายุ meteor): ดัน question_started_at ไปข้างหน้าเท่าช่วง freeze
          -- คืนเวลาที่เหลือ — ผู้เล่นที่ trigger ถูกเคลียร์ current_question_id ไปแล้ว จึงไม่โดน push
          update public.boss_raid_participants
            set question_started_at = question_started_at + interval '15 seconds'
            where session_id = v_p.session_id
              and current_question_id is not null
              and question_started_at is not null;
        end if;
      end if;
    end if;
  end if;

  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage, 'combo_burst', v_combo_burst,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$function$;


create or replace function public.get_next_boss_raid_question(p_participant_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_p public.boss_raid_participants;
  v_s public.boss_raid_sessions;
  v_config jsonb;
  v_band text;
  v_diff int;
  v_timer int;
  v_q public.questions;
  v_started timestamptz;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมยังไม่เริ่มหรือจบแล้ว'; end if;

  -- ✅ Phase 2: chosen_warrior กำลังทำงาน
  if coalesce(v_s.active_event ->> 'type', '') = 'chosen_warrior' then
    if (v_s.active_event ->> 'chosen_participant_id') = p_participant_id::text then
      -- คนที่ถูกเลือก — คืนข้อพิเศษ (ไม่มี deadline; client ตอบผ่าน submit_chosen_warrior_answer)
      return jsonb_build_object(
        'chosen_warrior', true,
        'question_id', (v_s.active_event ->> 'question_id')::bigint,
        'question_text', v_s.active_event ->> 'question_text',
        'choices', v_s.active_event -> 'choices',
        'image_url', null,
        'criterion', v_s.active_event ->> 'criterion',
        'stat_key', v_s.active_event ->> 'stat_key',
        'stat_value', (v_s.active_event ->> 'stat_value')::int
      );
    end if;
    -- คนอื่น — freeze
    return jsonb_build_object('frozen', true);
  end if;

  -- ✅ meteor (ฝนดาวตก) กำลังทำงาน — freeze การออกข้อปกติทั้งห้อง
  -- (คำถามโบนัสมาจาก active_event เอง ฝั่ง client เรียก submit_boss_raid_event_answer)
  if coalesce(v_s.active_event ->> 'type', '') = 'meteor'
     and (v_s.active_event ->> 'expires_at')::timestamptz > now() then
    return jsonb_build_object('frozen', true);
  end if;

  v_config := coalesce(v_s.config, '{}'::jsonb);
  v_timer  := coalesce((v_config->>'timer_seconds')::int, 30)
              + round(coalesce((v_p.stat_snapshot->>'spd')::numeric, 0) / 20)::int;

  if v_p.current_question_id is not null
     and v_p.question_started_at is not null
     and now() < v_p.question_started_at + make_interval(secs => v_timer) then
    select * into v_q from public.questions where id = v_p.current_question_id;
    v_started := v_p.question_started_at;
  else
    v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
    select grade_band into v_band from public.profiles where id = v_uid;
    v_band := coalesce(v_band, 'junior');

    select q.* into v_q
    from public.questions q
    join public.curriculum_chapters cc
      on cc.subject = q.subject and cc.chapter = q.chapter
     and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
    where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
      and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      and q.id not in (select question_id from public.boss_raid_answers where participant_id = p_participant_id)
    order by random() limit 1;

    if not found then
      select q.* into v_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;
    end if;

    if not found then raise exception 'ไม่มีคำถามที่ตรงกับบท/ระดับที่ตั้งไว้'; end if;

    v_started := now();
    update public.boss_raid_participants
      set current_question_id = v_q.id, question_started_at = v_started
      where id = p_participant_id;
  end if;

  return jsonb_build_object(
    'question_id', v_q.id,
    'question_text', v_q.question_text,
    'choices', v_q.choices,
    'image_url', v_q.image_url,
    'question_started_at', v_started,
    'deadline', v_started + make_interval(secs => v_timer),
    'personal_timer_seconds', v_timer
  );
end;
$function$;
