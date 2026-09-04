-- ตัด raid_allowlist gate ออกจาก RPC functions ทั้งหมด 7 ตัว (เปิดให้นักเรียนทุกคนเข้าระบบท้าทายได้)
-- ต่อเนื่องจากที่ตัด gate ออกจากฝั่ง Next.js app code แล้ว (isRaidAllowlisted / requireRaidAccess /
-- getRaidEntryState) แต่ยังเหลือ gate ซ้ำอยู่ที่ชั้น DB/RPC ทำให้แม้ปุ่ม "ท้าทาย" จะแสดงแล้ว
-- แต่นักเรียนที่ไม่เคยอยู่ใน raid_allowlist (เข้าระบบหลัง 10 ส.ค. 2026) ยังกดใช้งานจริงไม่ได้
-- (เจอครั้งแรกจากเคส user "ซันซัน" — RPC start_raid_run โยน exception 'ยังไม่เปิดให้เข้าระบบนี้'
-- ทำให้ Next.js Server Action ล้มเหลว แสดงเป็น generic digest error หน้าเว็บ)
--
-- ⚠️ APPLIED TO PRODUCTION ALREADY (2026-09-04) ผ่าน Supabase MCP โดยตรง — ไฟล์นี้แค่ commit
-- เข้า repo ให้ตรงกับ production เท่านั้น ไม่ต้อง apply ซ้ำถ้า schema ตรงกันแล้ว
--
-- gate เดิมถูกเพิ่มจาก migration 20260807021252_raid_rpcs_add_allowlist_guard
-- delete_own_account ไม่แตะ — แค่ลบแถว raid_allowlist ตอนลบบัญชี ไม่ใช่ gate check ห้ามสับสน

