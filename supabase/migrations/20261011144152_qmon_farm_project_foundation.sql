-- Additive foundation. Legacy rows remain authoritative; no balance/backfill writes.
create table public.farm_catalogue (
 id text primary key, version integer not null check(version>0), definition jsonb not null,
 enabled boolean not null default false,
 check(jsonb_typeof(definition)='object')
);
insert into public.farm_catalogue(id,version,definition)
select id,1,jsonb_build_object('place',place,'schoolLevel',level,'targetLevel',target,'blueprint',blueprint,
 'prerequisite',prerequisite,'price',price,'firstReward',reward,'limit',cap,'leaderStage',stage,
 'waits',waits,'puzzleSeconds',timer,'contentVersion',1,'penaltyPercent',20,'helperPercent',10,'areaCap',24,'schoolCapacity',jsonb_build_array(jsonb_build_object('jobs',0,'helpers',0),jsonb_build_object('jobs',1,'helpers',0),jsonb_build_object('jobs',2,'helpers',1),jsonb_build_object('jobs',2,'helpers',2),jsonb_build_object('jobs',3,'helpers',3)))
from (values
 ('garden','garden',1,null::int,'garden-rest-v1','{}'::jsonb,40,20,4,2,array[300,300],180),
 ('school-2','school',1,2,null,'{"garden":1}'::jsonb,40,30,1,2,array[21600,28800,28800],180),
 ('pond','pond',2,null,'pond-cycle-v1','{}'::jsonb,50,20,3,2,array[28800,28800,28800],180),
 ('flower','flower',2,null,'flower-photosynthesis-v1','{}'::jsonb,50,20,3,3,array[28800,28800,28800],240),
 ('school-3','school',2,3,null,'{"pond":1}'::jsonb,100,40,1,3,array[43200,43200,43200,43200],240),
 ('bridge','bridge',3,null,'bridge-balance-v1','{}'::jsonb,90,30,2,3,array[43200,43200,43200,43200],240),
 ('school-4','school',3,4,null,'{"flower":1,"bridge":1}'::jsonb,160,60,1,4,array[57600,57600,57600,57600,57600],300),
 ('observatory','observatory',4,null,'observatory-orbits-v1','{}'::jsonb,150,40,1,4,array[64800,64800,64800,64800,64800],300)
) c(id,place,level,target,blueprint,prerequisite,price,reward,cap,stage,waits,timer);

create table public.farm_projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, catalogue_id text not null references public.farm_catalogue(id),
 rules_snapshot jsonb not null, reward_eligible boolean not null, reward_key text not null,
 status text not null check(status in ('building','puzzle','finishing','paused','ready','placed')),
 resume_status text check(resume_status in ('building','puzzle','finishing')),
 checkpoint integer not null default 0 check(checkpoint>=0), ready_at timestamptz,
 remaining_seconds integer not null check(remaining_seconds>=0), helper_count integer not null default 0 check(helper_count between 0 and 3),
 round_deadline timestamptz, failures integer not null default 0 check(failures>=0),
 penalty_applied boolean not null default false, tile_x integer, tile_y integer,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(user_id,request_id), check((tile_x is null)=(tile_y is null)),
 check((status='paused')=(resume_status is not null)),
 check(jsonb_typeof(rules_snapshot)='object')
);
create index farm_projects_owner_status on public.farm_projects(user_id,status);
create index farm_projects_catalogue on public.farm_projects(catalogue_id);
create table public.farm_project_assignments (
 project_id uuid not null references public.farm_projects(id) on delete cascade,
 pet_id uuid not null references public.pets(id) on delete cascade,
 role text not null check(role in ('leader','helper')), primary key(project_id,pet_id), unique(pet_id)
);
create unique index farm_project_one_leader on public.farm_project_assignments(project_id) where role='leader';
create table public.farm_project_contributions (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.farm_projects(id) on delete cascade,
 pet_id uuid references public.pets(id) on delete set null, role text not null check(role in ('leader','helper')),
 joined_at timestamptz not null default now(), left_at timestamptz
);
create index farm_contributions_project on public.farm_project_contributions(project_id);
create index farm_contributions_pet on public.farm_project_contributions(pet_id);
-- Full puzzle/answer JSON is server-only, even to its owner.
create table public.farm_project_checkpoints (
 project_id uuid not null references public.farm_projects(id) on delete cascade,
 checkpoint integer not null check(checkpoint>=0), content_version integer not null check(content_version>0),
 puzzle jsonb, draft jsonb, completed_at timestamptz, primary key(project_id,checkpoint)
);

