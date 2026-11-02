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
