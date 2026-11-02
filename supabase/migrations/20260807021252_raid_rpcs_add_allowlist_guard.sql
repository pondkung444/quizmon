-- เพิ่มเช็ค raid_allowlist ให้ครบทุก RPC ตามดอค §7 ("ต้องเช็ค user id ฝั่ง server ด้วย ทุก route
-- และทุก RPC") — start_raid_run มีอยู่แล้ว เพิ่มอีก 5 ตัวที่เหลือให้ครบ (ownership check เดิม
-- ที่มีอยู่ทุก RPC กันข้ามบัญชีได้อยู่แล้ว แต่เติมชั้นนี้ให้ตรงตามที่ดอคขอไว้ชัดเจน)

create or replace function public.choose_raid_path(p_run_id uuid, p_side text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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
      'needsQuiz', false
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
      )
    );
  end if;

  return v_result;
end;
$function$;

create or replace function public.submit_raid_obstacle_answer(p_run_id uuid, p_choice_index int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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

create or replace function public.start_raid_boss(p_run_id uuid)
returns table(seq int, question_id bigint, question_text text, choices jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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

create or replace function public.answer_raid_boss(p_run_id uuid, p_seq int, p_choice_index int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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

create or replace function public.claim_raid_reward(p_run_id uuid)
returns public.raid_gear_items
language plpgsql
security definer
set search_path to 'public'
as $function$
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
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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
    return v_gear;
  end if;

  if v_run.phase <> 'reward' then
    raise exception 'ตอนนี้ยังรับของไม่ได้';
  end if;

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
  v_main_stat := v_stats[floor(random() * 4)::int + 1];

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

  update public.raid_runs
  set gear_item_id = v_gear.id, status = 'completed', completed_at = now(), phase = 'done'
  where id = p_run_id;

  return v_gear;
end;
$function$;
