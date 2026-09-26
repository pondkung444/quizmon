-- Fix: premium_check_biweekly_egg() v2 only checked that the candidate pair's OWN
-- pair_end_week hadn't been awarded, but dropped v1's check that the earlier week of
-- the pair isn't already the LATER week of a previously-awarded pair (or vice versa).
-- Result: a student hitting the goal every week got an egg every week (weeks1+2,
-- 2+3, 3+4, ...) instead of one per two weeks, because week 2 was double-counted.
--
-- Fix: also require that no award exists at pair_end_week = candidate-7 or candidate+7
-- (the candidate's immediate neighbours), so two awarded pairs can never share a week.
-- The "recover a missed previous pair" behaviour (checking both v_prev and v_week each
-- call) is unchanged.
create or replace function public.premium_check_biweekly_egg()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_week      date;
  v_prev      date;
  v_candidate date;
  v_inserted  date;
  v_awarded   boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (
    select 1 from public.self_serve_enrollment e
     where e.student_id = v_uid and e.status = 'active' and now() < e.expires_at
  ) then
    return false;
  end if;

  select wb.week_start_date into v_week from public.current_week_bounds_bkk() wb;
  v_prev := v_week - 7;

  foreach v_candidate in array array[v_prev, v_week]
  loop
    if exists (select 1 from public.guardian_goal_reached_weeks g where g.student_id = v_uid and g.week_start = v_candidate)
       and exists (select 1 from public.guardian_goal_reached_weeks g where g.student_id = v_uid and g.week_start = v_candidate - 7)
       and not exists (select 1 from public.premium_goal_egg_awards a where a.student_id = v_uid and a.pair_end_week = v_candidate)
       and not exists (select 1 from public.premium_goal_egg_awards a where a.student_id = v_uid and a.pair_end_week in (v_candidate - 7, v_candidate + 7))
    then
      insert into public.premium_goal_egg_awards (student_id, pair_end_week)
      values (v_uid, v_candidate)
      on conflict do nothing
      returning pair_end_week into v_inserted;

      if v_inserted is not null then
        insert into public.player_eggs (user_id, egg_type_id, source)
        values (v_uid, 'egg_epic_02', 'premium_biweekly_goal');
        v_awarded := true;
      end if;
    end if;
  end loop;

  return v_awarded;
end;
$$;
