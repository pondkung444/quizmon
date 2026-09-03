-- Migration: 20260904090000_pvp_turn_order_receiver_first
-- ประลอง slice 1 revision (2026-09-04): ผู้ "รับคำท้า" (opponent) ได้เล่นก่อนเสมอ ไม่ตัดสินด้วย SPD
-- SPD เหลือหน้าที่เดียว = ความยาว timer ต่อตา (timer_seconds = 60 + round(spd/20)) คิดฝั่ง client
-- submit_pvp_card ไม่ยุ่งกับ turn order/timer อยู่แล้ว — แก้เฉพาะ accept_pvp_challenge

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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

  v_stat_a := jsonb_build_object(
    'hp', coalesce(v_pet_a.stat_hp, 0), 'atk', coalesce(v_pet_a.stat_atk, 0),
    'def', coalesce(v_pet_a.stat_def, 0), 'spd', coalesce(v_pet_a.stat_spd, 0),
    'foc', coalesce(v_pet_a.stat_foc, 0));
  v_stat_b := jsonb_build_object(
    'hp', coalesce(v_pet_b.stat_hp, 0), 'atk', coalesce(v_pet_b.stat_atk, 0),
    'def', coalesce(v_pet_b.stat_def, 0), 'spd', coalesce(v_pet_b.stat_spd, 0),
    'foc', coalesce(v_pet_b.stat_foc, 0));
  v_hp_a := greatest((v_stat_a->>'hp')::int, 1);
  v_hp_b := greatest((v_stat_b->>'hp')::int, 1);

  insert into public.pvp_matches (
    challenge_id, player_a_id, player_b_id, pet_a_id, pet_b_id,
    stat_a, stat_b, hp_a, hp_b, attacker_id, phase
  ) values (
    v_ch.id, v_ch.challenger_id, v_ch.opponent_id, v_pet_a.id, v_pet_b.id,
    v_stat_a, v_stat_b, v_hp_a, v_hp_b,
    v_ch.opponent_id,   -- revision: ผู้รับคำท้าได้ส่งการ์ดก่อนเสมอ (ไม่ดู SPD)
    'assigning'
  ) returning id into v_match_id;

  update public.pvp_challenges set status = 'accepted', responded_at = now()
  where id = p_challenge_id;

  perform public._draw_pvp_hand(v_match_id, v_ch.opponent_id);

  return v_match_id;
end;
$$;

commit;
