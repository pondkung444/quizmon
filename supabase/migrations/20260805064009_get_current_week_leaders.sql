create or replace function public.get_current_week_leaders()
returns table(
  week_start      timestamptz,
  week_end        timestamptz,
  grade_band      text,
  user_id         uuid,
  username        text,
  total_points    integer,
  accuracy        numeric,
  pet_egg_type_id text,
  pet_subline     text,
  pet_personality text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    wb.week_start, wb.week_end, band.b,
    ranked.user_id, ranked.username, ranked.total_points, ranked.accuracy,
    pet.egg_type_id, pet.subline, pet.personality
  from public.current_week_bounds_bkk() wb
  cross join (values ('junior'), ('senior')) as band(b)
  cross join lateral (
    select s.user_id, s.username, s.total_points, s.accuracy,
      (rank() over (order by s.total_points desc, s.accuracy desc))::integer as rnk
    from public.weekly_scores_bkk(band.b) s
  ) ranked
  left join lateral (
    select p.egg_type_id, p.subline, p.personality
    from public.pets p
    where p.user_id = ranked.user_id and p.stage = 4 and p.evolved_at is not null
    order by p.evolved_at desc
    limit 1
  ) pet on true
  where ranked.rnk = 1;
$function$;
grant execute on function public.get_current_week_leaders() to anon, authenticated;
