-- ============================================================
-- get_friend_profile — S05 เต็มรูปแบบ (§3.1/§4): ต่างจาก get_public_profile (เฟส 5) ตรงที่ต้องเป็น
-- เพื่อนกันจริงถึงจะเห็น และเห็นรายละเอียดมากกว่า (โรงเรียน/ระดับชั้น/สาย/บุคลิก/สเตตัส/อุปกรณ์/
-- เส้นทางของฉัน/Qmon ตัวโปรด) — ไม่ใช่เพื่อนกัน (หลุดมาจากไหนก็ตาม) → คืนแบบเดียวกับ "ไม่พบ" (defensive)
-- journey stats (training_days ... weekly_champion_count) คำนวณด้วย query เดียวกับ profileJourneyStats.ts
-- เป๊ะ (รวม normalizedSubline mapping physics→math/chemistry→balanced/biology→science) ห้ามคิดนิยามใหม่
-- ============================================================
create or replace function public.get_friend_profile(p_friend_user_id uuid)
returns table(
  found boolean,
  friend_user_id uuid,
  username text,
  school text,
  grade_level text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  stat_hp int,
  stat_atk int,
  stat_def int,
  stat_spd int,
  stat_foc int,
  gear jsonb,
  medals jsonb,
  favorite_pets jsonb,
  training_days int,
  questions_answered int,
  stage4_pet_count int,
  unique_evolution_patterns int,
  top_challenge_cleared text,
  weekly_champion_count int,
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
      null::int, null::boolean;
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
    exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_friend_user_id)
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = p_friend_user_id;
end;
$$;

grant execute on function public.get_friend_profile(uuid) to authenticated;
