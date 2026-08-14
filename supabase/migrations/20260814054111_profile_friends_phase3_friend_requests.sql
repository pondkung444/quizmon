-- ============================================================
-- 1) friend_requests.status — เพิ่ม 'expired' (คำขอหมดอายุหลัง 30 วัน, §6.6)
-- ============================================================
alter table public.friend_requests drop constraint friend_requests_status_check;
alter table public.friend_requests add constraint friend_requests_status_check
  check (status in ('pending','accepted','rejected','cancelled','expired'));

-- ============================================================
-- 2) Lazy expiration helper — ไม่มี cron job ในโปรเจกต์นี้ ทุก RPC ที่แตะ friend_requests
--    ของ user คนนั้นต้องเรียกตัวนี้ก่อนทำงานหลักเสมอ
-- ============================================================
create or replace function public._expire_stale_friend_requests(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friend_requests
  set status = 'expired'
  where status = 'pending'
    and created_at < now() - interval '30 days'
    and (requester_id = p_user_id or addressee_id = p_user_id);
end;
$$;

-- ============================================================
-- 3) search_friend_code — ค้นหาผู้เล่นด้วย Friend Code (§6.2)
-- ============================================================
create or replace function public.search_friend_code(p_code text)
returns table(
  found boolean,
  relationship_status text,
  target_user_id uuid,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_normalized text;
  v_target uuid;
  v_status text;
  v_pride_pet_id uuid;
  v_my_friend_count int;
  v_target_friend_count int;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  perform public._expire_stale_friend_requests(v_me);

  -- normalize ซ้ำฝั่ง RPC เป็น safety net แม้ client จะ normalize มาก่อนแล้วก็ตาม
  v_normalized := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));

  select id into v_target from public.profiles where friend_code = v_normalized;

  if v_target is null then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_target = v_me then
    v_status := 'self';
  elsif exists (
    select 1 from public.friendships
    where user_id_low = least(v_me, v_target) and user_id_high = greatest(v_me, v_target)
  ) then
    v_status := 'friends';
  elsif exists (
    select 1 from public.friend_requests
    where requester_id = v_me and addressee_id = v_target and status = 'pending'
  ) then
    v_status := 'pending_sent';
  elsif exists (
    select 1 from public.friend_requests
    where requester_id = v_target and addressee_id = v_me and status = 'pending'
  ) then
    v_status := 'pending_received';
  else
    select count(*) into v_my_friend_count from public.friend_ids(v_me);
    select count(*) into v_target_friend_count from public.friend_ids(v_target);
    if v_my_friend_count >= 100 or v_target_friend_count >= 100 then
      v_status := 'friend_list_full';
    else
      v_status := 'available';
    end if;
  end if;

  -- Qmon ที่ภูมิใจ: pride_pet_id ?? active pet (fallback เดียวกับ MyProfileTab เฟส 2)
  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = v_target;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = v_target and p.is_active = true limit 1;
  end if;

  return query
  select true, v_status, v_target, pr.username,
    pt.nickname, pt.stage, pt.subline, pt.personality, et.sprite_prefix, et.name_th
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = v_target;
end;
$$;

grant execute on function public.search_friend_code(text) to authenticated;

