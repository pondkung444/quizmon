create or replace function public.claim_raid_reward(p_run_id uuid)
returns raid_gear_items
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

  -- ตัดสินใจ 8 ส.ค. 2026: ประเภท x แกนหลักที่สุ่มได้ ผูกกับ slot แล้ว
  -- หัว=ATK+HP, ตัว=DEF+SPD, เท้า=SPD+ATK (ดู src/lib/raid/gearPool.ts)
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

  update public.raid_runs
  set gear_item_id = v_gear.id, status = 'completed', completed_at = now(), phase = 'done'
  where id = p_run_id;

  return v_gear;
end;
$function$;