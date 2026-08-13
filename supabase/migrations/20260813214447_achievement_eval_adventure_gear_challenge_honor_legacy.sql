create or replace function public._eval_adventure(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claims as (
    select claimed_at, row_number() over (order by claimed_at asc) as rn
    from public.dungeon_runs
    where user_id = p_user_id and status = 'claimed' and claimed_at is not null
  ),
  claim_milestones(achievement_id, target) as (
    values ('adventure_claim_1',1),('adventure_claim_10',10),('adventure_claim_50',50),('adventure_claim_100',100)
  ),
  to_earn_claims as (
    select m.achievement_id, c.claimed_at as earned_at
    from claim_milestones m join claims c on c.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  first_rare_egg as (
    select dr.claimed_at as earned_at
    from public.dungeon_runs dr
    join public.egg_types et on et.id = dr.egg_type_id
    where dr.user_id = p_user_id and dr.egg_awarded and et.tier = 'rare'
    order by dr.claimed_at asc
    limit 1
  ),
  to_earn_egg(achievement_id, earned_at) as (
    select 'adventure_rare_egg_found', earned_at
    from first_rare_egg
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'adventure_rare_egg_found'
    )
  ),
  combined as (
    select achievement_id, earned_at from to_earn_claims
    union all
    select achievement_id, earned_at from to_earn_egg
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, achievement_id, earned_at from combined
  returning *;
end;
$$;

create or replace function public._eval_gear(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with owned as (
    select obtained_at, quality, row_number() over (order by obtained_at asc) as rn
    from public.raid_gear_items
    where owner_user_id = p_user_id
  ),
  obtain_milestones(achievement_id, target) as (
    values ('gear_obtained_1',1),('gear_obtained_10',10),('gear_obtained_30',30),('gear_obtained_75',75)
  ),
  to_earn_obtain as (
    select m.achievement_id, o.obtained_at as earned_at
    from obtain_milestones m join owned o on o.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  quality_ranked as (
    select code, row_number() over (order by sort_order desc) as rank_from_top
    from public.raid_gear_qualities
  ),
  first_good as (
    select rgi.obtained_at as earned_at
    from public.raid_gear_items rgi
    join quality_ranked qr on qr.code = rgi.quality
    where rgi.owner_user_id = p_user_id and qr.rank_from_top = 2
    order by rgi.obtained_at asc limit 1
  ),
  first_best as (
    select rgi.obtained_at as earned_at
    from public.raid_gear_items rgi
    join quality_ranked qr on qr.code = rgi.quality
    where rgi.owner_user_id = p_user_id and qr.rank_from_top = 1
    order by rgi.obtained_at asc limit 1
  ),
  to_earn_quality as (
    select 'gear_good_quality_first' as achievement_id, earned_at from first_good
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'gear_good_quality_first'
    )
    union all
    select 'gear_best_quality_first', earned_at from first_best
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'gear_best_quality_first'
    )
  ),
  full_loadout as (
    select p.id as pet_id, p.nickname
    from public.pets p
    where p.user_id = p_user_id
      and exists (select 1 from public.raid_gear_items g where g.equipped_pet_id = p.id and g.slot = 'head')
      and exists (select 1 from public.raid_gear_items g where g.equipped_pet_id = p.id and g.slot = 'body')
      and exists (select 1 from public.raid_gear_items g where g.equipped_pet_id = p.id and g.slot = 'feet')
    limit 1
  ),
  to_earn_loadout as (
    select 'gear_full_loadout' as achievement_id, now() as earned_at, pet_id, nickname
    from full_loadout
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'gear_full_loadout'
    )
  ),
  combined as (
    select achievement_id, earned_at, null::uuid as pet_id, null::text as nickname from to_earn_obtain
    union all
    select achievement_id, earned_at, null::uuid, null::text from to_earn_quality
    union all
    select achievement_id, earned_at, pet_id, nickname from to_earn_loadout
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at, pet_id, pet_name_snapshot)
  select p_user_id, achievement_id, earned_at, pet_id, nickname from combined
  returning *;
end;
$$;

create or replace function public._eval_challenge(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with wins as (
    select rr.completed_at, rt.sort_order
    from public.raid_runs rr
    join public.raid_types rt on rt.id = rr.raid_type_id
    where rr.user_id = p_user_id and rr.outcome = 'win'
  ),
  first_easy as (select min(completed_at) as earned_at from wins where sort_order = 1),
  first_medium as (select min(completed_at) as earned_at from wins where sort_order = 2),
  first_hard as (select min(completed_at) as earned_at from wins where sort_order = 3),
  hard_wins_ranked as (
    select completed_at, row_number() over (order by completed_at asc) as rn
    from wins where sort_order = 3
  ),
  to_earn as (
    select 'challenge_easy_first_win' as achievement_id, earned_at from first_easy
    where earned_at is not null and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'challenge_easy_first_win'
    )
    union all
    select 'challenge_medium_first_win', earned_at from first_medium
    where earned_at is not null and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'challenge_medium_first_win'
    )
    union all
    select 'challenge_hard_first_win', earned_at from first_hard
    where earned_at is not null and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'challenge_hard_first_win'
    )
    union all
    select 'challenge_hard_wins_50', completed_at from hard_wins_ranked
    where rn = 50 and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = 'challenge_hard_wins_50'
    )
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, achievement_id, earned_at from to_earn
  returning *;
end;
$$;

create or replace function public._eval_honor(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with first_win as (
    select awarded_at as earned_at
    from public.weekly_leaderboard_rewards
    where user_id = p_user_id
    order by awarded_at asc
    limit 1
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, 'weekly_champion_first', earned_at
  from first_win
  where not exists (
    select 1 from public.user_achievements ua
    where ua.user_id = p_user_id and ua.achievement_id = 'weekly_champion_first'
  )
  returning *;
end;
$$;

create or replace function public._eval_legacy(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, 'legacy_pioneer_tester', now()
  where exists (
    select 1 from public.achievement_tester_eligibility e
    where e.user_id = p_user_id and e.eligible
  )
  and not exists (
    select 1 from public.user_achievements ua
    where ua.user_id = p_user_id and ua.achievement_id = 'legacy_pioneer_tester'
  )
  returning *;
end;
$$;

create or replace function public.evaluate_achievements(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not authorized to evaluate achievements for another user';
  end if;

  return query select * from public._eval_training(p_user_id);
  return query select * from public._eval_accuracy(p_user_id);
  return query select * from public._eval_consistency(p_user_id);
  return query select * from public._eval_growth(p_user_id);
  return query select * from public._eval_stats(p_user_id);
  return query select * from public._eval_collection(p_user_id);
  return query select * from public._eval_adventure(p_user_id);
  return query select * from public._eval_gear(p_user_id);
  return query select * from public._eval_challenge(p_user_id);
  return query select * from public._eval_honor(p_user_id);
end;
$$;

grant execute on function public.evaluate_achievements(uuid) to authenticated;
