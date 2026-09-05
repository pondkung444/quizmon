-- เพิ่ม image_url ให้ RPC ที่ส่งคำถาม Raid กลับไปยัง client (choose_raid_path ตอนตอบแก้ตัวที่
-- อุปสรรค, start_raid_boss ตอนสู้บอส) เดิม select เฉพาะ question_text/choices ทำให้ frontend
-- render รูปไม่ได้แม้ questions.image_url จะมีข้อมูลอยู่แล้ว (ดู docs การสำรวจ 2026-09-04)
--
-- choose_raid_path คืน jsonb เดิม (ไม่เปลี่ยน return type) ใช้ CREATE OR REPLACE ได้ตรงๆ
-- start_raid_boss คืน TABLE ที่เปลี่ยนจำนวนคอลัมน์ — Postgres ไม่ให้ CREATE OR REPLACE เปลี่ยน
-- output columns ของ TABLE-returning function ต้อง DROP แล้วสร้างใหม่

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
      select qz.id, qz.question_text, qz.choices, qz.image_url into v_question
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category
      order by random()
      limit 1;
    else
      select qz.id, qz.question_text, qz.choices, qz.image_url into v_question
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
        'choices', v_question.choices,
        'imageUrl', v_question.image_url
      ),
      'rollValueScaled', round(v_roll * 100),
      'rollThresholdScaled', round(v_threshold * 100)
    );
  end if;

  return v_result;
end;
$function$;

DROP FUNCTION IF EXISTS public.start_raid_boss(uuid);

CREATE FUNCTION public.start_raid_boss(p_run_id uuid)
 RETURNS TABLE(seq integer, question_id bigint, question_text text, choices jsonb, image_url text)
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
    select bq.seq, bq.question_id, q.question_text, q.choices, q.image_url
    from public.raid_boss_questions bq
    join public.questions q on q.id = bq.question_id
    where bq.run_id = p_run_id
    order by bq.seq;
end;
$function$;
