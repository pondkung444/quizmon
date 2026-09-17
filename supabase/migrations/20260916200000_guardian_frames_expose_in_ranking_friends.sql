-- Migration: guardian_frames_expose_in_ranking_friends
-- ต่อจาก guardian_profile_frames_schema_and_rewards — โชว์ equipped_frame_tier ในจุดที่เหลือที่
-- avatar โผล่ (อันดับ, ลิสต์เพื่อน, โปรไฟล์เพื่อน) ให้ครบตามที่ปอนด์ขอ "ทำครบทีเดียวทุกจุด"
-- ทุกฟังก์ชัน DROP ก่อนเพราะเพิ่มคอลัมน์ผล — ตั้งชื่อ equipped_frame_tier (ไม่ใช่ tier เฉยๆ)
-- กัน 42702 ambiguous กับ frame_definitions.tier ตามบทเรียนที่เจอมาก่อน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- get_ranking
-- ============================================================
drop function if exists public.get_ranking(text, text);

create function public.get_ranking(p_category text, p_scope text)
returns table(rank integer, user_id uuid, username text, pet_nickname text, pet_stage integer, pet_subline text, pet_personality text, egg_sprite_prefix text, egg_name_th text, score_value integer, is_me boolean, equipped_frame_tier text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if p_category not in ('weekly_training','consistency','achievement','collector') then
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
  if p_scope not in ('all','friends') then raise exception 'ขอบเขตไม่ถูกต้อง'; end if;

  return query
  with full_rank as (
    select * from public._ranking_full(p_category, v_me, p_scope)
  )
  select
    fr.rnk, fr.cand_id, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fr.score, fr.cand_id = v_me,
    rfd.tier
  from full_rank fr
  join public.profiles pr on pr.id = fr.cand_id
  left join public.pets pt on pt.id = public._ranking_pride_pet_id(fr.cand_id)
  left join public.egg_types et on et.id = pt.egg_type_id
  left join public.profile_settings rps on rps.user_id = fr.cand_id
  left join public.frame_definitions rfd on rfd.id = rps.equipped_frame_id
  where p_scope = 'friends' or fr.score is not null
  order by (fr.score is null) asc, fr.rnk asc nulls last, pr.username asc
  limit case when p_scope = 'all' then 50 else null end;
end;
$function$;

-- ============================================================
-- list_my_friends
-- ============================================================
drop function if exists public.list_my_friends();

create function public.list_my_friends()
returns table(friend_user_id uuid, username text, school text, grade_level text, friends_since timestamp with time zone, pet_nickname text, pet_stage integer, pet_subline text, pet_personality text, egg_sprite_prefix text, egg_name_th text, equipped_frame_tier text)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      coalesce(ps.pride_pet_id, ap.id) as pride_pet_id,
      ps.equipped_frame_id as friend_equipped_frame_id
    from fids fi
    left join public.profile_settings ps on ps.user_id = fi.friend_id
    left join public.pets ap on ap.user_id = fi.friend_id and ap.is_active = true and ps.pride_pet_id is null
  )
  select pd.friend_id, pr.username, pr.school, pr.grade_level, pd.friends_since,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fd.tier
  from pride pd
  join public.profiles pr on pr.id = pd.friend_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  left join public.frame_definitions fd on fd.id = pd.friend_equipped_frame_id
  order by pd.friends_since desc;
end;
$function$;

-- ============================================================
-- get_friend_profile
-- ============================================================
drop function if exists public.get_friend_profile(uuid);

create function public.get_friend_profile(p_friend_user_id uuid)
returns table(found boolean, friend_user_id uuid, username text, school text, grade_level text, pet_nickname text, pet_stage integer, pet_subline text, pet_personality text, egg_sprite_prefix text, egg_name_th text, stat_hp integer, stat_atk integer, stat_def integer, stat_spd integer, stat_foc integer, gear jsonb, medals jsonb, favorite_pets jsonb, training_days integer, questions_answered integer, stage4_pet_count integer, unique_evolution_patterns integer, top_challenge_cleared text, weekly_champion_count integer, like_count integer, liked_by_me boolean, equipped_frame_tier text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_pride_pet_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id_low = least(v_me, p_friend_user_id) and user_id_high = greatest(v_me, p_friend_user_id)
  ) then
    return query select
      false, null::uuid, null::text, null::text, null::text,
      null::text, null::int, null::text, null::text, null::text, null::text,
      null::int, null::int, null::int, null::int, null::int,
      null::jsonb, null::jsonb, null::jsonb,
      null::int, null::int, null::int, null::int, null::text, null::int,
      null::int, null::boolean, null::text;
    return;
  end if;

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = p_friend_user_id;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = p_friend_user_id and p.is_active = true limit 1;
  end if;

  return query
  select
    true,
    p_friend_user_id,
    pr.username, pr.school, pr.grade_level,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    pt.stat_hp, pt.stat_atk, pt.stat_def, pt.stat_spd, pt.stat_foc,
    coalesce((
      select jsonb_agg(jsonb_build_object('slot', rg.slot, 'quality', rg.quality, 'mainStat', rg.main_stat, 'mainValue', rg.main_value))
      from public.raid_gear_items rg
      where rg.equipped_pet_id = v_pride_pet_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'tier', ad.tier, 'imageFile', ad.image_file) order by upa.pin_order)
      from public.user_pinned_achievements upa
      join public.achievement_definitions ad on ad.id = upa.achievement_id
      where upa.user_id = p_friend_user_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'nickname', fp.nickname, 'stage', fp.stage::int, 'subline', fp.subline,
        'personality', fp.personality, 'eggSpritePrefix', fet.sprite_prefix, 'eggNameTh', fet.name_th
      ))
      from public.profile_settings fps
      cross join lateral unnest(fps.favorite_pet_ids) as fav_id
      join public.pets fp on fp.id = fav_id
      join public.egg_types fet on fet.id = fp.egg_type_id
      where fps.user_id = p_friend_user_id
    ), '[]'::jsonb),
    (
      select count(distinct (qa.created_at at time zone 'Asia/Bangkok')::date)::int
      from public.quiz_attempts qa where qa.user_id = p_friend_user_id
    ),
    (select count(*)::int from public.quiz_attempts qa where qa.user_id = p_friend_user_id),
    (select count(*)::int from public.pets p2 where p2.user_id = p_friend_user_id and p2.stage = 4),
    (
      select count(distinct (
        p3.egg_type_id || '|' ||
        case p3.subline
          when 'physics' then 'math'
          when 'chemistry' then 'balanced'
          when 'biology' then 'science'
          else p3.subline
        end || '|' || p3.personality
      ))::int
      from public.pets p3 where p3.user_id = p_friend_user_id and p3.stage = 4
    ),
    (
      select rt.name_th from public.raid_runs rr
      join public.raid_types rt on rt.id = rr.raid_type_id
      where rr.user_id = p_friend_user_id and rr.outcome = 'win'
      order by rt.sort_order desc limit 1
    ),
    (select count(*)::int from public.weekly_leaderboard_rewards wlr where wlr.user_id = p_friend_user_id),
    (select count(*)::int from public.profile_likes where profile_user_id = p_friend_user_id),
    exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_friend_user_id),
    ffd.tier
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  left join public.profile_settings ffps on ffps.user_id = p_friend_user_id
  left join public.frame_definitions ffd on ffd.id = ffps.equipped_frame_id
  where pr.id = p_friend_user_id;
end;
$function$;

commit;
