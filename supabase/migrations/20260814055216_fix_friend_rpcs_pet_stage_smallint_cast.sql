-- pets.stage is smallint, but search_friend_code()/list_my_friend_requests() declared their
-- pet_stage OUT column as int and selected pt.stage raw — RETURN QUERY requires an exact type
-- match, so both blew up with "structure of query does not match function result type" at
-- runtime. Cast pt.stage::int in both.

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
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th, pd.created_at
  from pride pd
  join public.profiles pr on pr.id = pd.other_user_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  order by pd.created_at desc;
end;
$$;
