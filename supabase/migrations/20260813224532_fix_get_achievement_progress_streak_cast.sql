create or replace function public.get_achievement_progress(p_user_id uuid)
returns table(metric text, current_value integer)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not authorized to view achievement progress for another user';
  end if;

  return query
  with completed_days as (
    select dm.mission_date
    from public.daily_missions dm
    join public.quiz_attempts qa on qa.mission_id = dm.id
    where dm.user_id = p_user_id
    group by dm.mission_date, dm.target_count
    having count(qa.id) >= dm.target_count
  ),
  streak_groups as (
    select mission_date,
      mission_date - (row_number() over (order by mission_date))::int as grp
    from completed_days
  ),
  current_streak as (
    select count(*)::int as len
    from streak_groups
    where grp = (select grp from streak_groups order by mission_date desc limit 1)
  ),
  perfect_missions as (
    select dm.id
    from public.daily_missions dm
    join public.quiz_attempts qa on qa.mission_id = dm.id
    where dm.user_id = p_user_id
    group by dm.id, dm.target_count
    having count(qa.id) >= dm.target_count
       and count(qa.id) = count(*) filter (where qa.is_correct)
  ),
  normalized_patterns as (
    select
      egg_type_id || '|' ||
      case subline
        when 'physics' then 'math'
        when 'chemistry' then 'balanced'
        when 'biology' then 'science'
        else subline
      end || '|' || personality as pattern_key
    from public.pets
    where user_id = p_user_id and stage = 4
  )
  select 'training'::text, (select count(*)::int from public.quiz_attempts where user_id = p_user_id)
  union all
  select 'daily_days', (select count(*)::int from completed_days)
  union all
  select 'daily_streak', (select coalesce((select len from current_streak), 0)::int)
  union all
  select 'correct', (select count(*)::int from public.quiz_attempts where user_id = p_user_id and is_correct = true)
  union all
  select 'perfect_daily', (select count(*)::int from perfect_missions)
  union all
  select 'farm', (select count(*)::int from public.pets where user_id = p_user_id and stage = 4 and is_active = false)
  union all
  select 'unique_forms', (select count(distinct pattern_key)::int from normalized_patterns)
  union all
  select 'adventure_claim', (select count(*)::int from public.dungeon_runs where user_id = p_user_id and status = 'claimed' and claimed_at is not null)
  union all
  select 'gear_obtained', (select count(*)::int from public.raid_gear_items where owner_user_id = p_user_id)
  union all
  select 'challenge_hard_wins', (
    select count(*)::int from public.raid_runs rr
    join public.raid_types rt on rt.id = rr.raid_type_id
    where rr.user_id = p_user_id and rr.outcome = 'win' and rt.sort_order = 3
  );
end;
$$;
