-- Cap ตั๋วสะสม (raid_tickets) ที่ 10 ใบ ก่อนออกตั๋วใหม่จาก claim_dungeon_run — เต็มแล้วข้ามการออกตั๋ว
-- เงียบๆ ไม่กระทบรางวัลอื่น (ไข่/มิเตอร์) เลย ตอบกลับ ticket_awarded ให้ client รู้ว่าจะโชว์ modal ตั๋วไหม
-- DROP ก่อน CREATE เพราะ RETURNS TABLE เปลี่ยน (เพิ่ม ticket_awarded)
drop function if exists public.claim_dungeon_run(uuid);

create or replace function public.claim_dungeon_run(p_run_id uuid)
returns table(
  egg_awarded boolean,
  egg_type_id text,
  egg_name_th text,
  egg_sprite_prefix text,
  food_kind text,
  pity_meter integer,
  ticket_awarded boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_reward_tier text;
  v_zone_id uuid;
  v_meter int;
  v_egg_awarded boolean := false;
  v_egg_type_id text;
  v_ticket_awarded boolean := false;
  v_ticket_count int;
  v_ticket_cap constant int := 10;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.dungeon_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้';
  end if;

  if v_run.claimed_at is not null then
    raise exception 'เคลมรางวัลไปแล้ว';
  end if;

  if v_run.ends_at > now() then
    raise exception 'การผจญภัยยังไม่เสร็จ';
  end if;

  select reward_tier, zone_id into v_reward_tier, v_zone_id
  from public.dungeon_types where id = v_run.dungeon_type_id;

  insert into public.dungeon_pity (user_id, reward_tier, meter)
  values (v_user_id, v_reward_tier, 0)
  on conflict (user_id, reward_tier) do nothing;

  select meter into v_meter
  from public.dungeon_pity
  where user_id = v_user_id and reward_tier = v_reward_tier
  for update;

  if v_meter >= 14 then
    v_egg_awarded := true;
  elsif random() < 0.05 then
    v_egg_awarded := true;
  end if;

  if v_egg_awarded then
    select id into v_egg_type_id
    from public.egg_types
    where tier = v_reward_tier
      and is_obtainable = true
    order by random()
    limit 1;

    if v_egg_type_id is null then
      raise exception 'ตอนนี้ยังไม่เปิดให้ได้ไข่รางวัลจากดันเจี้ยนนี้ ลองรับของอีกครั้งภายหลัง';
    end if;

    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_user_id, v_egg_type_id, 'dungeon_reward');

    update public.dungeon_pity set meter = 0
    where user_id = v_user_id and reward_tier = v_reward_tier;
    v_meter := 0;
  else
    update public.dungeon_pity set meter = meter + 1
    where user_id = v_user_id and reward_tier = v_reward_tier
    returning meter into v_meter;
  end if;

  update public.dungeon_runs
  set status = 'claimed',
      claimed_at = now(),
      egg_awarded = v_egg_awarded,
      egg_type_id = v_egg_type_id
  where id = p_run_id;

  select count(*) into v_ticket_count
  from public.raid_tickets
  where user_id = v_user_id and consumed_at is null;

  if v_ticket_count < v_ticket_cap then
    insert into public.raid_tickets (user_id, source, source_ref_id, zone_id)
    values (v_user_id, 'dungeon_claim', p_run_id, v_zone_id)
    on conflict do nothing;
    v_ticket_awarded := true;
  end if;

  return query
  select v_egg_awarded, v_egg_type_id, e.name_th, e.sprite_prefix, null::text as food_kind, v_meter, v_ticket_awarded
  from (select 1) as _dummy
  left join public.egg_types e on e.id = v_egg_type_id;
end;
$function$;

grant execute on function public.claim_dungeon_run(uuid) to authenticated;