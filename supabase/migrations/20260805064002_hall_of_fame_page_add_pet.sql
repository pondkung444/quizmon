drop function if exists public.get_hall_of_fame_page(integer, integer);

create or replace function public.get_hall_of_fame_page(
  p_weeks_offset integer default 0,
  p_weeks_limit  integer default 10
)
returns table(
  week_start_date date,
  grade_band      text,
  user_id         uuid,
  username        text,
  total_points    integer,
  accuracy        numeric,
  claimed         boolean,
  pet_egg_type_id text,
  pet_subline     text,
  pet_personality text,
  pet_nickname    text,
  pet_from_week   boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_last_week_start date;
  v_cutoff date := '2026-07-27';
  v_week date;
  v_weeks_emitted integer := 0;
  v_weeks_skipped integer := 0;
  v_found boolean;
begin
  select wb.week_start_date - 7 into v_last_week_start
  from public.current_week_bounds_bkk() wb;
  v_week := v_last_week_start;
  while v_week >= v_cutoff and v_weeks_emitted < p_weeks_limit loop
    v_found := exists (
      select 1 from public.weekly_scores_bkk_for_week(v_week, null) limit 1
    );
    if v_found then
      if v_weeks_skipped < p_weeks_offset then
        v_weeks_skipped := v_weeks_skipped + 1;
      else
        return query
          select
            v_week,
            band.b,
            ranked.user_id,
            ranked.username,
            ranked.total_points,
            ranked.accuracy,
            exists (
              select 1 from public.weekly_leaderboard_rewards r
              where r.user_id = ranked.user_id and r.week_start_date = v_week
            ),
            pet.egg_type_id,
            pet.subline,
            pet.personality,
            pet.nickname,
            pet.in_week
          from (values ('junior'), ('senior')) as band(b)
          cross join lateral (
            select s.user_id, s.username, s.total_points, s.accuracy,
              (rank() over (order by s.total_points desc, s.accuracy desc))::integer as rnk
            from public.weekly_scores_bkk_for_week(v_week, band.b) s
          ) ranked
          left join lateral (
            select
              p.egg_type_id, p.subline, p.personality, p.nickname,
              (   (p.evolved_at at time zone 'Asia/Bangkok')::date >= v_week
              and (p.evolved_at at time zone 'Asia/Bangkok')::date <  v_week + 7
              ) as in_week
            from public.pets p
            where p.user_id = ranked.user_id
              and p.stage = 4
              and p.evolved_at is not null
            order by in_week desc, p.evolved_at desc
            limit 1
          ) pet on true
          where ranked.rnk = 1;
        v_weeks_emitted := v_weeks_emitted + 1;
      end if;
    end if;
    v_week := v_week - 7;
  end loop;
end;
$function$;
