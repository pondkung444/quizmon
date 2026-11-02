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

  select count(*) filter (where is_correct), count(*) into v_boss_correct_count, v_answered_count
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
