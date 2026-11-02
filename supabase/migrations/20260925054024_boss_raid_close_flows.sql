set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.close_boss_raid(p_boss_raid_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.boss_raid_sessions;
  v_result text;
  v_classroom uuid;
begin
  select * into v_s from public.boss_raid_sessions where id = p_boss_raid_session_id;
  if not found or v_s.teacher_id <> auth.uid() then
    raise exception 'not_authorized_or_not_found';
  end if;

  if v_s.status <> 'ended' then
    v_result := public.resolve_boss_raid_session(p_boss_raid_session_id, 'host_ended');
  else
    v_result := v_s.result;
  end if;

  select cbr.classroom_session_id into v_classroom
  from public.classroom_boss_raids cbr
  where cbr.boss_raid_session_id = p_boss_raid_session_id;

  update public.classroom_sessions
  set current_activity = null
  where id = v_classroom
    and status <> 'ended'
    and current_activity = 'boss_raid'
    and active_boss_raid_session_id = p_boss_raid_session_id;

  return jsonb_build_object('result', v_result, 'classroom_session_id', v_classroom);
end;
$$;

grant execute on function public.close_boss_raid(uuid) to authenticated;

create or replace function public.classroom_end_open_boss_raids()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_raid uuid;
begin
  for v_raid in
    select b.id
    from public.classroom_boss_raids cbr
    join public.boss_raid_sessions b on b.id = cbr.boss_raid_session_id
    where cbr.classroom_session_id = new.id and b.status <> 'ended'
  loop
    perform public.resolve_boss_raid_session(v_raid, 'host_ended');
  end loop;
  return new;
end;
$$;

revoke all on function public.classroom_end_open_boss_raids() from public, anon, authenticated;

create trigger classroom_sessions_end_open_boss_raids
  after update of status on public.classroom_sessions
  for each row
  when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function public.classroom_end_open_boss_raids();