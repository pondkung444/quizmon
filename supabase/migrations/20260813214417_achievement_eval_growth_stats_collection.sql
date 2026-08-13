create or replace function public._eval_growth(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with first_stage2 as (
    select id as pet_id, nickname from public.pets
    where user_id = p_user_id and stage >= 2
    order by hatched_at asc, created_at asc
    limit 1
  ),
  first_stage3 as (
    select id as pet_id, nickname from public.pets
    where user_id = p_user_id and stage >= 3
    order by hatched_at asc, created_at asc
    limit 1
  ),
  first_stage4 as (
    select id as pet_id, nickname, evolved_at from public.pets
    where user_id = p_user_id and stage >= 4
    order by evolved_at asc nulls last
    limit 1
  ),
  first_feed as (
    select pf.pet_id, p.nickname, pf.created_at as earned_at
    from public.pet_feedings pf
    join public.pets p on p.id = pf.pet_id
    where pf.user_id = p_user_id
    order by pf.created_at asc
    limit 1
  ),
  first_named as (
    select id as pet_id, nickname from public.pets
    where user_id = p_user_id and nickname is not null
    order by hatched_at asc, created_at asc
    limit 1
  ),
  candidates(achievement_id, pet_id, nickname, earned_at) as (
    select 'first_qmon_stage_2', pet_id, nickname, now() from first_stage2
    union all
    select 'first_qmon_stage_3', pet_id, nickname, now() from first_stage3
    union all
    select 'first_qmon_stage_4', pet_id, nickname, coalesce(evolved_at, now()) from first_stage4
    union all
    select 'first_feeding', pet_id, nickname, earned_at from first_feed
    union all
    select 'first_qmon_name', pet_id, nickname, now() from first_named
  ),
  to_earn as (
    select c.* from candidates c
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = c.achievement_id
    )
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at, pet_id, pet_name_snapshot)
  select p_user_id, achievement_id, earned_at, pet_id, nickname from to_earn
  returning *;
end;
$$;

create or replace function public._eval_stats(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with capped as (
    select p.id as pet_id, p.nickname, p.evolved_at,
      (p.stat_hp  >= (et.stat_profile->'caps'->>'hp')::int)  as hp_capped,
      (p.stat_atk >= (et.stat_profile->'caps'->>'atk')::int) as atk_capped,
      (p.stat_def >= (et.stat_profile->'caps'->>'def')::int) as def_capped
    from public.pets p
    join public.egg_types et on et.id = p.egg_type_id
    where p.user_id = p_user_id and p.stage = 4
  ),
  first_balance as (
    select id as pet_id, nickname from public.pets
    where user_id = p_user_id and subline = 'balanced'
    order by hatched_at asc
    limit 1
  ),
  first_balance_stage4 as (
    select id as pet_id, nickname, evolved_at from public.pets
    where user_id = p_user_id and subline = 'balanced' and stage = 4
    order by evolved_at asc
    limit 1
  ),
  first_hp as (select pet_id, nickname, evolved_at from capped where hp_capped order by evolved_at asc limit 1),
  first_atk as (select pet_id, nickname, evolved_at from capped where atk_capped order by evolved_at asc limit 1),
  first_def as (select pet_id, nickname, evolved_at from capped where def_capped order by evolved_at asc limit 1),
  first_two as (
    select pet_id, nickname, evolved_at from capped
    where (hp_capped::int + atk_capped::int + def_capped::int) >= 2
    order by evolved_at asc limit 1
  ),
  first_three as (
    select pet_id, nickname, evolved_at from capped
    where hp_capped and atk_capped and def_capped
    order by evolved_at asc limit 1
  ),
  candidates(achievement_id, pet_id, nickname, earned_at) as (
    select 'first_balance_line', pet_id, nickname, now() from first_balance
    union all
    select 'balance_stage_4', pet_id, nickname, coalesce(evolved_at, now()) from first_balance_stage4
    union all
    select 'hp_cap', pet_id, nickname, coalesce(evolved_at, now()) from first_hp
    union all
    select 'atk_cap', pet_id, nickname, coalesce(evolved_at, now()) from first_atk
    union all
    select 'def_cap', pet_id, nickname, coalesce(evolved_at, now()) from first_def
    union all
    select 'two_core_stat_caps', pet_id, nickname, coalesce(evolved_at, now()) from first_two
    union all
    select 'three_core_stat_caps', pet_id, nickname, coalesce(evolved_at, now()) from first_three
  ),
  to_earn as (
    select c.* from candidates c
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = c.achievement_id
    )
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at, pet_id, pet_name_snapshot)
  select p_user_id, achievement_id, earned_at, pet_id, nickname from to_earn
  returning *;
end;
$$;

create or replace function public._eval_collection(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with farm_pets as (
    select id as pet_id, nickname,
      row_number() over (order by updated_at asc) as rn
    from public.pets
    where user_id = p_user_id and stage = 4 and is_active = false
  ),
  farm_milestones(achievement_id, target) as (
    values ('farm_qmon_1',1),('farm_qmon_5',5),('farm_qmon_10',10),('farm_qmon_15',15)
  ),
  to_earn_farm as (
    select m.achievement_id, f.pet_id, f.nickname, now() as earned_at
    from farm_milestones m
    join farm_pets f on f.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  normalized_patterns as (
    select id as pet_id, evolved_at,
      egg_type_id || '|' ||
      case subline
        when 'physics' then 'math'
        when 'chemistry' then 'balanced'
        when 'biology' then 'science'
        else subline
      end || '|' || personality as pattern_key
    from public.pets
    where user_id = p_user_id and stage = 4
  ),
  pattern_first_seen as (
    select pattern_key, min(evolved_at) as first_evolved_at
    from normalized_patterns
    group by pattern_key
  ),
  ranked_patterns as (
    select pattern_key, first_evolved_at,
      row_number() over (order by first_evolved_at asc) as rn
    from pattern_first_seen
  ),
  pattern_milestones(achievement_id, target) as (
    values ('unique_stage4_forms_3',3),('unique_stage4_forms_6',6),('unique_stage4_forms_12',12)
  ),
  to_earn_patterns as (
    select m.achievement_id, null::uuid as pet_id, null::text as nickname, r.first_evolved_at as earned_at
    from pattern_milestones m
    join ranked_patterns r on r.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  combined as (
    select achievement_id, pet_id, nickname, earned_at from to_earn_farm
    union all
    select achievement_id, pet_id, nickname, earned_at from to_earn_patterns
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at, pet_id, pet_name_snapshot)
  select p_user_id, achievement_id, earned_at, pet_id, nickname from combined
  returning *;
end;
$$;
