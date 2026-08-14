-- ============================================================
-- 1) list_my_friends — รายชื่อเพื่อนเต็ม (school/grade_level/pride pet) สำหรับแท็บ "เพื่อน"
-- ============================================================
create or replace function public.list_my_friends()
returns table(
  friend_user_id uuid,
  username text,
  school text,
  grade_level text,
  friends_since timestamptz,
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
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  return query
  with fids as (
    select
      case when fr.user_id_low = v_me then fr.user_id_high else fr.user_id_low end as friend_id,
      fr.created_at as friends_since
    from public.friendships fr
    where fr.user_id_low = v_me or fr.user_id_high = v_me
  ),
  pride as (
    select fi.friend_id, fi.friends_since,
      coalesce(ps.pride_pet_id, ap.id) as pride_pet_id
    from fids fi
    left join public.profile_settings ps on ps.user_id = fi.friend_id
    left join public.pets ap on ap.user_id = fi.friend_id and ap.is_active = true and ps.pride_pet_id is null
  )
  select pd.friend_id, pr.username, pr.school, pr.grade_level, pd.friends_since,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th
  from pride pd
  join public.profiles pr on pr.id = pd.friend_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  order by pd.friends_since desc;
end;
$$;

grant execute on function public.list_my_friends() to authenticated;

-- ============================================================
-- 2) remove_friend — ลบเพื่อน: ลบ friendship + ประวัติกำลังใจ แต่ "ถูกใจยังอยู่" (ห้ามแตะ profile_likes)
-- ============================================================
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  v_low := least(v_me, p_friend_id);
  v_high := greatest(v_me, p_friend_id);

  delete from public.friendships where user_id_low = v_low and user_id_high = v_high;
  if not found then
    raise exception 'ไม่พบความเป็นเพื่อนกับผู้เล่นนี้';
  end if;

  delete from public.encouragements
  where (sender_id = v_me and recipient_id = p_friend_id)
     or (sender_id = p_friend_id and recipient_id = v_me);
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;

-- ============================================================
-- 3) block_user — ลบ friendship + คำขอค้าง + ถูกใจ + กำลังใจ ทั้งสองทิศทาง (ต่างจาก remove_friend
--    ตรงที่ลบ profile_likes ด้วย) ไม่แจ้งเตือนอีกฝ่าย
-- ============================================================
create or replace function public.block_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_target_id = v_me then
    raise exception 'บล็อกตัวเองไม่ได้';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_target_id)
    on conflict (blocker_id, blocked_id) do nothing;

  v_low := least(v_me, p_target_id);
  v_high := greatest(v_me, p_target_id);
  delete from public.friendships where user_id_low = v_low and user_id_high = v_high;

  update public.friend_requests
  set status = 'cancelled'
  where status = 'pending'
    and (
      (requester_id = v_me and addressee_id = p_target_id)
      or (requester_id = p_target_id and addressee_id = v_me)
    );

  delete from public.profile_likes
  where (liker_id = v_me and profile_user_id = p_target_id)
     or (liker_id = p_target_id and profile_user_id = v_me);

  delete from public.encouragements
  where (sender_id = v_me and recipient_id = p_target_id)
     or (sender_id = p_target_id and recipient_id = v_me);
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

-- ============================================================
-- 4) unblock_user — ลบแถวออกจาก blocks เท่านั้น ห้าม restore friendship/likes/encouragements เดิม
-- ============================================================
create or replace function public.unblock_user(p_target_id uuid)
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

  delete from public.blocks where blocker_id = v_me and blocked_id = p_target_id;
  if not found then
    raise exception 'ไม่พบบัญชีนี้ในรายชื่อที่บล็อกไว้';
  end if;
end;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

-- ============================================================
-- 5) list_my_blocked_accounts — เฉพาะ username + รูป Qmon (ไม่มีโรงเรียน/ระดับชั้น ไม่ใช่เพื่อนแล้ว)
-- ============================================================
create or replace function public.list_my_blocked_accounts()
returns table(
  blocked_user_id uuid,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  blocked_at timestamptz
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

  return query
  with pride as (
    select b.blocked_id, b.created_at as blocked_at,
      coalesce(ps.pride_pet_id, ap.id) as pride_pet_id
    from public.blocks b
    left join public.profile_settings ps on ps.user_id = b.blocked_id
    left join public.pets ap on ap.user_id = b.blocked_id and ap.is_active = true and ps.pride_pet_id is null
    where b.blocker_id = v_me
  )
  select pd.blocked_id, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th, pd.blocked_at
  from pride pd
  join public.profiles pr on pr.id = pd.blocked_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  order by pd.blocked_at desc;
end;
$$;

grant execute on function public.list_my_blocked_accounts() to authenticated;

-- ============================================================
-- 6) FIX: search_friend_code / send_friend_request — ต้องเคารพบล็อกทั้งสองทิศทาง (เฟส 3 ยังไม่รู้จัก
--    blocks เพราะตารางเพิ่งจะถูกใช้งานจริงในเฟสนี้) ตั้งใจให้ผลลัพธ์เหมือน "ไม่พบ" ทุกกรณีที่ถูกบล็อก
--    ไม่แยกข้อความ เพื่อไม่ให้อีกฝ่ายรู้ตัวว่าโดนบล็อก (§6.9)
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

  v_normalized := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));

  select id into v_target from public.profiles where friend_code = v_normalized;

  if v_target is null then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text;
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = v_target) or (blocker_id = v_target and blocked_id = v_me)
  ) then
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

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = v_target;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = v_target and p.is_active = true limit 1;
  end if;

  return query
  select true, v_status, v_target, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = v_target;
end;
$$;

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
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_me)
  ) then
    raise exception 'ไม่พบผู้เล่นนี้';
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
