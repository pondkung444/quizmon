create or replace function public._eval_training(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with ranked as (
    select created_at, row_number() over (order by created_at asc, id asc) as rn
    from public.quiz_attempts
    where user_id = p_user_id
  ),
  milestones(achievement_id, target) as (
    values ('training_10',10),('training_50',50),('training_100',100),
           ('training_250',250),('training_500',500),('training_1000',1000)
  ),
  to_earn as (
    select m.achievement_id, r.created_at as earned_at
    from milestones m
    join ranked r on r.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, achievement_id, earned_at from to_earn
  returning *;
end;
$$;

create or replace function public._eval_accuracy(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with ranked_correct as (
    select created_at, row_number() over (order by created_at asc, id asc) as rn
    from public.quiz_attempts
    where user_id = p_user_id and is_correct = true
  ),
  correct_milestones(achievement_id, target) as (
    values ('correct_10',10),('correct_50',50),('correct_250',250),('correct_700',700)
  ),
  to_earn_correct as (
    select m.achievement_id, r.created_at as earned_at
    from correct_milestones m
    join ranked_correct r on r.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  perfect_missions as (
    select dm.id, dm.mission_date,
           count(qa.id) as attempt_count,
           count(*) filter (where qa.is_correct) as correct_count,
           max(qa.created_at) as finished_at
    from public.daily_missions dm
    join public.quiz_attempts qa on qa.mission_id = dm.id
    where dm.user_id = p_user_id
    group by dm.id, dm.mission_date, dm.target_count
    having count(qa.id) >= dm.target_count
       and count(qa.id) = count(*) filter (where qa.is_correct)
  ),
  ranked_perfect as (
    select finished_at, row_number() over (order by mission_date asc, finished_at asc) as rn
    from perfect_missions
  ),
  perfect_milestones(achievement_id, target) as (
    values ('perfect_daily_1',1),('perfect_daily_3',3),('perfect_daily_10',10),('perfect_daily_20',20)
  ),
  to_earn_perfect as (
    select m.achievement_id, r.finished_at as earned_at
    from perfect_milestones m
    join ranked_perfect r on r.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  combined as (
    select achievement_id, earned_at from to_earn_correct
    union all
    select achievement_id, earned_at from to_earn_perfect
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, achievement_id, earned_at from combined
  returning *;
end;
$$;

create or replace function public._eval_consistency(p_user_id uuid)
returns setof public.user_achievements
language plpgsql security definer set search_path = public as $$
begin
  return query
  with completed_days as (
    select dm.mission_date, max(qa.created_at) as finished_at
    from public.daily_missions dm
    join public.quiz_attempts qa on qa.mission_id = dm.id
    where dm.user_id = p_user_id
    group by dm.mission_date, dm.target_count
    having count(qa.id) >= dm.target_count
  ),
  ranked_days as (
    select finished_at, row_number() over (order by mission_date asc) as rn
    from completed_days
  ),
  days_milestones(achievement_id, target) as (
    values ('daily_days_2',2),('daily_days_5',5),('daily_days_10',10),
           ('daily_days_20',20),('daily_days_45',45),('daily_days_90',90)
  ),
  to_earn_days as (
    select m.achievement_id, r.finished_at as earned_at
    from days_milestones m
    join ranked_days r on r.rn = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
  ),
  streak_groups as (
    select mission_date, finished_at,
      mission_date - (row_number() over (order by mission_date))::int as grp
    from completed_days
  ),
  streak_lengths as (
    select mission_date, finished_at,
      row_number() over (partition by grp order by mission_date) as streak_len
    from streak_groups
  ),
  streak_milestones(achievement_id, target) as (
    values ('daily_streak_3',3),('daily_streak_7',7),('daily_streak_15',15),('daily_streak_30',30)
  ),
  to_earn_streak as (
    select m.achievement_id, min(sl.finished_at) as earned_at
    from streak_milestones m
    join streak_lengths sl on sl.streak_len = m.target
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = m.achievement_id
    )
    group by m.achievement_id
  ),
  combined as (
    select achievement_id, earned_at from to_earn_days
    union all
    select achievement_id, earned_at from to_earn_streak
  )
  insert into public.user_achievements(user_id, achievement_id, earned_at)
  select p_user_id, achievement_id, earned_at from combined
  returning *;
end;
$$;
