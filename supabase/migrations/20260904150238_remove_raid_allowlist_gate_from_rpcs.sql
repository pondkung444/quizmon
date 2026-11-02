-- ตัด raid_allowlist gate ออกจาก RPC functions ทั้งหมด 7 ตัว (เปิดให้นักเรียนทุกคนเข้าระบบท้าทายได้)
-- ต่อเนื่องจาก fix B ที่ตัด gate ออกจากฝั่ง Next.js app code แล้ว แต่ยังเหลือ gate ซ้ำอยู่ที่ชั้น DB/RPC
-- delete_own_account ไม่แตะ เพราะแค่ลบแถว raid_allowlist ตอนลบบัญชี ไม่ใช่ gate check

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