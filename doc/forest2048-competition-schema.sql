-- Only the server may accept checkpoints. No learning, pet or currency writes.
create table public.forest2048_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 engine_version integer not null default 1,
 engine_state jsonb not null,
 revision bigint not null default 0 check(revision>=0),
 completed_rooms bigint not null default 0 check(completed_rooms>=0),
 total_swipes bigint not null default 0 check(total_swipes>=0),
 max_rune numeric not null default 0 check(max_rune>=0),
 bosses bigint not null default 0 check(bosses>=0),
 status text not null default 'active' check(status in ('active','failed','ended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), ended_at timestamptz
);
create index forest2048_runs_user_recent on public.forest2048_runs(user_id,created_at desc);
alter table public.forest2048_runs enable row level security;
revoke all on public.forest2048_runs from anon,authenticated;
grant select on public.forest2048_runs to authenticated;
grant all on public.forest2048_runs to service_role;
create policy forest2048_runs_owner on public.forest2048_runs for select to authenticated using ((select auth.uid())=user_id);
create table public.forest2048_scores (
 user_id uuid primary key references auth.users(id) on delete cascade,
 run_id uuid not null references public.forest2048_runs(id) on delete cascade,
 completed_rooms bigint not null check(completed_rooms>0),
 companion jsonb not null, updated_at timestamptz not null default now()
);
create index forest2048_scores_distance on public.forest2048_scores(completed_rooms desc);
create index forest2048_scores_run_reference on public.forest2048_scores(run_id);
alter table public.forest2048_scores enable row level security;
revoke all on public.forest2048_scores from anon,authenticated;
grant select on public.forest2048_scores to authenticated;
grant all on public.forest2048_scores to service_role;
create policy forest2048_scores_owner on public.forest2048_scores for select to authenticated using ((select auth.uid())=user_id);
create function public.forest2048_checkpoint(p_id uuid,p_user uuid,p_revision bigint,p_next bigint,p_state jsonb,p_rooms bigint,p_swipes bigint,p_rune numeric,p_bosses bigint,p_status text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update forest2048_runs set revision=p_next,engine_state=p_state,completed_rooms=p_rooms,total_swipes=p_swipes,max_rune=p_rune,bosses=p_bosses,status=p_status,updated_at=now(),ended_at=case when p_status<>'active' then coalesce(ended_at,now()) else null end
 where id=p_id and user_id=p_user and revision=p_revision and status='active';
 if not found then return false; end if;
 if p_rooms>0 then
 insert into forest2048_scores(user_id,run_id,completed_rooms,companion) values(p_user,p_id,p_rooms,p_state->'run'->'companion')
 on conflict(user_id) do update set run_id=excluded.run_id,completed_rooms=excluded.completed_rooms,companion=excluded.companion,updated_at=now()
 where excluded.completed_rooms>forest2048_scores.completed_rooms;
 end if;
 return true;
end $$;
revoke all on function public.forest2048_checkpoint(uuid,uuid,bigint,bigint,jsonb,bigint,bigint,numeric,bigint,text) from public,anon,authenticated;
grant execute on function public.forest2048_checkpoint(uuid,uuid,bigint,bigint,jsonb,bigint,bigint,numeric,bigint,text) to service_role;
create function public.forest2048_board(p_user uuid default null,p_page integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
 with ranked as (select s.user_id,rank() over(order by s.completed_rooms desc) as rank,s.completed_rooms as rooms,
 left(coalesce(nullif(p.username,''),'ผู้เล่น'),30) as name,
 jsonb_build_object('eggPrefix',s.companion->>'eggPrefix','lane',s.companion->>'lane','personality',s.companion->>'personality','image',s.companion->>'image') as companion
 from forest2048_scores s left join profiles p on p.id=s.user_id),
 top as (select rank,rooms,name,companion,user_id=p_user as mine from ranked order by rooms desc,name,user_id limit 20 offset greatest(0,p_page)*20)
 select jsonb_build_object('leaders',coalesce((select jsonb_agg(to_jsonb(top)) from top),'[]'::jsonb),'mine',(select jsonb_build_object('rank',rank,'rooms',rooms,'name',name,'companion',companion,'mine',true) from ranked where user_id=p_user),'players',(select count(*) from ranked));
$$;
revoke all on function public.forest2048_board(uuid,integer) from public,anon,authenticated;
grant execute on function public.forest2048_board(uuid,integer) to service_role;
create function public.forest2048_stats(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
 with mine as (select * from forest2048_runs where user_id=p_user),
 recent as (select id,completed_rooms as rooms,total_swipes as swipes,max_rune as "maxRune",bosses,status,created_at as date,
 jsonb_build_object('name',engine_state->'run'->'companion'->>'name','image',engine_state->'run'->'companion'->>'image') as companion
 from mine order by created_at desc limit 12)
 select jsonb_build_object('runs',(select count(*) from mine),'finished',(select count(*) from mine where status<>'active'),
 'best',coalesce((select max(completed_rooms) from mine),0),'swipes',coalesce((select sum(total_swipes) from mine),0),
 'bosses',coalesce((select sum(bosses) from mine),0),'maxRune',coalesce((select max(max_rune) from mine),0),
 'recent',coalesce((select jsonb_agg(to_jsonb(recent)) from recent),'[]'::jsonb));
$$;
revoke all on function public.forest2048_stats(uuid) from public,anon,authenticated;
grant execute on function public.forest2048_stats(uuid) to service_role;
