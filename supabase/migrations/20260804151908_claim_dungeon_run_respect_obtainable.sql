-- Migration: 20260804151908_claim_dungeon_run_respect_obtainable
-- บั๊ก: claim_dungeon_run() เลือก egg_types โดยไม่เช็ค is_obtainable — ทำให้ระบบเปิด/ปิดไข่
-- (is_obtainable=false) ที่ออกแบบไว้ไม่มีผลกับ dungeon reward เลย ยังแจกไข่ที่ปิดไปแล้วได้ปกติ
--
-- แก้: เพิ่ม "and is_obtainable = true" ในคิวรีเลือกไข่ + เปลี่ยนข้อความ error ให้สื่อว่า "ยังไม่เปิด
-- ให้ได้ไข่" แทนข้อความดิบเดิม ("ไม่พบไข่ tier % สำหรับดันเจี้ยนนี้")
--
-- ผลที่ตามมา (ตั้งใจ): ถ้ามิเตอร์การันตี/สุ่มได้ egg_awarded=true แต่ tier นั้นไม่มีไข่ที่ is_obtainable
-- เหลือเลย ทั้งฟังก์ชัน raise exception และ rollback ทั้งหมด (รวมอาหาร/มิเตอร์/สถานะรัน) — รันยังเคลม
-- ไม่ได้ ผู้เล่นลองเคลมใหม่ได้ภายหลังเมื่อเปิดไข่ tier นั้นอีกครั้ง

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
-- Rollback: re-apply supabase/migrations/20260804120843_claim_dungeon_run_rpc.sql (เนื้อฟังก์ชัน
-- เดิมก่อนแก้ ไม่มีเงื่อนไข is_obtainable)
-- ============================================================
