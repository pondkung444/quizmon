-- ประลอง: คู่เดิมประลองซ้ำไม่ได้ ระหว่างที่แมตช์เดิมยังไม่จบ (status = 'active')
-- ช่องโหว่เดิม: กันแค่ "คำท้า pending" — พอรับแล้ว (accepted) ท้าใหม่/รับคำท้าเปิดของคนเดิมซ้ำได้ทันที
--
-- 3 ชั้น:
--   (ยังไม่มี unique index (least,greatest) where status='active' — prod มีแมตช์ active ซ้อนคู่ pond/ซันซัน
--    จากบั๊กนี้อยู่ 2 แมตช์ ต้องเคลียร์ก่อนถึงสร้าง index ได้ → ไฟล์ migration แยกทีหลัง)
--   1) trigger BEFORE INSERT — ข้อความไทยเป็นมิตร + advisory lock กัน race (ครอบทั้ง accept ตรง/เปิด)
--   2) create_pvp_challenge / accept_open_pvp_challenge เช็คก่อนตัดตั๋ว
--   3) list_open_pvp_challenges ซ่อนคำท้าเปิดของคนที่กำลังสู้กับเราอยู่
-- แมตช์ 'abandoned' (cron เก็บกวาด) และ 'finished' ไม่ล็อกคู่

begin;
set local lock_timeout = '5s';

create or replace function public._pvp_active_match_between(p_a uuid, p_b uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from public.pvp_matches
  where status = 'active'
    and least(player_a_id, player_b_id) = least(p_a, p_b)
    and greatest(player_a_id, player_b_id) = greatest(p_a, p_b)
  limit 1;
$$;
revoke all on function public._pvp_active_match_between(uuid, uuid) from public, anon, authenticated;

create or replace function public._pvp_block_repeat_active_match()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- serialize ต่อคู่ เพื่อให้ตัวที่สองเห็นแมตช์ของตัวแรกหลัง commit
  perform pg_advisory_xact_lock(
    hashtextextended(least(new.player_a_id, new.player_b_id)::text || greatest(new.player_a_id, new.player_b_id)::text, 0));
  if public._pvp_active_match_between(new.player_a_id, new.player_b_id) is not null then
    raise exception 'คุณกำลังประลองกับคนนี้อยู่ — เล่นแมตช์เดิมให้จบก่อนถึงจะท้าใหม่ได้';
  end if;
  return new;
end;
$$;
revoke all on function public._pvp_block_repeat_active_match() from public, anon, authenticated;

create trigger pvp_block_repeat_active_match
  before insert on public.pvp_matches
  for each row execute function public._pvp_block_repeat_active_match();

-- create_pvp_challenge: เพิ่มเช็คแมตช์ active กับคู่นี้ (ก่อนเช็คตั๋ว จะได้ไม่เสียตั๋ว)
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
  if exists (select 1 from auth.users where id = v_uid and is_anonymous = true) then
    raise exception 'ผูกไอดีก่อนนะ ถึงจะเปิดระบบประลองได้';
  end if;
  if p_opponent_id = v_uid then raise exception 'ท้าตัวเองไม่ได้'; end if;

  if public._pvp_active_match_between(v_uid, p_opponent_id) is not null then
    raise exception 'คุณกำลังประลองกับคนนี้อยู่ — เล่นแมตช์เดิมให้จบก่อนถึงจะท้าใหม่ได้';
  end if;

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
    select 1 from public.pets where id = p_pet_id and user_id = v_uid
  ) then
    raise exception 'ไม่พบ Qmon ตัวนี้';
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

-- accept_open_pvp_challenge: เช็คแมตช์ active กับเจ้าของคำท้า (ข้อความชัดเจนก่อนเข้าไปถึง trigger)
create or replace function public.accept_open_pvp_challenge(p_challenge_id uuid, p_pet_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ch public.pvp_challenges;
  v_band text;
  v_match_id uuid;
begin
  if v_uid is null or exists (select 1 from auth.users where id = v_uid and is_anonymous) then
    raise exception 'ต้องผูกบัญชีก่อนประลอง';
  end if;
  select * into v_ch from public.pvp_challenges where id = p_challenge_id for update;
  if not found or v_ch.visibility <> 'open' or v_ch.status <> 'pending' or v_ch.expires_at <= now() then
    raise exception 'คำท้านี้ไม่มีให้รับแล้ว';
  end if;
  if v_ch.challenger_id = v_uid then raise exception 'รับคำท้าของตัวเองไม่ได้'; end if;
  select grade_band into v_band from public.profiles where id = v_uid;
  if v_band is null or v_band not in ('junior', 'senior') or
    v_band is distinct from (select grade_band from public.profiles where id = v_ch.challenger_id) then
    raise exception 'รับคำท้าได้เฉพาะระดับชั้นเดียวกัน';
  end if;
  if exists (select 1 from public.blocks b where
      (b.blocker_id = v_uid and b.blocked_id = v_ch.challenger_id) or
      (b.blocker_id = v_ch.challenger_id and b.blocked_id = v_uid)) then
    raise exception 'รับคำท้านี้ไม่ได้';
  end if;
  if public._pvp_active_match_between(v_uid, v_ch.challenger_id) is not null then
    raise exception 'คุณกำลังประลองกับคนนี้อยู่ — เล่นแมตช์เดิมให้จบก่อนถึงจะท้าใหม่ได้';
  end if;
  if not exists (select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4) then
    raise exception 'เลือก Qmon ระยะ 4 ของคุณ';
  end if;
  perform public._pvp_grant_tickets(v_uid);
  if not exists (select 1 from public.pvp_tickets where user_id = v_uid and consumed_at is null) then
    raise exception 'ตั๋วประลองหมด';
  end if;
  update public.pvp_challenges set opponent_id = v_uid where id = p_challenge_id;
  v_match_id := public.accept_pvp_challenge(p_challenge_id, p_pet_id);
  update public.pvp_tickets set consumed_at = now(), consumed_challenge_id = p_challenge_id
    where id = (select id from public.pvp_tickets where user_id = v_uid and consumed_at is null
      order by granted_at limit 1 for update skip locked);
  if not found then raise exception 'ตั๋วประลองหมด'; end if;
  return v_match_id;
end;
$$;

-- list_open_pvp_challenges: ซ่อนคำท้าของคนที่กำลังสู้กับเราอยู่
create or replace function public.list_open_pvp_challenges()
returns table (id uuid, pet_name text, pet_stage smallint, pet_subline text,
  pet_personality text, egg_sprite_prefix text, egg_name_th text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, p.nickname, p.stage, p.subline::text, p.personality::text,
    e.sprite_prefix, e.name_th, c.expires_at
  from public.pvp_challenges c
  join public.profiles owner_profile on owner_profile.id = c.challenger_id
  join public.profiles viewer on viewer.id = auth.uid()
  join public.pets p on p.id = c.challenger_pet_id and p.user_id = c.challenger_id and p.stage = 4
  join public.egg_types e on e.id = p.egg_type_id
  where c.visibility = 'open' and c.status = 'pending' and c.expires_at > now()
    and c.challenger_id <> auth.uid()
    and owner_profile.grade_band = viewer.grade_band
    and viewer.grade_band in ('junior', 'senior')
    and not exists (select 1 from public.blocks b where
      (b.blocker_id = c.challenger_id and b.blocked_id = auth.uid()) or
      (b.blocker_id = auth.uid() and b.blocked_id = c.challenger_id))
    and public._pvp_active_match_between(c.challenger_id, auth.uid()) is null
  order by c.created_at desc limit 50;
$$;

commit;
