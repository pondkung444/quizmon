-- Dedicated student-test board: derive progress only from server-validated three-act snapshots.
-- Legacy Endless scores and checkpoints remain compatible.
create or replace function public.forest2048_acts_board(p_user uuid default null, p_page integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
 with eligible as (
  select r.*, least(30,jsonb_array_length(coalesce(r.engine_state->'run'->'history','[]'::jsonb))) as rooms
  from public.forest2048_runs r
  where r.engine_state->'run'->>'journeyVersion'='1'
    and r.engine_state->'run'->>'mechanicsVersion'='1'
    and r.engine_state->'run'->>'contentVersion'='1'
 ), best as (
  select distinct on (user_id) user_id,rooms,engine_state->'run'->'companion' as companion
  from eligible where rooms>0 order by user_id,rooms desc,created_at,id
 ), ranked as (
  select b.user_id,rank() over(order by b.rooms desc) as rank,b.rooms,
   left(coalesce(nullif(p.username,''),'ผู้เล่น'),30) as name,
   jsonb_build_object('image',b.companion->>'image') as companion
  from best b left join public.profiles p on p.id=b.user_id
 ), top as (
  select rank,rooms,name,companion,coalesce(user_id=p_user,false) as mine
  from ranked order by rooms desc,name,user_id limit 20 offset greatest(0,p_page)*20
 )
 select jsonb_build_object(
  'leaders',coalesce((select jsonb_agg(to_jsonb(top)) from top),'[]'::jsonb),
  'mine',(select jsonb_build_object('rank',rank,'rooms',rooms,'name',name,'companion',companion,'mine',true) from ranked where user_id=p_user),
  'players',(select count(*) from ranked));
$$;

create or replace function public.forest2048_acts_stats(p_user uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 with mine as (
  select r.*,least(30,jsonb_array_length(coalesce(r.engine_state->'run'->'history','[]'::jsonb))) as rooms,
   (select count(*) from jsonb_array_elements(coalesce(r.engine_state->'run'->'history','[]'::jsonb)) h where h->>'boss'='true') as act_bosses
  from public.forest2048_runs r where user_id=p_user
   and r.engine_state->'run'->>'journeyVersion'='1'
   and r.engine_state->'run'->>'mechanicsVersion'='1'
   and r.engine_state->'run'->>'contentVersion'='1'
 ), recent as (
  select rooms,total_swipes as swipes,max_rune as "maxRune",act_bosses as bosses,status,
   engine_state->'run'->>'phase'='complete' as completed,created_at as date,
   jsonb_build_object('name',engine_state->'run'->'companion'->>'name','image',engine_state->'run'->'companion'->>'image') as companion
  from mine order by created_at desc,id desc limit 12
 )
 select jsonb_build_object('runs',(select count(*) from mine),
  'finished',(select count(*) from mine where status<>'active'),
  'best',coalesce((select max(rooms) from mine),0),
  'swipes',coalesce((select sum(total_swipes) from mine),0),
  'bosses',coalesce((select sum(act_bosses) from mine),0),
  'maxRune',coalesce((select max(max_rune) from mine),0),
  'recent',coalesce((select jsonb_agg(to_jsonb(recent)) from recent),'[]'::jsonb));
$$;
revoke all on function public.forest2048_acts_board(uuid,integer) from public,anon,authenticated;
revoke all on function public.forest2048_acts_stats(uuid) from public,anon,authenticated;
grant execute on function public.forest2048_acts_board(uuid,integer) to service_role;
grant execute on function public.forest2048_acts_stats(uuid) to service_role;
