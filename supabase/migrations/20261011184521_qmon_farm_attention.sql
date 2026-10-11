-- Additive opt-in only. No project, wallet, progress or existing preference updates.
create table public.farm_notification_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false
);
alter table public.farm_notification_settings enable row level security;
create policy farm_notification_read on public.farm_notification_settings for select to authenticated using(user_id=(select auth.uid()));
grant select on public.farm_notification_settings to authenticated;
grant all on public.farm_notification_settings to service_role;

create function public.farm_attention(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with jobs as (
 select status,ready_at from public.farm_school_projects where user_id=p_user
 union all select status,ready_at from public.farm_garden_projects where user_id=p_user
 union all select status,ready_at from public.farm_projects where user_id=p_user
 ), counts as (
 select count(*) filter(where status='puzzle' or (status='building' and ready_at<=now())) help,
 count(*) filter(where status='ready' or (status='finishing' and ready_at<=now())) place,
 min(ready_at) filter(where status in ('building','finishing') and ready_at>now()) next_at from jobs
 ) select jsonb_build_object('help',help,'place',place,'nextAt',next_at,'serverNow',now(),
 'unread',(select count(*) from public.farm_stickers s where s.recipient_id=p_user and s.read_at is null and s.day>=(now() at time zone 'Asia/Bangkok')::date-30 and exists(select 1 from public.friendships f where f.user_id_low=least(s.sender_id,p_user) and f.user_id_high=greatest(s.sender_id,p_user)) and not exists(select 1 from public.blocks b where (b.blocker_id=s.sender_id and b.blocked_id=p_user) or (b.blocker_id=p_user and b.blocked_id=s.sender_id)))) from counts
$$;
create function public.farm_notification_preference(p_user uuid,p_enabled boolean default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 if p_enabled is not null then
 insert into public.farm_notification_settings values(p_user,p_enabled) on conflict(user_id) do update set enabled=excluded.enabled;
 end if;
 return coalesce((select enabled from public.farm_notification_settings where user_id=p_user),false);
end $$;
create function public.farm_notification_recipients() returns table(user_id uuid,device_id uuid,token text,platform text) language sql stable security invoker set search_path='' as $$
 select s.user_id,d.id,d.fcm_token,d.platform from public.farm_notification_settings s
 join public.push_preferences p on p.user_id=s.user_id and p.push_enabled
 cross join lateral (select x.id,x.fcm_token,x.platform from public.push_devices x where x.user_id=s.user_id and x.enabled and x.permission_status='granted' and x.invalidated_at is null order by x.last_seen_at desc,x.id limit 1) d
 cross join lateral (select public.farm_attention(s.user_id) value) a
 where s.enabled and ((a.value->>'help')::int+(a.value->>'place')::int+(a.value->>'unread')::int)>0
 and not exists(select 1 from public.notification_jobs j where j.idempotency_key=s.user_id::text||':farm_attention:'||(now() at time zone 'Asia/Bangkok')::date::text)
$$;
revoke all on function public.farm_attention(uuid),public.farm_notification_preference(uuid,boolean),public.farm_notification_recipients() from public,anon,authenticated;
grant execute on function public.farm_attention(uuid),public.farm_notification_preference(uuid,boolean),public.farm_notification_recipients() to service_role;
