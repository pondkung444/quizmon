-- Migration: 20260904170100_pvp_slice_4_gear_stat_snapshot
-- PvP ประลอง — สไลซ์ 4: เติมโบนัสอุปกรณ์ (raid_gear_items) เข้า stat snapshot ตอนสร้างแมตช์
--
-- accept_pvp_challenge สร้าง v_stat_a/v_stat_b เป็น jsonb snapshot ครั้งเดียว — ทุกอย่าง downstream
-- (_pvp_resolve_round, assign_pvp_card timer) อ่านจาก snapshot นี้เท่านั้น จึงเป็นจุดเดียวที่ต้องเติม
--
-- FOC ไม่รับโบนัสอุปกรณ์ (ตรงกับ raid — raid_gear_items_main/sub_stat_check ยอมแค่ atk/hp/def/spd)
-- ไม่ clamp cap (PvP ไม่มีระบบ cap แบบ raid egg — สไลซ์ 1-3 ใช้ raw ตรง ๆ)

begin;
set local lock_timeout = '5s';

create or replace function public.accept_pvp_challenge(p_challenge_id uuid, p_pet_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_ch public.pvp_challenges;
  v_pet_a public.pets;
  v_pet_b public.pets;
  v_stat_a jsonb;
  v_stat_b jsonb;
  v_hp_a int;
  v_hp_b int;
  v_match_id uuid;
  v_ga_hp int; v_ga_atk int; v_ga_def int; v_ga_spd int;
  v_gb_hp int; v_gb_atk int; v_gb_def int; v_gb_spd int;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not exists (select 1 from public.pvp_allowlist where user_id = v_uid) then
    raise exception 'ยังไม่เปิดใช้ระบบประลองสำหรับบัญชีนี้';
  end if;

  select * into v_ch from public.pvp_challenges where id = p_challenge_id for update;
  if not found then raise exception 'ไม่พบคำท้านี้'; end if;
  if v_ch.opponent_id <> v_uid then raise exception 'คำท้านี้ไม่ได้ส่งถึงคุณ'; end if;
  if v_ch.status <> 'pending' then raise exception 'คำท้านี้ถูกตอบไปแล้ว'; end if;
  if v_ch.expires_at <= now() then
    update public.pvp_challenges set status = 'expired', responded_at = now() where id = p_challenge_id;
    raise exception 'คำท้านี้หมดอายุแล้ว';
  end if;

  if not exists (
    select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4
  ) then
    raise exception 'เลือก Qmon ระดับสูงสุด (stage 4) ของคุณเท่านั้น';
  end if;

  select * into v_pet_a from public.pets where id = v_ch.challenger_pet_id;
  if not found or v_pet_a.user_id <> v_ch.challenger_id or v_pet_a.stage <> 4 then
    raise exception 'Qmon ของผู้ท้าใช้ไม่ได้แล้ว';
  end if;
  select * into v_pet_b from public.pets where id = p_pet_id;

  -- โบนัสอุปกรณ์ที่ใส่อยู่กับแต่ละ Qmon (สูงสุด 3 ชิ้น/ตัว) — main + sub รวมเข้าสเตตัสตรง ๆ
  select
    coalesce(sum(case when main_stat = 'hp'  then main_value when sub_stat = 'hp'  then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'atk' then main_value when sub_stat = 'atk' then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'def' then main_value when sub_stat = 'def' then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'spd' then main_value when sub_stat = 'spd' then sub_value else 0 end), 0)
  into v_ga_hp, v_ga_atk, v_ga_def, v_ga_spd
  from public.raid_gear_items where equipped_pet_id = v_pet_a.id;

  select
    coalesce(sum(case when main_stat = 'hp'  then main_value when sub_stat = 'hp'  then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'atk' then main_value when sub_stat = 'atk' then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'def' then main_value when sub_stat = 'def' then sub_value else 0 end), 0),
    coalesce(sum(case when main_stat = 'spd' then main_value when sub_stat = 'spd' then sub_value else 0 end), 0)
  into v_gb_hp, v_gb_atk, v_gb_def, v_gb_spd
  from public.raid_gear_items where equipped_pet_id = v_pet_b.id;

  v_stat_a := jsonb_build_object(
    'hp',  coalesce(v_pet_a.stat_hp, 0)  + v_ga_hp,
    'atk', coalesce(v_pet_a.stat_atk, 0) + v_ga_atk,
    'def', coalesce(v_pet_a.stat_def, 0) + v_ga_def,
    'spd', coalesce(v_pet_a.stat_spd, 0) + v_ga_spd,
    'foc', coalesce(v_pet_a.stat_foc, 0));
  v_stat_b := jsonb_build_object(
    'hp',  coalesce(v_pet_b.stat_hp, 0)  + v_gb_hp,
    'atk', coalesce(v_pet_b.stat_atk, 0) + v_gb_atk,
    'def', coalesce(v_pet_b.stat_def, 0) + v_gb_def,
    'spd', coalesce(v_pet_b.stat_spd, 0) + v_gb_spd,
    'foc', coalesce(v_pet_b.stat_foc, 0));
  v_hp_a := greatest((v_stat_a->>'hp')::int, 1);
  v_hp_b := greatest((v_stat_b->>'hp')::int, 1);

  insert into public.pvp_matches (
    challenge_id, player_a_id, player_b_id, pet_a_id, pet_b_id,
    stat_a, stat_b, hp_a, hp_b, attacker_id, phase
  ) values (
    v_ch.id, v_ch.challenger_id, v_ch.opponent_id, v_pet_a.id, v_pet_b.id,
    v_stat_a, v_stat_b, v_hp_a, v_hp_b,
    v_ch.opponent_id,
    'assigning'
  ) returning id into v_match_id;

  update public.pvp_challenges set status = 'accepted', responded_at = now()
  where id = p_challenge_id;

  perform public._draw_pvp_hand(v_match_id, v_ch.opponent_id);

  return v_match_id;
end;
$$;

grant execute on function public.accept_pvp_challenge(uuid, uuid) to authenticated;

comment on column public.pvp_matches.stat_a is
  'snapshot สเตตัส Qmon ฝั่ง A ตอนสร้างแมตช์ {hp,atk,def,spd,foc} — รวมโบนัส raid_gear_items ที่ใส่อยู่แล้ว (สไลซ์ 4, FOC ไม่รับโบนัส)';

commit;
