begin;
set local lock_timeout = '5s';

create table public.pvp_config (
  id int primary key default 1 check (id = 1),
  raid_bonus_since timestamptz not null default now()
);
insert into public.pvp_config (id) values (1);

alter table public.pvp_config enable row level security;
create policy "pvp_config: authed read" on public.pvp_config
  for select to authenticated using (true);

comment on table public.pvp_config is
  'PvP ประลอง — ค่า config 1 แถว. raid_bonus_since = จุดตัดตั๋ว raid bonus (ไม่นับ run ที่จบก่อนหน้านี้).';

create or replace function public._pvp_grant_tickets(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_available int;
  v_granted_today int;
  v_want int;
  v_cap constant int := 15;
  v_daily constant int := 2;
  v_raid_since timestamptz;
begin
  if p_user_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('pvp_grant:' || p_user_id::text));

  select raid_bonus_since into v_raid_since from public.pvp_config where id = 1;

  select count(*) into v_available
  from public.pvp_tickets where user_id = p_user_id and consumed_at is null;

  select count(*) into v_granted_today
  from public.pvp_tickets
  where user_id = p_user_id and source = 'daily_free' and granted_day = v_today;

  v_want := least(v_daily - v_granted_today, v_cap - v_available);
  if v_want > 0 then
    insert into public.pvp_tickets (user_id, source, granted_day)
    select p_user_id, 'daily_free', v_today from generate_series(1, v_want);
    v_available := v_available + v_want;
  end if;

  if v_available < v_cap then
    insert into public.pvp_tickets (user_id, source, source_ref_id)
    select p_user_id, 'raid_bonus', r.id
    from public.raid_runs r
    where r.user_id = p_user_id
      and r.status = 'completed'
      and (v_raid_since is null or r.completed_at >= v_raid_since)
      and not exists (
        select 1 from public.pvp_tickets t
        where t.source = 'raid_bonus' and t.source_ref_id = r.id
      )
    order by r.completed_at asc nulls last
    limit (v_cap - v_available);
  end if;
end;
$$;

revoke execute on function public._pvp_grant_tickets(uuid) from anon, authenticated, public;

delete from public.pvp_tickets t
using public.raid_runs r, public.pvp_config c
where t.source = 'raid_bonus'
  and t.consumed_at is null
  and t.source_ref_id = r.id
  and r.completed_at < c.raid_bonus_since;

commit;