-- Migration: 20260904160000_pvp_challenge_ticket_msg_wording
-- แก้คำในข้อความ error "ตั๋วหมด" ของ create_pvp_challenge:
--   "การผจญภัย" (idle-dungeon) -> "ท้าทาย" (raid — ระบบที่ให้ตั๋วโบนัสจริง)
-- ระบบเดียวที่ _pvp_grant_tickets ดึงตั๋วโบนัสมาให้คือ raid_runs (product name "ท้าทาย")
-- ไม่ใช่ dungeon ("ผจญภัย") — คนละฟีเจอร์กัน

begin;
set local lock_timeout = '5s';

create or replace function public.create_pvp_challenge(p_opponent_id uuid, p_pet_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_my_band text;
  v_opp_band text;
  v_pending int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not exists (select 1 from public.pvp_allowlist where user_id = v_uid) then
    raise exception 'ยังไม่เปิดใช้ระบบประลองสำหรับบัญชีนี้';
  end if;
  if p_opponent_id = v_uid then raise exception 'ท้าตัวเองไม่ได้'; end if;

  update public.pvp_challenges set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now()
    and (challenger_id = v_uid or opponent_id = v_uid);

  perform public._pvp_grant_tickets(v_uid);
  if not exists (
    select 1 from public.pvp_tickets where user_id = v_uid and consumed_at is null
  ) then
    raise exception 'ตั๋วประลองหมด — เติมวันละ 2 ใบ หรือได้เพิ่ม 1 ใบต่อท้าทายที่จบ (ชนะหรือแพ้ก็ได้)';
  end if;

  v_low := least(v_uid, p_opponent_id);
  v_high := greatest(v_uid, p_opponent_id);
  if not exists (
    select 1 from public.friendships where user_id_low = v_low and user_id_high = v_high
  ) then
    raise exception 'ท้าได้เฉพาะเพื่อนเท่านั้น';
  end if;

  select grade_band into v_my_band from public.profiles where id = v_uid;
  select grade_band into v_opp_band from public.profiles where id = p_opponent_id;
  if v_my_band is null or v_opp_band is null or v_my_band <> v_opp_band then
    raise exception 'ประลองได้เฉพาะเพื่อนที่อยู่ระดับชั้นเดียวกัน';
  end if;

  if not exists (
    select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4
  ) then
    raise exception 'เลือก Qmon ระดับสูงสุด (stage 4) ของคุณเท่านั้น';
  end if;

  select count(*) into v_pending
  from public.pvp_challenges
  where challenger_id = v_uid and status = 'pending' and expires_at > now();
  if v_pending >= 5 then
    raise exception 'มีคำท้าค้างครบ 5 รายการแล้ว รอตอบรับหรือหมดอายุก่อน';
  end if;

  if exists (
    select 1 from public.pvp_challenges
    where status = 'pending' and expires_at > now()
      and (
        (challenger_id = v_uid and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_uid)
      )
  ) then
    raise exception 'มีคำท้าระหว่างคุณสองคนค้างอยู่แล้ว';
  end if;

  insert into public.pvp_challenges (challenger_id, opponent_id, challenger_pet_id)
  values (v_uid, p_opponent_id, p_pet_id)
  returning id into v_id;

  update public.pvp_tickets
  set consumed_at = now(), consumed_challenge_id = v_id
  where id = (
    select id from public.pvp_tickets
    where user_id = v_uid and consumed_at is null
    order by granted_at asc
    limit 1
    for update skip locked
  );
  if not found then
    raise exception 'ตั๋วประลองหมด — เติมวันละ 2 ใบ หรือได้เพิ่ม 1 ใบต่อท้าทายที่จบ (ชนะหรือแพ้ก็ได้)';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_pvp_challenge(uuid, uuid) to authenticated;

commit;
