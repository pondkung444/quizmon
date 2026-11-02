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