CREATE OR REPLACE FUNCTION public.start_raid_run(p_pet_id uuid, p_raid_type_id uuid)
 RETURNS raid_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_pet record;
  v_raid_type record;
  v_prev_type_id uuid;
  v_ticket_id uuid;
  v_run public.raid_runs;
  v_caps jsonb;
  v_gear_bonus jsonb;
  v_stat_snapshot jsonb;
  v_gauge_max int := 0;
  v_step_obstacle_a uuid[] := array[]::uuid[];
  v_step_obstacle_b uuid[] := array[]::uuid[];
  v_step_color_a text[] := array[]::text[];
  v_step_color_b text[] := array[]::text[];
  v_pair_ids uuid[];
  v_pair_stats text[];
  v_stat_a text;
  v_stat_b text;
  v_pass_a numeric;
  v_pass_b numeric;
  v_color_a text;
  v_color_b text;
  v_weight_a int;
  v_weight_b int;
  i int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select id, stage, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, egg_type_id
    into v_pet
  from public.pets
  where id = p_pet_id and user_id = v_user_id and stage = 4 and is_active = false;

  if not found then
    raise exception 'Qmon ตัวนี้ยังไม่พร้อมท้าทาย (ต้องโตเต็มที่และเก็บเข้าสมุดแล้ว)';
  end if;

  if exists (select 1 from public.raid_runs where user_id = v_user_id and status = 'in_progress') then
    raise exception 'มีการท้าทายที่ยังไม่จบอยู่ ทำให้จบก่อนเริ่มรอบใหม่';
  end if;

  select id, obstacle_count, boss_threshold_pct, zone_id, sort_order
    into v_raid_type
  from public.raid_types
  where id = p_raid_type_id and is_active = true;

  if not found then
    raise exception 'ไม่พบด่านนี้ หรือด่านปิดใช้งานอยู่';
  end if;

  -- เช็คลำดับด่านฝั่ง server (เพิ่ม 11 ส.ค. 2026, แก้ให้เช็ค outcome='win' เพิ่มวันเดียวกัน) —
  -- เดิมมีแค่ UI ซ่อนปุ่ม ไม่ enforce จริง ต้องผ่าน (ชนะ) ด่านก่อนหน้าจริงๆ ไม่ใช่แค่เล่นจบ (แพ้ก็นับ
  -- เป็น completed เหมือนกัน) ให้ตรงกับเงื่อนไข unlocked ฝั่ง frontend (getRaidZonesWithLevels)
  select id into v_prev_type_id
  from public.raid_types
  where zone_id = v_raid_type.zone_id
    and sort_order = v_raid_type.sort_order - 1
    and is_active = true;

  if v_prev_type_id is not null then
    if not exists (
      select 1 from public.raid_runs
      where user_id = v_user_id and raid_type_id = v_prev_type_id and status = 'completed' and outcome = 'win'
    ) then
      raise exception 'ต้องผ่านด่านก่อนหน้าก่อนถึงจะท้าทายด่านนี้ได้';
    end if;
  end if;

  select id into v_ticket_id
  from public.raid_tickets
  where user_id = v_user_id and consumed_at is null and zone_id = v_raid_type.zone_id
  order by granted_at asc
  limit 1
  for update;

  if v_ticket_id is null then
    raise exception 'ไม่มีกุญแจท้าทายของโซนนี้เหลืออยู่';
  end if;

  select stat_profile->'caps' into v_caps
  from public.egg_types
  where id = v_pet.egg_type_id;

  if v_caps is null then
    raise exception 'ไม่พบข้อมูล cap ของไข่นี้';
  end if;

  select jsonb_build_object(
    'hp', coalesce(sum(case when main_stat = 'hp' then main_value when sub_stat = 'hp' then sub_value else 0 end), 0),
    'atk', coalesce(sum(case when main_stat = 'atk' then main_value when sub_stat = 'atk' then sub_value else 0 end), 0),
    'def', coalesce(sum(case when main_stat = 'def' then main_value when sub_stat = 'def' then sub_value else 0 end), 0),
    'spd', coalesce(sum(case when main_stat = 'spd' then main_value when sub_stat = 'spd' then sub_value else 0 end), 0)
  ) into v_gear_bonus
  from public.raid_gear_items
  where equipped_pet_id = p_pet_id;

  v_stat_snapshot := jsonb_build_object(
    'hp', least(coalesce(v_pet.stat_hp, 0) + coalesce((v_gear_bonus->>'hp')::int, 0), (v_caps->>'hp')::int),
    'atk', least(coalesce(v_pet.stat_atk, 0) + coalesce((v_gear_bonus->>'atk')::int, 0), (v_caps->>'atk')::int),
    'def', least(coalesce(v_pet.stat_def, 0) + coalesce((v_gear_bonus->>'def')::int, 0), (v_caps->>'def')::int),
    'spd', least(coalesce(v_pet.stat_spd, 0) + coalesce((v_gear_bonus->>'spd')::int, 0), (v_caps->>'spd')::int),
    'foc', least(coalesce(v_pet.stat_foc, 0), (v_caps->>'foc')::int)
  );

  for i in 0 .. v_raid_type.obstacle_count - 1 loop
    select array_agg(id order by rnd), array_agg(stat order by rnd)
      into v_pair_ids, v_pair_stats
    from (
      select id, stat, random() as rnd
      from public.raid_obstacles
      where is_active = true and zone_id = v_raid_type.zone_id
      order by random() limit 2
    ) t;

    if v_pair_ids is null or array_length(v_pair_ids, 1) < 2 then
      raise exception 'ยังไม่มีอุปสรรคพอสำหรับโซนนี้';
    end if;

    v_stat_a := v_pair_stats[1];
    v_stat_b := v_pair_stats[2];

    -- สูตรเดียวกับ choose_raid_path(): P(ผ่าน) = stat_snapshot[stat] ÷ caps_snapshot[stat]
    v_pass_a := case when (v_caps->>v_stat_a)::numeric > 0
      then (v_stat_snapshot->>v_stat_a)::numeric / (v_caps->>v_stat_a)::numeric else 0 end;
    v_pass_b := case when (v_caps->>v_stat_b)::numeric > 0
      then (v_stat_snapshot->>v_stat_b)::numeric / (v_caps->>v_stat_b)::numeric else 0 end;

    v_color_a := case when v_pass_a >= 0.6 then 'green' when v_pass_a >= 0.35 then 'yellow' else 'red' end;
    v_color_b := case when v_pass_b >= 0.6 then 'green' when v_pass_b >= 0.35 then 'yellow' else 'red' end;

    v_step_obstacle_a := v_step_obstacle_a || v_pair_ids[1];
    v_step_obstacle_b := v_step_obstacle_b || v_pair_ids[2];
    v_step_color_a := v_step_color_a || v_color_a;
    v_step_color_b := v_step_color_b || v_color_b;

    v_weight_a := case v_color_a when 'green' then 0 when 'yellow' then 1 else 2 end;
    v_weight_b := case v_color_b when 'green' then 0 when 'yellow' then 1 else 2 end;
    v_gauge_max := v_gauge_max + greatest(v_weight_a, v_weight_b);
  end loop;

  if v_gauge_max = 0 then
    v_gauge_max := 1;
  end if;

  insert into public.raid_runs (
    user_id, pet_id, raid_type_id, ticket_id, stat_snapshot, caps_snapshot,
    threshold_pct, gauge_max
  ) values (
    v_user_id, p_pet_id, p_raid_type_id, v_ticket_id, v_stat_snapshot, v_caps,
    v_raid_type.boss_threshold_pct, v_gauge_max
  )
  returning * into v_run;

  for i in 0 .. v_raid_type.obstacle_count - 1 loop
    insert into public.raid_run_steps (
      run_id, step_index, option_a_obstacle_id, option_a_color, option_b_obstacle_id, option_b_color
    ) values (
      v_run.id, i, v_step_obstacle_a[i + 1], v_step_color_a[i + 1], v_step_obstacle_b[i + 1], v_step_color_b[i + 1]
    );
  end loop;

  update public.raid_tickets
  set consumed_at = now(), consumed_run_id = v_run.id
  where id = v_ticket_id;

  return v_run;
