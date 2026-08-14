-- ============================================================
-- 1) _compute_relationship_status — extract จาก search_friend_code (เฟส 3/4) เป็น helper ย่อยที่
--    เรียกซ้ำได้ทั้ง search_friend_code และ get_public_profile (เฟส 5) กัน enum/logic เพี้ยนกัน
-- ============================================================
create or replace function public._compute_relationship_status(p_me uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_my_friend_count int;
  v_target_friend_count int;
begin
  if p_target = p_me then
    v_status := 'self';
  elsif exists (
    select 1 from public.friendships
    where user_id_low = least(p_me, p_target) and user_id_high = greatest(p_me, p_target)
  ) then
    v_status := 'friends';
  elsif exists (
    select 1 from public.friend_requests
    where requester_id = p_me and addressee_id = p_target and status = 'pending'
  ) then
    v_status := 'pending_sent';
  elsif exists (
    select 1 from public.friend_requests
    where requester_id = p_target and addressee_id = p_me and status = 'pending'
  ) then
    v_status := 'pending_received';
  else
    select count(*) into v_my_friend_count from public.friend_ids(p_me);
    select count(*) into v_target_friend_count from public.friend_ids(p_target);
    if v_my_friend_count >= 100 or v_target_friend_count >= 100 then
      v_status := 'friend_list_full';
    else
      v_status := 'available';
    end if;
  end if;
  return v_status;
end;
$$;

-- ============================================================
-- 2) search_friend_code — REPLACE: ใช้ _compute_relationship_status แทน logic inline เดิม
--    (signature เดิมไม่เปลี่ยน, พฤติกรรมเดิมทุกอย่างเหมือนเดิม)
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
  v_pride_pet_id uuid;
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

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = v_target;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = v_target and p.is_active = true limit 1;
  end if;

  return query
  select true, public._compute_relationship_status(v_me, v_target), v_target, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = v_target;
end;
$$;

grant execute on function public.search_friend_code(text) to authenticated;

-- ============================================================
-- 3) get_public_profile — S04 (§5.2/§5.3): username, Qmon ที่ภูมิใจ (ไม่มีสเตตัส/อุปกรณ์),
--    เหรียญปักหมุด 3 อัน, จำนวนถูกใจ, liked_by_me — ห้ามคืนโรงเรียน/ระดับชั้น/เส้นทาง/ตัวโปรด/Friend Code
--    บล็อกทั้งสองทิศทาง → คืนแบบเดียวกับ "ไม่พบ" (ห้าม leak สถานะบล็อก เหมือน search_friend_code)
-- ============================================================
create or replace function public.get_public_profile(p_target_user_id uuid)
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
  egg_name_th text,
  medals jsonb,
  like_count int,
  liked_by_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_pride_pet_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text, null::jsonb, null::int, null::boolean;
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_me)
  ) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text, null::jsonb, null::int, null::boolean;
    return;
  end if;

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = p_target_user_id;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = p_target_user_id and p.is_active = true limit 1;
  end if;

  return query
  select
    true,
    public._compute_relationship_status(v_me, p_target_user_id),
    p_target_user_id,
    pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'tier', ad.tier, 'imageFile', ad.image_file) order by upa.pin_order)
      from public.user_pinned_achievements upa
      join public.achievement_definitions ad on ad.id = upa.achievement_id
      where upa.user_id = p_target_user_id
    ), '[]'::jsonb),
    (select count(*)::int from public.profile_likes where profile_user_id = p_target_user_id),
    exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_target_user_id)
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = p_target_user_id;
end;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- ============================================================
-- 4) toggle_like — กดถูกใจ/ยกเลิก (§7) PK (liker_id, profile_user_id) มีอยู่แล้วตั้งแต่เฟส 0
--    รองรับ toggle จริงในฟังก์ชันเดียว ไม่ต้องมี like/unlike แยก 2 endpoint
-- ============================================================
create or replace function public.toggle_like(p_target_user_id uuid)
returns table(liked boolean, count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_liked boolean;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_target_user_id = v_me then
    raise exception 'ถูกใจตัวเองไม่ได้';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_me)
  ) then
    raise exception 'ไม่พบผู้เล่นนี้';
  end if;

  if exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_target_user_id) then
    delete from public.profile_likes where liker_id = v_me and profile_user_id = p_target_user_id;
    v_liked := false;
  else
    insert into public.profile_likes (liker_id, profile_user_id) values (v_me, p_target_user_id);
    v_liked := true;
  end if;

  return query select v_liked, (select count(*)::int from public.profile_likes where profile_user_id = p_target_user_id);
end;
$$;

grant execute on function public.toggle_like(uuid) to authenticated;
