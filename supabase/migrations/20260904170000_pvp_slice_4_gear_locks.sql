-- Migration: 20260904170000_pvp_slice_4_gear_locks
-- PvP ประลอง — สไลซ์ 4: ใช้ raid_gear_items ตัวเดิม (ไม่มีระบบอุปกรณ์แยก)
--
-- ส่วนนี้: ขยาย equip_raid_gear / unequip_raid_gear ให้บล็อกตอนที่ Qmon ผูกกับ PvP อยู่
--   - เป็น challenger_pet_id ของ pvp_challenges ที่ status = 'pending'  (ยื่นคำท้าค้างอยู่)
--   - เป็น pet_a_id / pet_b_id ของ pvp_matches ที่ status = 'active'   (อยู่ในแมตช์)
-- คงเช็ค raid_runs (status='in_progress') เดิมไว้ทุกอย่าง — เพิ่มเฉย ๆ

begin;
set local lock_timeout = '5s';

create or replace function public.equip_raid_gear(p_item_id uuid, p_pet_id uuid)
returns raid_gear_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.raid_gear_items;
  v_pet_owner uuid;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select user_id into v_pet_owner from public.pets where id = p_pet_id;
  if v_pet_owner is null or v_pet_owner <> v_user_id then
    raise exception 'ไม่พบ Qmon ตัวนี้';
  end if;

  if exists (
    select 1 from public.raid_runs where pet_id = p_pet_id and status = 'in_progress'
  ) then
    raise exception 'กำลังอยู่ในรอบท้าทาย ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (
    select 1 from public.pvp_challenges where challenger_pet_id = p_pet_id and status = 'pending'
  ) then
    raise exception 'มีคำท้าประลองค้างอยู่ ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (
    select 1 from public.pvp_matches
    where (pet_a_id = p_pet_id or pet_b_id = p_pet_id) and status = 'active'
  ) then
    raise exception 'กำลังอยู่ในแมตช์ประลอง ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  select * into v_item
  from public.raid_gear_items
  where id = p_item_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบอุปกรณ์ชิ้นนี้';
  end if;

  if v_item.equipped_pet_id is not null then
    raise exception 'อุปกรณ์นี้ใส่อยู่กับตัวอื่นอยู่ ต้องถอดก่อนถึงจะย้ายได้';
  end if;

  begin
    update public.raid_gear_items
    set equipped_pet_id = p_pet_id
    where id = p_item_id
    returning * into v_item;
  exception when unique_violation then
    raise exception 'ช่องนี้หรือแกนนี้มีอุปกรณ์ใส่อยู่แล้ว ถอดตัวเดิมออกก่อน';
  end;

  return v_item;
end;
$function$;

create or replace function public.unequip_raid_gear(p_item_id uuid)
returns raid_gear_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.raid_gear_items;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_item
  from public.raid_gear_items
  where id = p_item_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบอุปกรณ์ชิ้นนี้';
  end if;

  if v_item.equipped_pet_id is null then
    return v_item;
  end if;

  if exists (
    select 1 from public.raid_runs where pet_id = v_item.equipped_pet_id and status = 'in_progress'
  ) then
    raise exception 'กำลังอยู่ในรอบท้าทาย ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (
    select 1 from public.pvp_challenges
    where challenger_pet_id = v_item.equipped_pet_id and status = 'pending'
  ) then
    raise exception 'มีคำท้าประลองค้างอยู่ ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  if exists (
    select 1 from public.pvp_matches
    where (pet_a_id = v_item.equipped_pet_id or pet_b_id = v_item.equipped_pet_id)
      and status = 'active'
  ) then
    raise exception 'กำลังอยู่ในแมตช์ประลอง ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  update public.raid_gear_items
  set equipped_pet_id = null
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$function$;

commit;
