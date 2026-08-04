-- Migration: 20260804120400_claim_dungeon_run_rpc
-- guard: เป็นรันของ user เรียก · ends_at <= now() · claimed_at is null · select ... for update ล็อกแถวกัน race
-- อาหารการันตี A/B สุ่ม 50/50 · มิเตอร์ dungeon_pity: meter>=14 การันตีไข่, ไม่ถึงสุ่ม 5%
-- ได้ไข่ -> insert player_eggs (source='dungeon_reward') + รีเซ็ต meter=0
-- ไม่ได้ไข่ -> meter+1 (upsert)
-- insert player_food +1 ด้วย pattern เดียวกับ claim_daily_mission_bonus (ไม่มี RPC อาหารแยกให้เรียกซ้ำ)

create or replace function public.claim_dungeon_run(p_run_id uuid)
returns table (
  egg_awarded boolean,
  egg_type_id text,
  egg_name_th text,
  egg_sprite_prefix text,
  food_kind text,
  pity_meter int
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_reward_tier text;
  v_meter int;
  v_egg_awarded boolean := false;
  v_egg_type_id text;
  v_food_kind text;
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

  select reward_tier into v_reward_tier
  from public.dungeon_types where id = v_run.dungeon_type_id;

  v_food_kind := case when random() < 0.5 then 'A' else 'B' end;

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
    order by random()
    limit 1;

    if v_egg_type_id is null then
      raise exception 'ไม่พบไข่ tier % สำหรับดันเจี้ยนนี้', v_reward_tier;
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
      egg_type_id = v_egg_type_id,
      food_kind = v_food_kind
  where id = p_run_id;

  insert into public.player_food (user_id, food_type, quantity)
  values (v_user_id, v_food_kind, 1)
  on conflict (user_id, food_type)
  do update set quantity = player_food.quantity + 1, updated_at = now();

  return query
  select v_egg_awarded, v_egg_type_id, e.name_th, e.sprite_prefix, v_food_kind, v_meter
  from (select 1) as _dummy
  left join public.egg_types e on e.id = v_egg_type_id;
end;
$$;

grant execute on function public.claim_dungeon_run(uuid) to authenticated;

-- ============================================================
-- Rollback: drop function if exists public.claim_dungeon_run(uuid);
-- ============================================================
