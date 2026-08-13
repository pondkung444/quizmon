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