end;
$function$;

CREATE OR REPLACE FUNCTION public.choose_raid_path(p_run_id uuid, p_side text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_step public.raid_run_steps;
  v_obstacle public.raid_obstacles;
  v_weight int;
  v_stat_value numeric;
  v_cap_value numeric;
  v_threshold numeric;
  v_roll numeric;
  v_passed boolean;
  v_result jsonb;
  v_question record;
  v_weak_category text;
  v_weak_count int;
  v_band text;
  v_obstacle_count int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if p_side not in ('a', 'b') then
    raise exception 'ค่าตัวเลือกไม่ถูกต้อง';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'choosing' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงเลือกทาง';
  end if;

  select * into v_step
  from public.raid_run_steps
  where run_id = p_run_id and step_index = v_run.current_step_index
  for update;

  if not found then
    raise exception 'ไม่พบจุดทางแยกนี้';
  end if;

  if v_step.chosen_side is not null then
    raise exception 'เลือกทางนี้ไปแล้ว';
  end if;

  select * into v_obstacle
  from public.raid_obstacles
  where id = (case p_side when 'a' then v_step.option_a_obstacle_id else v_step.option_b_obstacle_id end);

  v_weight := case (case p_side when 'a' then v_step.option_a_color else v_step.option_b_color end)
    when 'green' then 0 when 'yellow' then 1 else 2 end;

  update public.raid_run_steps
  set chosen_side = p_side, chosen_at = now()
  where id = v_step.id;

  update public.raid_runs
  set gauge_earned = gauge_earned + v_weight
  where id = v_run.id;

  v_stat_value := (v_run.stat_snapshot ->> v_obstacle.stat)::numeric;
  v_cap_value := (v_run.caps_snapshot ->> v_obstacle.stat)::numeric;
  v_threshold := case when v_cap_value > 0 then v_stat_value / v_cap_value else 0 end;
  v_roll := random();
  v_passed := v_roll < v_threshold;

  update public.raid_run_steps
  set roll_threshold = v_threshold, roll_value = v_roll, roll_passed = v_passed
  where id = v_step.id;

  select obstacle_count into v_obstacle_count from public.raid_types where id = v_run.raid_type_id;

  if v_passed then
    update public.raid_run_steps
    set resolved_at = now()
    where id = v_step.id;

    if v_run.current_step_index + 1 >= v_obstacle_count then
      update public.raid_runs set current_step_index = current_step_index + 1, phase = 'boss' where id = v_run.id;
    else
      update public.raid_runs set current_step_index = current_step_index + 1 where id = v_run.id;
    end if;

    v_result := jsonb_build_object(
      'stat', v_obstacle.stat,
      'revealTh', v_obstacle.reveal_th,
      'rollPassed', true,
      'resultText', v_obstacle.text_pass_roll_th,
      'needsQuiz', false,
      'rollValueScaled', round(v_roll * 100),
      'rollThresholdScaled', round(v_threshold * 100)
    );
  else
    select p.grade_band into v_band from public.profiles p where p.id = v_user_id;
    v_band := coalesce(v_band, 'junior');

    select q.category into v_weak_category
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = v_user_id
      and qa.source is null
      and q.grade_band = v_band
    group by q.category
    having count(*) >= 10
    order by (sum(qa.is_correct::int)::numeric / count(*)) asc
    limit 1;

    if v_weak_category is not null then
      select count(*) into v_weak_count
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category;
      if v_weak_count = 0 then
        v_weak_category := null;
      end if;
    end if;

    if v_weak_category is not null then
      select qz.id, qz.question_text, qz.choices into v_question
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category
      order by random()
      limit 1;
    else
      select qz.id, qz.question_text, qz.choices into v_question
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band
      order by random()
      limit 1;
    end if;

    update public.raid_run_steps
    set quiz_question_id = v_question.id, quiz_pulled_at = now()
    where id = v_step.id;

    update public.raid_runs set phase = 'quiz' where id = v_run.id;

    v_result := jsonb_build_object(
      'stat', v_obstacle.stat,
      'revealTh', v_obstacle.reveal_th,
      'rollPassed', false,
      'needsQuiz', true,
      'question', jsonb_build_object(
        'id', v_question.id,
        'questionText', v_question.question_text,
        'choices', v_question.choices
      ),
      'rollValueScaled', round(v_roll * 100),
      'rollThresholdScaled', round(v_threshold * 100)
    );
  end if;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_raid_obstacle_answer(p_run_id uuid, p_choice_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_step public.raid_run_steps;
  v_obstacle public.raid_obstacles;
  v_correct_index int;
  v_is_correct boolean;
  v_result_text text;
  v_obstacle_count int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'quiz' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงตอบคำถามแก้ตัว';
  end if;

  select * into v_step
  from public.raid_run_steps
  where run_id = p_run_id and step_index = v_run.current_step_index
  for update;

  if not found or v_step.quiz_question_id is null then
    raise exception 'ไม่พบคำถามนี้';
  end if;

  if v_step.quiz_correct is not null then
    raise exception 'ตอบคำถามนี้ไปแล้ว';
  end if;

  select correct_index into v_correct_index
  from public.questions
  where id = v_step.quiz_question_id;

  v_is_correct := p_choice_index = v_correct_index;

  update public.raid_run_steps
  set quiz_correct = v_is_correct, resolved_at = now()
  where id = v_step.id;

  if not v_is_correct then
    update public.raid_runs set fail_count = fail_count + 1 where id = v_run.id;
  end if;

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, raid_run_id)
  values (v_user_id, v_step.quiz_question_id, v_is_correct, v_run.pet_id, 'raid_obstacle', v_run.id);

  select * into v_obstacle
  from public.raid_obstacles
  where id = (case v_step.chosen_side when 'a' then v_step.option_a_obstacle_id else v_step.option_b_obstacle_id end);

  v_result_text := case when v_is_correct then v_obstacle.text_pass_quiz_th else v_obstacle.text_fail_th end;

  select obstacle_count into v_obstacle_count from public.raid_types where id = v_run.raid_type_id;

  if v_run.current_step_index + 1 >= v_obstacle_count then
    update public.raid_runs set current_step_index = current_step_index + 1, phase = 'boss' where id = v_run.id;
  else
    update public.raid_runs set current_step_index = current_step_index + 1, phase = 'choosing' where id = v_run.id;
  end if;

  return jsonb_build_object('isCorrect', v_is_correct, 'resultText', v_result_text);
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_raid_boss(p_run_id uuid)
 RETURNS TABLE(seq integer, question_id bigint, question_text text, choices jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_band text;
  v_count int;
  v_question_count int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'boss' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงต่อสู้บอส';
  end if;

  select count(*) into v_count from public.raid_boss_questions where run_id = p_run_id;

  if v_count = 0 then
    select p.grade_band into v_band from public.profiles p where p.id = v_user_id;
    v_band := coalesce(v_band, 'junior');

    select boss_question_count into v_question_count from public.raid_types where id = v_run.raid_type_id;

    insert into public.raid_boss_questions (run_id, seq, question_id)
    select p_run_id, row_number() over (), qz.id
    from (
      select id from public.questions
      where status = 'active' and grade_band = v_band
      order by random()
      limit v_question_count
    ) qz;
  end if;

  return query
    select bq.seq, bq.question_id, q.question_text, q.choices
    from public.raid_boss_questions bq
    join public.questions q on q.id = bq.question_id
    where bq.run_id = p_run_id
    order by bq.seq;
end;
$function$;

CREATE OR REPLACE FUNCTION public.answer_raid_boss(p_run_id uuid, p_seq integer, p_choice_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_bq public.raid_boss_questions;
  v_correct_index int;
  v_explanation text;
  v_is_correct boolean;
  v_boss_correct_count int;
  v_answered_count int;
  v_raid_type record;
  v_gate_stat boolean;
  v_gate_quiz boolean;
  v_outcome text;
  v_total_pct numeric;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'boss' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงต่อสู้บอส';
  end if;

  select * into v_bq
  from public.raid_boss_questions
  where run_id = p_run_id and seq = p_seq
  for update;

  if not found then
    raise exception 'ไม่พบคำถามข้อนี้';
  end if;

  if v_bq.answered_at is not null then
    raise exception 'ตอบข้อนี้ไปแล้ว';
  end if;

  select correct_index, explanation into v_correct_index, v_explanation
  from public.questions where id = v_bq.question_id;

  v_is_correct := p_choice_index = v_correct_index;

  update public.raid_boss_questions
  set answered_at = now(), is_correct = v_is_correct
  where id = v_bq.id;

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, raid_run_id)
  values (v_user_id, v_bq.question_id, v_is_correct, v_run.pet_id, 'raid_boss', v_run.id);

  select count(*) filter (where is_correct), count(*) filter (where answered_at is not null)
    into v_boss_correct_count, v_answered_count
  from public.raid_boss_questions where run_id = p_run_id;

  update public.raid_runs set boss_correct_count = v_boss_correct_count where id = p_run_id;

  select * into v_raid_type from public.raid_types where id = v_run.raid_type_id;

  v_outcome := null;

  if v_answered_count >= v_raid_type.boss_question_count then
    v_total_pct := (
      (v_run.stat_snapshot->>'hp')::numeric + (v_run.stat_snapshot->>'atk')::numeric +
      (v_run.stat_snapshot->>'def')::numeric + (v_run.stat_snapshot->>'spd')::numeric +
      (v_run.stat_snapshot->>'foc')::numeric
    ) / 500 * 100;

    v_gate_stat := v_total_pct >= v_run.threshold_pct;
    v_gate_quiz := v_boss_correct_count >= v_raid_type.boss_pass_count;

    v_outcome := case
      when v_gate_stat and v_gate_quiz then 'win'
      when not v_gate_stat then 'lose_stat'
      else 'lose_quiz'
    end;

    update public.raid_runs set phase = 'reward', outcome = v_outcome where id = p_run_id;
  end if;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'correctIndex', v_correct_index,
    'explanation', v_explanation,
    'bossCorrectCount', v_boss_correct_count,
    'isLast', v_answered_count >= v_raid_type.boss_question_count,
    'outcome', v_outcome
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.equip_raid_gear(p_item_id uuid, p_pet_id uuid)
 RETURNS raid_gear_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.raid_gear_items;
  v_pet_owner uuid;
begin
  if v_user_id is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select user_id into v_pet_owner from public.pets where id = p_pet_id;
  if v_pet_owner is null or v_pet_owner <> v_user_id then
    raise exception 'ไม่พบ Qmon ตัวนี้';
  end if;

  if exists (select 1 from public.raid_runs where pet_id = p_pet_id and status = 'in_progress') then
    raise exception 'กำลังอยู่ในรอบท้าทาย ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (select 1 from public.pvp_challenges where challenger_pet_id = p_pet_id and status = 'pending') then
    raise exception 'มีคำท้าประลองค้างอยู่ ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (
    select 1 from public.pvp_matches
    where (pet_a_id = p_pet_id or pet_b_id = p_pet_id) and status = 'active'
  ) then
    raise exception 'กำลังอยู่ในแมตช์ประลอง ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  select * into v_item from public.raid_gear_items
  where id = p_item_id and owner_user_id = v_user_id for update;
  if not found then raise exception 'ไม่พบอุปกรณ์ชิ้นนี้'; end if;

  if v_item.equipped_pet_id is not null then
    raise exception 'อุปกรณ์นี้ใส่อยู่กับตัวอื่นอยู่ ต้องถอดก่อนถึงจะย้ายได้';
  end if;

  begin
    update public.raid_gear_items set equipped_pet_id = p_pet_id
    where id = p_item_id returning * into v_item;
  exception when unique_violation then
    raise exception 'ช่องนี้หรือแกนนี้มีอุปกรณ์ใส่อยู่แล้ว ถอดตัวเดิมออกก่อน';
  end;

  return v_item;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_raid_reward(p_run_id uuid)
 RETURNS TABLE(gear_id uuid, slot text, main_stat text, main_value integer, sub_stat text, sub_value integer, quality text, egg_awarded boolean, egg_type_id text, egg_name_th text, pity_meter integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_gear public.raid_gear_items;
  v_score int;
  v_score_pct numeric;
  v_quality_code text;
  v_quality record;
  v_slot text;
  v_main_stat text;
  v_sub_stat text;
  v_stats text[] := array['atk','hp','def','spd'];
  v_remaining text[];
  v_raid_slug text;
  v_egg_awarded boolean := false;
  v_egg_type_id text;
  v_egg_name_th text;
  v_is_first_clear boolean;
  v_meter int;
  v_epic_egg_id constant text := 'egg_epic_01';
  v_pity_cap constant int := 10;
  v_base_rate constant numeric := 0.10;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.gear_item_id is not null then
    select * into v_gear from public.raid_gear_items where id = v_run.gear_item_id;
    select meter into v_meter from public.raid_pity where user_id = v_user_id and reward_tier = 'epic';
    return query
    select v_gear.id, v_gear.slot, v_gear.main_stat, v_gear.main_value, v_gear.sub_stat, v_gear.sub_value, v_gear.quality,
           v_run.egg_awarded, v_run.egg_type_id,
           (select e.name_th from public.egg_types e where e.id = v_run.egg_type_id),
           v_meter;
    return;
  end if;

  if v_run.phase <> 'reward' then
    raise exception 'ตอนนี้ยังรับของไม่ได้';
  end if;

  select slug into v_raid_slug from public.raid_types where id = v_run.raid_type_id;

  v_score := greatest(0, v_run.gauge_earned - v_run.fail_count);
  v_score_pct := v_score::numeric / v_run.gauge_max * 100;

  select quality_code into v_quality_code
  from public.raid_quality_thresholds
  where (raid_type_id is null or raid_type_id = v_run.raid_type_id)
    and min_score_pct <= v_score_pct
  order by min_score_pct desc
  limit 1;

  if v_quality_code is null then
    raise exception 'ไม่พบระดับคุณภาพสำหรับคะแนนนี้';
  end if;

  select * into v_quality from public.raid_gear_qualities where code = v_quality_code;

  v_slot := (array['head','body','feet'])[floor(random() * 3)::int + 1];

  v_main_stat := case v_slot
    when 'head' then (array['atk','hp'])[floor(random() * 2)::int + 1]
    when 'body' then (array['def','spd'])[floor(random() * 2)::int + 1]
    else (array['spd','atk'])[floor(random() * 2)::int + 1]
  end;

  if v_quality.sub_value is not null then
    select array_agg(s) into v_remaining from unnest(v_stats) s where s <> v_main_stat;
    v_sub_stat := v_remaining[floor(random() * 3)::int + 1];
  else
    v_sub_stat := null;
  end if;

  insert into public.raid_gear_items (
    owner_user_id, slot, main_stat, main_value, sub_stat, sub_value, quality, source_run_id
  ) values (
    v_user_id, v_slot, v_main_stat, v_quality.main_value, v_sub_stat, v_quality.sub_value, v_quality_code, p_run_id
  )
  returning * into v_gear;

  -- epic egg logic: ridge_storm wins only. is_first_clear now requires outcome='win' too (fixed 2026-08-11)
  if v_raid_slug = 'ridge_storm' and v_run.outcome = 'win' then
    select not exists (
      select 1 from public.raid_runs
      where user_id = v_user_id
        and raid_type_id = v_run.raid_type_id
        and status = 'completed'
        and outcome = 'win'
        and id <> p_run_id
    ) into v_is_first_clear;

    if v_is_first_clear then
      v_egg_awarded := true;
    else
      insert into public.raid_pity (user_id, reward_tier, meter)
      values (v_user_id, 'epic', 0)
      on conflict (user_id, reward_tier) do nothing;

      select meter into v_meter
      from public.raid_pity
      where user_id = v_user_id and reward_tier = 'epic'
      for update;

      if v_meter >= v_pity_cap then
        v_egg_awarded := true;
      elsif random() < v_base_rate then
        v_egg_awarded := true;
      end if;

      if v_egg_awarded then
        update public.raid_pity set meter = 0
        where user_id = v_user_id and reward_tier = 'epic';
        v_meter := 0;
      else
        update public.raid_pity set meter = meter + 1
        where user_id = v_user_id and reward_tier = 'epic'
        returning meter into v_meter;
      end if;
    end if;

    if v_egg_awarded then
      v_egg_type_id := v_epic_egg_id;
      insert into public.player_eggs (user_id, egg_type_id, source)
      values (v_user_id, v_egg_type_id, 'raid_reward');
      select name_th into v_egg_name_th from public.egg_types where id = v_egg_type_id;
    end if;
  end if;

  update public.raid_runs
  set gear_item_id = v_gear.id, status = 'completed', completed_at = now(), phase = 'done',
      egg_awarded = v_egg_awarded, egg_type_id = v_egg_type_id
  where id = p_run_id;

  select meter into v_meter from public.raid_pity where user_id = v_user_id and reward_tier = 'epic';

  return query
  select v_gear.id, v_gear.slot, v_gear.main_stat, v_gear.main_value, v_gear.sub_stat, v_gear.sub_value, v_gear.quality,
         v_egg_awarded, v_egg_type_id, v_egg_name_th, v_meter;
end;
$function$;