alter table public.farm_catalogue enable row level security;
alter table public.farm_projects enable row level security;
alter table public.farm_project_assignments enable row level security;
alter table public.farm_project_contributions enable row level security;
alter table public.farm_project_checkpoints enable row level security;
revoke all on public.farm_catalogue,public.farm_projects,public.farm_project_assignments,public.farm_project_contributions,public.farm_project_checkpoints from public,anon,authenticated;
grant select on public.farm_catalogue,public.farm_projects,public.farm_project_assignments,public.farm_project_contributions to authenticated;
grant all on public.farm_catalogue,public.farm_projects,public.farm_project_assignments,public.farm_project_contributions,public.farm_project_checkpoints to service_role;
grant usage,select on sequence public.farm_project_contributions_id_seq to service_role;
create policy farm_catalogue_read on public.farm_catalogue for select to authenticated using(true);
create policy farm_projects_owner on public.farm_projects for select to authenticated using(user_id=(select auth.uid()));
create policy farm_assignments_owner on public.farm_project_assignments for select to authenticated using(exists(select 1 from public.farm_projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy farm_contributions_owner on public.farm_project_contributions for select to authenticated using(exists(select 1 from public.farm_projects p where p.id=project_id and p.user_id=(select auth.uid())));

-- Non-mutating compatibility projection. Old commands continue to own legacy saves.
create view public.farm_project_compatibility with (security_invoker=true) as
select user_id, 'school:'||user_id::text as id,'legacy-school'::text as source,'school-1'::text as catalogue_id,to_jsonb(s) as save
from public.farm_school_projects s
union all
select user_id,id::text,'legacy-garden','garden',to_jsonb(g) from public.farm_garden_projects g
union all
select user_id,id::text,'project',''||catalogue_id,to_jsonb(p) from public.farm_projects p;
revoke all on public.farm_project_compatibility from public,anon,authenticated;
grant select on public.farm_project_compatibility to service_role;

create function public.farm_school_level(p_user uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select case when exists(select 1 from public.farm_school_projects where user_id=p_user and status='placed')
 then greatest(1,coalesce((select max((rules_snapshot->>'targetLevel')::int) from public.farm_projects where user_id=p_user and status='placed' and rules_snapshot->>'place'='school'),1)) else 0 end
$$;
create function public.farm_project_release(p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.farm_project_contributions set left_at=now() where project_id=p_id and left_at is null;
 delete from public.farm_project_assignments where project_id=p_id;
end $$;
create function public.farm_project_refresh(p_user uuid,p_id uuid) returns public.farm_projects
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;
begin
 select * into s from public.farm_projects where user_id=p_user and id=p_id for update;
 if not found then raise exception 'ไม่พบโครงการของเรา';end if;
 if s.ready_at<=now() then
  if s.status='building' then s.status:='puzzle';s.remaining_seconds:=0;s.ready_at:=null;
  elsif s.status='finishing' then s.status:='ready';s.remaining_seconds:=0;s.ready_at:=null;s.completed_at:=now();perform public.farm_project_release(s.id);
  end if;
  update public.farm_projects set status=s.status,remaining_seconds=s.remaining_seconds,ready_at=s.ready_at,completed_at=s.completed_at where id=s.id returning * into s;
 end if;
 return s;
end $$;

-- p_user is obtained by the server from its authenticated session, never the client.
create function public.farm_project_buy(p_user uuid,p_catalogue text,p_request uuid,p_leader uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.farm_catalogue;s public.farm_projects;level int;count_kind int;slots int;open_jobs int;plots int;job record;need record;v_snapshot jsonb;reward_key text;
begin
 if p_user is null or p_request is null then raise exception 'ต้องเข้าสู่ระบบและระบุคำขอ';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into s from public.farm_projects where user_id=p_user and request_id=p_request;
 if found then
  if s.catalogue_id<>p_catalogue then raise exception 'คำขอนี้ใช้กับโครงการอื่นแล้ว';end if;
  return to_jsonb(s);
 end if;
 select * into c from public.farm_catalogue where id=p_catalogue;
 if not found or not c.enabled then raise exception 'โครงการนี้ยังไม่เปิด';end if;
 for job in select id from public.farm_projects where user_id=p_user and status='finishing' and ready_at<=now() loop perform public.farm_project_refresh(p_user,job.id);end loop;
 level:=public.farm_school_level(p_user);
 if level<(c.definition->>'schoolLevel')::int or (c.definition->>'place'='school' and level<>(c.definition->>'schoolLevel')::int) then raise exception 'ระดับโรงเรียนยังไม่ตรงเงื่อนไข';end if;
 if c.definition->>'blueprint' is not null and not exists(select 1 from public.farm_blueprint_discoveries where user_id=p_user and blueprint_id=c.definition->>'blueprint') then raise exception 'เรียนค้นพบแบบก่อน';end if;
 for need in select key,value::int as quantity from jsonb_each_text(c.definition->'prerequisite') loop
  select count(*) into count_kind from public.farm_projects where user_id=p_user and status='placed' and rules_snapshot->>'place'=need.key;
  if need.key='garden' then count_kind:=count_kind+(select count(*) from public.farm_garden_projects where user_id=p_user and status='placed');end if;
  if count_kind<need.quantity then raise exception 'วางสถานที่เงื่อนไขก่อน';end if;
 end loop;
 slots:=case level when 1 then 1 when 2 then 2 when 3 then 2 when 4 then 3 else 0 end;
 select count(*) into open_jobs from public.farm_projects where user_id=p_user and status<>'placed';
 open_jobs:=open_jobs+(select count(*) from public.farm_garden_projects where user_id=p_user and status<>'placed');
 if open_jobs>=slots then raise exception 'ช่องงานเต็ม รวมงานพักและพร้อมวาง';end if;
 select count(*) into count_kind from public.farm_projects where user_id=p_user and catalogue_id=p_catalogue;
 if p_catalogue='garden' then count_kind:=count_kind+(select count(*) from public.farm_garden_projects where user_id=p_user);end if;
 if count_kind>=(c.definition->>'limit')::int then raise exception 'ครบเพดานโครงการชนิดนี้';end if;
 plots:=3+(select count(*) from public.farm_school_projects where user_id=p_user and status='placed')+
 (select count(*) from public.farm_garden_projects where user_id=p_user)+(select count(*) from public.farm_projects where user_id=p_user and rules_snapshot->>'place'<>'school');
 if c.definition->>'place'<>'school' and plots>=24 then raise exception 'พื้นที่ฟาร์มเต็ม';end if;
 -- Lock the pet to serialize with Adventure and the legacy assignment triggers.
 perform 1 from public.pets where id=p_leader and user_id=p_user and stage between (c.definition->>'leaderStage')::int and 4 for update;
 if not found then raise exception 'เลือกหัวหน้าที่เป็นของเราและระยะถึง';end if;
 if exists(select 1 from public.dungeon_runs where pet_id=p_leader and status='in_progress') or
 exists(select 1 from public.farm_project_assignments where pet_id=p_leader) or
 exists(select 1 from public.farm_garden_projects where leader_id=p_leader and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) or
 exists(select 1 from public.farm_school_projects where leader_id=p_leader and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) then raise exception 'Qmon ติดงานอื่น';end if;
 insert into public.farm_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.farm_wallets where user_id=p_user and balance>=(c.definition->>'price')::int for update;
 if not found then raise exception 'เหรียญไม่พอ';end if;
 v_snapshot:=c.definition||jsonb_build_object('catalogueVersion',c.version);
 reward_key:='milestone:'||case when p_catalogue='garden' then 'garden' else p_catalogue end;
 insert into public.farm_projects(user_id,request_id,catalogue_id,rules_snapshot,reward_key,reward_eligible,status,remaining_seconds,ready_at)
 values(p_user,p_request,p_catalogue,v_snapshot,reward_key,count_kind=0 and not exists(select 1 from public.farm_coin_ledger where user_id=p_user and entry_key=reward_key),'building',(v_snapshot->'waits'->>0)::int,now()+make_interval(secs=>(v_snapshot->'waits'->>0)::int)) returning * into s;
 insert into public.farm_project_assignments values(s.id,p_leader,'leader');
 insert into public.farm_project_contributions(project_id,pet_id,role) values(s.id,p_leader,'leader');
 perform public.farm_credit(p_user,'purchase:'||s.id::text,-(v_snapshot->>'price')::int);
 return to_jsonb(s);
end $$;

-- Defense in depth for direct legacy RPCs and Adventure. Only new assignments are checked.
create function public.farm_guard_project_pet() returns trigger
language plpgsql security invoker set search_path='' as $$
declare pet uuid;
begin
 if tg_table_name='dungeon_runs' then pet:=new.pet_id;else pet:=new.leader_id;end if;
 if pet is not null and new.status in ('in_progress','building','puzzle','finishing') then
  perform 1 from public.pets where id=pet for update;
  if exists(select 1 from public.farm_project_assignments a join public.farm_projects p on p.id=a.project_id where a.pet_id=pet and
   (p.status in ('building','puzzle') or (p.status='finishing' and p.ready_at>now()))) then raise exception 'Qmon ติดงานโครงการฟาร์ม';end if;
 end if;
 return new;
end $$;
create trigger farm_guard_project_adventure before insert or update of pet_id,status on public.dungeon_runs for each row execute function public.farm_guard_project_pet();
create trigger farm_guard_project_school before insert or update of leader_id,status on public.farm_school_projects for each row execute function public.farm_guard_project_pet();
create trigger farm_guard_project_garden before insert or update of leader_id,status on public.farm_garden_projects for each row execute function public.farm_guard_project_pet();

revoke all on function public.farm_school_level(uuid),public.farm_project_release(uuid),public.farm_project_refresh(uuid,uuid),public.farm_project_buy(uuid,text,uuid,uuid),public.farm_guard_project_pet() from public,anon,authenticated;
grant execute on function public.farm_school_level(uuid),public.farm_project_release(uuid),public.farm_project_refresh(uuid,uuid),public.farm_project_buy(uuid,text,uuid,uuid) to service_role;
-- Team/phase command is service-only. Passing a checkpoint is a separate server
-- endpoint: phase 2 will persist/validate puzzle JSON before invoking it.
create function public.farm_project_command(p_user uuid,p_id uuid,p_operation text,p_leader uuid default null,p_helpers uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;pet uuid;old_helpers int;seconds int;level int;duration int;leader uuid;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 s:=public.farm_project_refresh(p_user,p_id);
 if p_operation='refresh' then return to_jsonb(s);end if;
 if p_operation='pause' then
  if s.status not in ('building','puzzle','finishing') then raise exception 'งานนี้ไม่ได้กำลังทำ';end if;
  if s.round_deadline<=now() then s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;end if;
  s.resume_status:=s.status;s.status:='paused';
  s.remaining_seconds:=case when s.ready_at is null then 0 else greatest(0,ceil(extract(epoch from s.ready_at-now())))::int end;
  s.ready_at:=null;s.round_deadline:=null;perform public.farm_project_release(s.id);
 elsif p_operation in ('team','resume') then
  if (p_operation='resume' and s.status<>'paused') or (p_operation='team' and s.status not in ('building','puzzle','finishing')) then raise exception 'สถานะไม่รองรับเปลี่ยนทีม';end if;
  level:=public.farm_school_level(p_user);
  if p_helpers is null or cardinality(p_helpers)>coalesce((s.rules_snapshot->'schoolCapacity'->level->>'helpers')::int,0) or p_leader is null or p_leader=any(p_helpers) or array_position(p_helpers,null) is not null or cardinality(p_helpers)<>(select count(distinct x) from unnest(p_helpers) x) then raise exception 'เลือกทีมให้ตรงเงื่อนไข';end if;
  -- Stable lock ordering for all team members.
  for pet in select x from unnest(array_append(p_helpers,p_leader)) x order by x loop
   perform 1 from public.pets where id=pet and user_id=p_user and stage between case when pet=p_leader then (s.rules_snapshot->>'leaderStage')::int else 2 end and 4 for update;
   if not found then raise exception 'เลือก Qmon ของเราที่ระยะถึง';end if;
   if exists(select 1 from public.dungeon_runs where pet_id=pet and status='in_progress') or
    exists(select 1 from public.farm_project_assignments where pet_id=pet and project_id<>p_id) or
    exists(select 1 from public.farm_garden_projects where leader_id=pet and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) or
    exists(select 1 from public.farm_school_projects where leader_id=pet and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) then raise exception 'Qmon ติดงานอื่น';end if;
  end loop;
  old_helpers:=s.helper_count;
  seconds:=case when s.ready_at is null then s.remaining_seconds else greatest(0,ceil(extract(epoch from s.ready_at-now())))::int end;
  s.helper_count:=cardinality(p_helpers);
  s.remaining_seconds:=ceil(seconds::numeric*(100-s.helper_count*(s.rules_snapshot->>'helperPercent')::int)/(100-old_helpers*(s.rules_snapshot->>'helperPercent')::int))::int;
  perform public.farm_project_release(p_id);
  insert into public.farm_project_assignments values(p_id,p_leader,'leader');
  insert into public.farm_project_assignments select p_id,x,'helper' from unnest(p_helpers) x;
  insert into public.farm_project_contributions(project_id,pet_id,role) select project_id,pet_id,role from public.farm_project_assignments where project_id=p_id;
  if p_operation='resume' then s.status:=s.resume_status;s.resume_status:=null;end if;
  if s.status in ('building','finishing') then s.ready_at:=now()+make_interval(secs=>s.remaining_seconds);end if;
 elsif p_operation='begin' then
  if s.status<>'puzzle' or not exists(select 1 from public.farm_project_assignments where project_id=p_id and role='leader') then raise exception 'ยังไม่พร้อมเล่น';end if;
  if s.round_deadline<=now() then s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;end if;
  if s.round_deadline is null or s.round_deadline<=now() then s.round_deadline:=now()+make_interval(secs=>(s.rules_snapshot->>'puzzleSeconds')::int);end if;
 else raise exception 'คำสั่งไม่ถูกต้อง';end if;
 update public.farm_projects set status=s.status,resume_status=s.resume_status,remaining_seconds=s.remaining_seconds,ready_at=s.ready_at,helper_count=s.helper_count,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied where id=p_id returning * into s;
 return to_jsonb(s);
end $$;

-- Never expose p_passed in a client action. The puzzle server owns validation.
create function public.farm_project_checkpoint_result(p_user uuid,p_id uuid,p_passed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;duration int;next_checkpoint int;
begin
 if p_user is null or p_passed is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 s:=public.farm_project_refresh(p_user,p_id);
 if s.status<>'puzzle' or s.round_deadline is null then raise exception 'เริ่มรอบเล่นก่อน';end if;
 if s.round_deadline<=now() then
  s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;s.round_deadline:=null;
 elsif not p_passed then
  s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;
  -- Wrong answers retain the active deadline and persisted puzzle/draft.
 else
  next_checkpoint:=s.checkpoint+1;
  duration:=(s.rules_snapshot->'waits'->>next_checkpoint)::int;
  if duration is null then raise exception 'จุดช่วยไม่ตรง snapshot';end if;
  if s.penalty_applied then duration:=ceil(duration*(100+(s.rules_snapshot->>'penaltyPercent')::int)::numeric/100)::int;end if;
  duration:=ceil(duration*(100-s.helper_count*(s.rules_snapshot->>'helperPercent')::int)::numeric/100)::int;
  update public.farm_project_checkpoints set completed_at=now() where project_id=p_id and checkpoint=s.checkpoint;
  s.checkpoint:=next_checkpoint;
  s.status:=case when next_checkpoint=jsonb_array_length(s.rules_snapshot->'waits')-1 then 'finishing' else 'building' end;
  s.failures:=0;s.penalty_applied:=false;s.round_deadline:=null;s.remaining_seconds:=duration;s.ready_at:=now()+make_interval(secs=>duration);
 end if;
 update public.farm_projects set checkpoint=s.checkpoint,status=s.status,remaining_seconds=s.remaining_seconds,ready_at=s.ready_at,failures=s.failures,penalty_applied=s.penalty_applied,round_deadline=s.round_deadline where id=p_id returning * into s;
 return to_jsonb(s);
end $$;
revoke all on function public.farm_project_command(uuid,uuid,text,uuid,uuid[]),public.farm_project_checkpoint_result(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.farm_project_command(uuid,uuid,text,uuid,uuid[]),public.farm_project_checkpoint_result(uuid,uuid,boolean) to service_role;
create function public.farm_project_place(p_user uuid,p_id uuid,p_x int default null,p_y int default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;ok boolean;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 s:=public.farm_project_refresh(p_user,p_id);
 if s.status='placed' then return to_jsonb(s);end if;
 if s.status<>'ready' then raise exception 'งานยังไม่พร้อมวาง';end if;
 if s.rules_snapshot->>'place'='school' then
  select tile_x,tile_y into p_x,p_y from public.farm_school_projects where user_id=p_user and status='placed';
  if p_x is null then raise exception 'วางโรงเรียนเดิมก่อน';end if;
 else
  if p_x is null or p_y is null or abs(p_x::bigint)>10000 or abs(p_y::bigint)>10000 then raise exception 'เลือกช่องว่างติดฟาร์ม';end if;
  with plots(x,y) as (
   values(0,0),(1,0),(0,1)
   union all select tile_x,tile_y from public.farm_school_projects where user_id=p_user and status='placed'
   union all select tile_x,tile_y from public.farm_garden_projects where user_id=p_user and status='placed'
   union all select tile_x,tile_y from public.farm_projects where user_id=p_user and status='placed' and rules_snapshot->>'place'<>'school'
  ) select not exists(select 1 from plots where x=p_x and y=p_y) and exists(select 1 from plots where abs(x-p_x)+abs(y-p_y)=1) into ok;
  if not ok then raise exception 'เลือกช่องว่างติดฟาร์ม ไม่ทับพื้นที่';end if;
 end if;
 update public.farm_projects set status='placed',tile_x=p_x,tile_y=p_y where id=p_id returning * into s;
 if s.reward_eligible then perform public.farm_credit(p_user,s.reward_key,(s.rules_snapshot->>'firstReward')::int);end if;
 return to_jsonb(s);
end $$;
revoke all on function public.farm_project_place(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.farm_project_place(uuid,uuid,integer,integer) to service_role;

-- Legacy purchases must share the new queue and reserve generic plots. This
-- trigger only checks newly inserted rows and never changes an existing save.
create function public.farm_guard_legacy_purchase() returns trigger
language plpgsql security invoker set search_path='' as $$
declare level int;slots int;open_jobs int;gardens int;plots int;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,729));
 level:=public.farm_school_level(new.user_id);slots:=case level when 1 then 1 when 2 then 2 when 3 then 2 when 4 then 3 else 0 end;
 open_jobs:=(select count(*) from public.farm_projects where user_id=new.user_id and status<>'placed')+(select count(*) from public.farm_garden_projects where user_id=new.user_id and status<>'placed');
 gardens:=(select count(*) from public.farm_projects where user_id=new.user_id and rules_snapshot->>'place'='garden')+(select count(*) from public.farm_garden_projects where user_id=new.user_id);
 plots:=4+(select count(*) from public.farm_projects where user_id=new.user_id and rules_snapshot->>'place'<>'school')+(select count(*) from public.farm_garden_projects where user_id=new.user_id);
 if open_jobs>=slots or gardens>=4 or plots>=24 then raise exception 'ช่องงานหรือพื้นที่ฟาร์มเต็ม';end if;
 return new;
end $$;
create trigger farm_guard_legacy_purchase before insert on public.farm_garden_projects for each row execute function public.farm_guard_legacy_purchase();
revoke all on function public.farm_guard_legacy_purchase() from public,anon,authenticated;

-- Attribution is additive. The original builder is captured before later changes;
-- unknown pre-migration participants are not invented.
create table public.farm_legacy_contributions (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('school','garden')),source_key text not null,
 pet_id uuid references public.pets(id) on delete set null,recorded_at timestamptz not null default now(),
 unique(user_id,source,source_key,pet_id)
);
create index farm_legacy_contributions_pet on public.farm_legacy_contributions(pet_id);
alter table public.farm_legacy_contributions enable row level security;
revoke all on public.farm_legacy_contributions from public,anon,authenticated;
grant select on public.farm_legacy_contributions to authenticated;
grant all on public.farm_legacy_contributions to service_role;
grant usage,select on sequence public.farm_legacy_contributions_id_seq to service_role;
create policy farm_legacy_contributions_owner on public.farm_legacy_contributions for select to authenticated using(user_id=(select auth.uid()));
insert into public.farm_legacy_contributions(user_id,source,source_key,pet_id)
select user_id,'school',user_id::text,leader_id from public.farm_school_projects where leader_id is not null
union select user_id,'garden',id::text,leader_id from public.farm_garden_projects where leader_id is not null
union select user_id,'garden',id::text,builder_id from public.farm_garden_projects where builder_id is not null;
create function public.farm_record_legacy_contribution() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source text;source_key text;pet uuid;
begin
 if tg_table_name='farm_school_projects' then source:='school';source_key:=new.user_id::text;
 else source:='garden';source_key:=new.id::text;end if;
 if new.leader_id is not null then
 insert into public.farm_legacy_contributions(user_id,source,source_key,pet_id) values(new.user_id,source,source_key,new.leader_id) on conflict do nothing;
 end if;
 if tg_op='UPDATE' and old.leader_id is not null then
 insert into public.farm_legacy_contributions(user_id,source,source_key,pet_id) values(new.user_id,source,source_key,old.leader_id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger farm_record_school_contribution after insert or update of leader_id on public.farm_school_projects for each row execute function public.farm_record_legacy_contribution();
create trigger farm_record_garden_contribution after insert or update of leader_id on public.farm_garden_projects for each row execute function public.farm_record_legacy_contribution();
revoke all on function public.farm_record_legacy_contribution() from public,anon,authenticated;

create function public.farm_guard_legacy_plot() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='placed' then
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,729));
 if exists(select 1 from public.farm_projects where user_id=new.user_id and status='placed' and rules_snapshot->>'place'<>'school' and tile_x=new.tile_x and tile_y=new.tile_y) then raise exception 'พื้นที่นี้มีโครงการฟาร์มแล้ว';end if;
 end if;
 return new;
end $$;
create trigger farm_guard_legacy_garden_plot before insert or update of status,tile_x,tile_y on public.farm_garden_projects for each row execute function public.farm_guard_legacy_plot();
revoke all on function public.farm_guard_legacy_plot() from public,anon,authenticated;



