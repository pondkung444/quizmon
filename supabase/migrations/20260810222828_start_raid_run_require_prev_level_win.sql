-- แก้ start_raid_run(): เดิมเช็คแค่ raid_runs.status='completed' ของด่านก่อนหน้า (migration
-- 20260810220337_enforce_raid_level_progression_server_side) ซึ่งหลวมเกินไป — แพ้ด่านก่อนหน้าก็
-- status='completed' เหมือนกัน (ทุกคนได้ของเสมอไม่ว่าชนะหรือแพ้ ดู claim_raid_reward) ทำให้ตั้งใจ
-- แพ้ด่านแรกแล้วเรียก RPC ตรงข้ามไปด่านถัดไปได้ ทั้งที่ frontend gate (getRaidZonesWithLevels)
-- เช็ค outcome='win' อยู่แล้ว ต้องให้ตรงกัน
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
  v_shuffled_colors text[];
  v_slot_count int;
  v_gauge_max int := 0;
  v_step_obstacle_a uuid[] := array[]::uuid[];
  v_step_obstacle_b uuid[] := array[]::uuid[];
  v_step_color_a text[] := array[]::text[];
  v_step_color_b text[] := array[]::text[];
  v_pair uuid[];
  v_weight_a int;
  v_weight_b int;
  i int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
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

  select id, obstacle_count, boss_threshold_pct, color_quota, zone_id, sort_order
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
    raise exception 'ไม่มีตั๋วท้าทายของโซนนี้เหลืออยู่';
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

  v_slot_count := v_raid_type.obstacle_count * 2;

  select array_agg(color order by rnd) into v_shuffled_colors
  from (
    select kv.key as color, random() as rnd
    from jsonb_each_text(v_raid_type.color_quota) kv,
         generate_series(1, kv.value::int)
  ) t;

  if v_shuffled_colors is null or array_length(v_shuffled_colors, 1) <> v_slot_count then
    raise exception 'ตั้งค่าด่านนี้ผิดพลาด (color_quota ไม่ตรงกับ obstacle_count)';
  end if;

  for i in 0 .. v_raid_type.obstacle_count - 1 loop
    select array_agg(id) into v_pair
    from (
      select id from public.raid_obstacles
      where is_active = true and zone_id = v_raid_type.zone_id
      order by random() limit 2
    ) t;

    if v_pair is null or array_length(v_pair, 1) < 2 then
      raise exception 'ยังไม่มีอุปสรรคพอสำหรับโซนนี้';
    end if;

    v_step_obstacle_a := v_step_obstacle_a || v_pair[1];
    v_step_obstacle_b := v_step_obstacle_b || v_pair[2];
    v_step_color_a := v_step_color_a || v_shuffled_colors[i * 2 + 1];
    v_step_color_b := v_step_color_b || v_shuffled_colors[i * 2 + 2];

    v_weight_a := case v_shuffled_colors[i * 2 + 1] when 'green' then 0 when 'yellow' then 1 else 2 end;
    v_weight_b := case v_shuffled_colors[i * 2 + 2] when 'green' then 0 when 'yellow' then 1 else 2 end;
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