-- ============================================================
-- 4) send_friend_request — ส่งคำขอเป็นเพื่อน (§6.4, §6.6)
-- ============================================================
create or replace function public.send_friend_request(p_target_user_id uuid)
returns table(request_id uuid, auto_accepted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_reverse_request_id uuid;
  v_my_friend_count int;
  v_target_friend_count int;
  v_my_pending_count int;
  v_new_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  perform public._expire_stale_friend_requests(v_me);
  perform public._expire_stale_friend_requests(p_target_user_id);

  if p_target_user_id = v_me then
    raise exception 'ส่งคำขอเป็นเพื่อนหาตัวเองไม่ได้';
  end if;

  if exists (
    select 1 from public.friendships
    where user_id_low = least(v_me, p_target_user_id) and user_id_high = greatest(v_me, p_target_user_id)
  ) then
    raise exception 'เป็นเพื่อนกันอยู่แล้ว';
  end if;

  select count(*) into v_my_friend_count from public.friend_ids(v_me);
  if v_my_friend_count >= 100 then
    raise exception 'คุณมีเพื่อนครบ 100 คนแล้ว';
  end if;

  select count(*) into v_target_friend_count from public.friend_ids(p_target_user_id);
  if v_target_friend_count >= 100 then
    raise exception 'เพื่อนคนนี้มีรายชื่อเพื่อนเต็มแล้ว';
  end if;

  select count(*) into v_my_pending_count
  from public.friend_requests
  where requester_id = v_me and status = 'pending';
  if v_my_pending_count >= 20 then
    raise exception 'คุณส่งคำขอค้างไว้ครบ 20 รายการแล้ว รอให้บางคำขอถูกตอบก่อนนะ';
  end if;

  if exists (
    select 1 from public.friend_requests
    where requester_id = v_me and addressee_id = p_target_user_id and status = 'pending'
  ) then
    raise exception 'ส่งคำขอไปหาคนนี้ค้างอยู่แล้ว';
  end if;

  -- เขาส่งคำขอมาหาเราค้างอยู่ก่อน (ปกติ UI จะไม่ยิง action นี้ในสถานการณ์นี้ — ปุ่มควรเป็น
  -- "ตอบรับคำขอ" แทน — กันไว้เป็น safety net) → auto-accept แทนสร้างคำขอซ้ำ
  select id into v_reverse_request_id
  from public.friend_requests
  where requester_id = p_target_user_id and addressee_id = v_me and status = 'pending'
  limit 1;

  if v_reverse_request_id is not null then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = v_reverse_request_id;
    insert into public.friendships (user_id_low, user_id_high)
      values (least(v_me, p_target_user_id), greatest(v_me, p_target_user_id))
      on conflict (user_id_low, user_id_high) do nothing;
    return query select v_reverse_request_id, true;
    return;
  end if;

  if exists (
    select 1 from public.friend_requests
    where requester_id = v_me and addressee_id = p_target_user_id
      and status = 'rejected' and responded_at > now() - interval '7 days'
  ) then
    raise exception 'คนนี้เพิ่งปฏิเสธคำขอของคุณ ลองใหม่อีกครั้งภายหลังนะ';
  end if;

  insert into public.friend_requests (requester_id, addressee_id, status)
  values (v_me, p_target_user_id, 'pending')
  returning id into v_new_id;

  return query select v_new_id, false;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- ============================================================
-- 5) respond_friend_request — ตอบรับ/ปฏิเสธคำขอ (§6.5)
-- ============================================================
create or replace function public.respond_friend_request(p_request_id uuid, p_action text)
returns table(status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if p_action not in ('accept', 'reject') then
    raise exception 'action ไม่ถูกต้อง';
  end if;

  perform public._expire_stale_friend_requests(v_me);

  select * into v_req from public.friend_requests where id = p_request_id;

  if not found or v_req.addressee_id <> v_me or v_req.status <> 'pending' then
    raise exception 'ไม่พบคำขอนี้ หรือคำขอนี้ถูกตอบไปแล้ว';
  end if;

  if p_action = 'accept' then
    insert into public.friendships (user_id_low, user_id_high)
      values (least(v_req.requester_id, v_me), greatest(v_req.requester_id, v_me))
      on conflict (user_id_low, user_id_high) do nothing;
    update public.friend_requests set status = 'accepted', responded_at = now() where id = p_request_id;
    return query select 'accepted'::text;
  else
    update public.friend_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return query select 'rejected'::text;
  end if;
end;
$$;

grant execute on function public.respond_friend_request(uuid, text) to authenticated;

-- ============================================================
-- 6) cancel_friend_request — ยกเลิกคำขอที่ส่งไป (ไม่ผูก cooldown, §6.6)
-- ============================================================
create or replace function public.cancel_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  perform public._expire_stale_friend_requests(v_me);

  update public.friend_requests
  set status = 'cancelled'
  where id = p_request_id and requester_id = v_me and status = 'pending';

  if not found then
    raise exception 'ไม่พบคำขอนี้ หรือยกเลิกไม่ได้';
  end if;
end;
$$;

grant execute on function public.cancel_friend_request(uuid) to authenticated;

-- ============================================================
-- 7) list_my_friend_requests — คำขอที่ได้รับ + ส่งไป (สำหรับ S07)
-- ============================================================
create or replace function public.list_my_friend_requests()
returns table(
  direction text,
  request_id uuid,
  other_user_id uuid,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  perform public._expire_stale_friend_requests(v_me);

  return query
  with reqs as (
    select fr.id, fr.created_at,
      case when fr.addressee_id = v_me then 'received' else 'sent' end as direction,
      case when fr.addressee_id = v_me then fr.requester_id else fr.addressee_id end as other_user_id
    from public.friend_requests fr
    where fr.status = 'pending' and (fr.requester_id = v_me or fr.addressee_id = v_me)
  ),
  pride as (
    select r.id as request_id, r.direction, r.other_user_id, r.created_at,
      coalesce(ps.pride_pet_id, ap.id) as pride_pet_id
    from reqs r
    left join public.profile_settings ps on ps.user_id = r.other_user_id
    left join public.pets ap on ap.user_id = r.other_user_id and ap.is_active = true and ps.pride_pet_id is null
  )
  select pd.direction, pd.request_id, pd.other_user_id, pr.username,
    pt.nickname, pt.stage, pt.subline, pt.personality, et.sprite_prefix, et.name_th, pd.created_at
  from pride pd
  join public.profiles pr on pr.id = pd.other_user_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  order by pd.created_at desc;
end;
$$;

grant execute on function public.list_my_friend_requests() to authenticated;
