-- Phase 0: idempotent repair for anonymous users whose auth trigger completed only partially.
create or replace function public.repair_guest_provisioning()
returns table (grade_level text, grade_band text, friend_code text, starter_egg_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_meta jsonb;
begin
  if v_uid is null or not exists (
    select 1 from auth.users where id = v_uid and is_anonymous is true
  ) then
    raise exception 'anonymous session required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));
  select raw_user_meta_data into v_meta from auth.users where id = v_uid;

  insert into public.profiles (id, username, grade_level, friend_code)
  values (
    v_uid,
    nullif(v_meta->>'username', ''),
    nullif(v_meta->>'grade_level', ''),
    public.generate_friend_code()
  )
  on conflict (id) do update
    set username = coalesce(public.profiles.username, excluded.username),
        grade_level = coalesce(public.profiles.grade_level, excluded.grade_level),
        friend_code = coalesce(public.profiles.friend_code, excluded.friend_code);

  if not exists (select 1 from public.pets where user_id = v_uid)
     and not exists (
       select 1 from public.player_eggs
       where user_id = v_uid and source = 'starter' and hatched_at is null
     ) then
    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_uid, 'egg_common_01', 'starter');
  end if;

  return query
  select p.grade_level, p.grade_band, p.friend_code,
    count(pe.id)::integer
  from public.profiles p
  left join public.player_eggs pe
    on pe.user_id = p.id and pe.source = 'starter' and pe.hatched_at is null
  where p.id = v_uid
  group by p.grade_level, p.grade_band, p.friend_code;
end;
$function$;

revoke all on function public.repair_guest_provisioning() from public;
revoke all on function public.repair_guest_provisioning() from anon;
grant execute on function public.repair_guest_provisioning() to authenticated;
