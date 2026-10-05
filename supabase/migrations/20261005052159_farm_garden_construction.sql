
-- Trial economy is isolated, versioned and snapshotted on purchased projects.
create table public.farm_rules (
 id boolean primary key default true check(id), daily_coins integer not null check(daily_coins>0),
 milestone_coins integer not null check(milestone_coins>=0), garden_price integer not null check(garden_price>0),
 work_seconds integer not null check(work_seconds>0), finish_seconds integer not null check(finish_seconds>0),
 round_seconds integer not null check(round_seconds>0), penalty_seconds integer not null check(penalty_seconds>=0)
);
insert into public.farm_rules values(true,20,20,40,300,300,180,60);
create table public.farm_wallets(user_id uuid primary key references auth.users(id) on delete cascade,balance bigint not null default 0 check(balance>=0));
create table public.farm_coin_ledger(user_id uuid not null references auth.users(id) on delete cascade,entry_key text not null,amount integer not null,created_at timestamptz not null default now(),primary key(user_id,entry_key));
create table public.farm_garden_projects (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,leader_id uuid references public.pets(id) on delete set null,builder_id uuid references public.pets(id) on delete set null,
 status text not null check(status in ('building','puzzle','finishing','paused','ready','placed')),
 resume_status text check(resume_status in ('building','puzzle','finishing')),ready_at timestamptz,remaining_seconds integer not null check(remaining_seconds>=0),
 round_deadline timestamptz,failures integer not null default 0,penalty_applied boolean not null default false,
 price integer not null,finish_seconds integer not null,round_seconds integer not null,penalty_seconds integer not null,
 tile_x integer,tile_y integer,layout jsonb,completed_at timestamptz,created_at timestamptz not null default now(),
 unique(user_id,request_id),check((status='placed')=(tile_x is not null and tile_y is not null)),
 check(failures>=0),check(price>0 and finish_seconds>0 and round_seconds>0 and penalty_seconds>=0)
);
create unique index farm_garden_one_open on public.farm_garden_projects(user_id) where status<>'placed';
create unique index farm_garden_plot on public.farm_garden_projects(user_id,tile_x,tile_y) where status='placed';
create index farm_garden_leader on public.farm_garden_projects(leader_id) where leader_id is not null;
create index farm_garden_builder on public.farm_garden_projects(builder_id) where builder_id is not null;
alter table public.farm_rules enable row level security;
alter table public.farm_wallets enable row level security;
alter table public.farm_coin_ledger enable row level security;
alter table public.farm_garden_projects enable row level security;
revoke all on public.farm_rules,public.farm_wallets,public.farm_coin_ledger,public.farm_garden_projects from anon,authenticated;
grant select on public.farm_rules,public.farm_wallets,public.farm_coin_ledger,public.farm_garden_projects to authenticated;
grant all on public.farm_rules,public.farm_wallets,public.farm_coin_ledger,public.farm_garden_projects to service_role;
create policy farm_rules_read on public.farm_rules for select to authenticated using(true);
create policy farm_wallet_owner on public.farm_wallets for select to authenticated using((select auth.uid())=user_id);
create policy farm_ledger_owner on public.farm_coin_ledger for select to authenticated using((select auth.uid())=user_id);
create policy farm_garden_owner on public.farm_garden_projects for select to authenticated using((select auth.uid())=user_id);

create function public.farm_credit(p_user uuid,p_key text,p_amount integer) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.farm_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.farm_wallets where user_id=p_user for update;
 insert into public.farm_coin_ledger(user_id,entry_key,amount) values(p_user,p_key,p_amount) on conflict do nothing;
 if not found then return false;end if;
 update public.farm_wallets set balance=balance+p_amount where user_id=p_user;
 return true;
end $$;
create function public.farm_wallet_command(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.farm_rules; b bigint;
begin
 if p_user_id is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,729));
 select * into r from public.farm_rules;
 if exists(select 1 from public.farm_school_projects where user_id=p_user_id and status='placed') then
  perform public.farm_credit(p_user_id,'milestone:school',r.milestone_coins);
 end if;
 select coalesce(balance,0) into b from public.farm_wallets where user_id=p_user_id;
 return jsonb_build_object('balance',coalesce(b,0),'rules',to_jsonb(r));
end $$;

-- Versioned service-only reward endpoint: old clients keep the legacy food flow until reload.
-- Both endpoints share bonus_awarded_at, so neither EXP nor rewards can be claimed twice.
create function public.farm_claim_daily_mission_bonus(p_mission_id uuid,p_food_type text default null,p_user_id uuid default null)
returns table(awarded boolean,bonus_exp smallint,no_active_pet boolean,food_credited boolean)
language plpgsql security invoker set search_path='' as $$
declare u uuid:=p_user_id; pet uuid; bonus smallint; m public.daily_missions; reward integer;
begin
 if u is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,729));
 select * into m from public.daily_missions where id=p_mission_id and user_id=u for update;
 if not found or m.bonus_awarded_at is not null then return query select false,null::smallint,false,false;return;end if;
 if (select count(*) from public.quiz_attempts where mission_id=m.id and user_id=u)<m.target_count then
  raise exception 'ทำภารกิจให้ครบก่อนรับรางวัล';
 end if;
 select id into pet from public.pets where user_id=u and is_active=true limit 1 for update;
 if pet is null then return query select false,null::smallint,true,false;return;end if;
 bonus:=m.bonus_exp;
 update public.daily_missions set bonus_awarded_at=now() where id=m.id;
 update public.pets set exp=exp+bonus where id=pet;
 select daily_coins into reward from public.farm_rules;
 perform public.farm_credit(u,'daily:'||m.id::text,reward);
 return query select true,bonus,false,false;
end $$;
revoke all on function public.farm_claim_daily_mission_bonus(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.farm_claim_daily_mission_bonus(uuid,text,uuid) to service_role;

create function public.farm_garden_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; ids text[]:='{}';cells text[]:='{}';seen text[]:='{}';id text;x int;y int;r int;cx int:=0;cy int:=3;ex int:=1;entry int;nx int;ny int;ports int[];k text;i int;
begin
 if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>5 then return false;end if;
 for p in select value from jsonb_array_elements(v) loop
  id:=p->>'id';if id is null or id not in ('straight-a','straight-b','bend-a','bend-b','bend-c') or id=any(ids) then return false;end if;
  if (p->>'x') !~ '^[0-3]$' or (p->>'y') !~ '^[0-3]$' or (p->>'rotation') !~ '^[0-3]$' or not(p ?& array['x','y','rotation']) then return false;end if;
  x:=(p->>'x')::int;y:=(p->>'y')::int;k:=x||','||y;
  if k=any(cells) or k in ('0,0','0,1','1,0','2,3','3,3','0,3','3,0') then return false;end if;
  ids:=array_append(ids,id);cells:=array_append(cells,k);
 end loop;
 for i in 1..6 loop
  nx:=cx+case ex when 1 then 1 when 3 then -1 else 0 end;
  ny:=cy+case ex when 2 then 1 when 0 then -1 else 0 end;entry:=(ex+2)%4;
  if nx=3 and ny=0 then return entry=2 and cardinality(seen)=5;end if;
  k:=nx||','||ny;if k=any(seen) then return false;end if;
  select value into p from jsonb_array_elements(v) where (value->>'x')::int=nx and (value->>'y')::int=ny;
  if p is null then return false;end if;
  r:=(p->>'rotation')::int;ports:=array[r,(r+case when p->>'id' like 'straight-%' then 2 else 1 end)%4];
  if not(entry=any(ports)) then return false;end if;
  ex:=case when ports[1]=entry then ports[2] else ports[1] end;seen:=array_append(seen,k);cx:=nx;cy:=ny;
 end loop;return false;
exception when others then return false;
end $$;

create function public.farm_garden_command(p_user_id uuid,p_operation text,p_project_id uuid default null,p_pet_id uuid default null,p_request_id uuid default null,p_layout jsonb default null,p_x integer default null,p_y integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.farm_garden_projects;r public.farm_rules;msg text:='';passed boolean:=false;expired boolean;ok boolean;balance bigint;
begin
 if p_user_id is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,729));
 select * into r from public.farm_rules;
 if p_operation='buy' then
  if p_request_id is null then raise exception 'เปิดหน้าซื้อใหม่แล้วลองอีกครั้ง';end if;
  select * into s from public.farm_garden_projects where user_id=p_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('project',to_jsonb(s),'server_now',now(),'message','โครงการนี้ซื้อแล้ว');end if;
  if not exists(select 1 from public.farm_school_projects where user_id=p_user_id and status='placed') then raise exception 'วางโรงเรียนก่อนเริ่มสร้างสวน';end if;
  if not exists(select 1 from public.farm_blueprint_discoveries where user_id=p_user_id and blueprint_id='garden-rest-v1') then raise exception 'เรียนเพื่อค้นพบแบบสวนก่อนซื้อโครงการ';end if;
  if exists(select 1 from public.farm_garden_projects where user_id=p_user_id and status<>'placed') then raise exception 'วางสวนโครงการเดิมก่อนเริ่มงานใหม่';end if;
 end if;
 if p_operation in ('buy','resume') then
  perform 1 from public.pets where id=p_pet_id and user_id=p_user_id and stage between 2 and 4 for update;
  if not found then raise exception 'เลือก Qmon ที่ฟักแล้วและเป็นของเรา';end if;
  if exists(select 1 from public.dungeon_runs where pet_id=p_pet_id and status='in_progress') or
     exists(select 1 from public.farm_garden_projects where leader_id=p_pet_id and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) then
   raise exception 'Qmon ตัวนี้ติดงานอื่นอยู่';end if;
 end if;
 if p_operation='buy' then
  perform public.farm_wallet_command(p_user_id);
  select w.balance into balance from public.farm_wallets w where user_id=p_user_id for update;
  if coalesce(balance,0)<r.garden_price then raise exception 'เหรียญฟาร์มยังไม่พอ ทำ Daily Quest แล้วกลับมาได้';end if;
  insert into public.farm_garden_projects(user_id,request_id,leader_id,builder_id,status,remaining_seconds,ready_at,price,finish_seconds,round_seconds,penalty_seconds)
  values(p_user_id,p_request_id,p_pet_id,p_pet_id,'building',r.work_seconds,now()+make_interval(secs=>r.work_seconds),r.garden_price,r.finish_seconds,r.round_seconds,r.penalty_seconds) returning * into s;
  perform public.farm_credit(p_user_id,'purchase:'||s.id::text,-s.price);msg:='ซื้อโครงการแล้ว คู่หูกำลังเตรียมสวน';
 else
  select * into s from public.farm_garden_projects where user_id=p_user_id and id=p_project_id for update;
  if not found then raise exception 'ไม่พบโครงการสวนของเรา';end if;
  if s.status='building' and s.ready_at<=now() then s.status:='puzzle';s.ready_at:=null;end if;
  if s.status='finishing' and s.ready_at<=now() then s.status:='ready';s.ready_at:=null;s.leader_id:=null;s.completed_at:=now();end if;
  if p_operation='resume' then
   if s.status<>'paused' then raise exception 'งานนี้ไม่ได้พักอยู่';end if;
   s.leader_id:=p_pet_id;s.builder_id:=p_pet_id;s.status:=s.resume_status;s.resume_status:=null;
   if s.status<>'puzzle' then s.ready_at:=now()+make_interval(secs=>s.remaining_seconds);end if;
  elsif p_operation='pause' then
   if s.status not in ('building','puzzle','finishing') then raise exception 'งานนี้ไม่ได้กำลังทำอยู่';end if;
   if s.round_deadline<=now() then s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;end if;
   s.resume_status:=s.status;s.status:='paused';s.remaining_seconds:=greatest(0,ceil(extract(epoch from s.ready_at-now())))::int;
   s.ready_at:=null;s.round_deadline:=null;s.leader_id:=null;
  elsif p_operation='begin' then
   if s.status<>'puzzle' or s.leader_id is null then raise exception 'ยังไม่ถึงช่วงช่วยต่อทาง';end if;
   if s.round_deadline<=now() then s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;end if;
   if s.round_deadline is null or s.round_deadline<=now() then s.round_deadline:=now()+make_interval(secs=>s.round_seconds);end if;
  elsif p_operation='submit' then
   if s.status<>'puzzle' or s.round_deadline is null or s.leader_id is null then raise exception 'เริ่มรอบช่วยต่อทางก่อน';end if;
   expired:=s.round_deadline<=now();passed:=not expired and public.farm_garden_valid(p_layout);
   if passed then
    s.status:='finishing';s.round_deadline:=null;s.layout:=p_layout;s.remaining_seconds:=s.finish_seconds+case when s.penalty_applied then s.penalty_seconds else 0 end;
    s.ready_at:=now()+make_interval(secs=>s.remaining_seconds);msg:='ทางเดินพร้อมแล้ว คู่หูกำลังเก็บงาน';
   else
    s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;s.round_deadline:=null;
    msg:=case when expired then 'หมดเวลารอบนี้ เริ่มใหม่ได้เลย' else 'ทางยังไปไม่ถึงม้านั่ง ลองต่อใหม่ได้เลย' end;
   end if;
  elsif p_operation='place' then
   if s.status='placed' and s.tile_x=p_x and s.tile_y=p_y then passed:=true;
   else
    if s.status<>'ready' then raise exception 'สวนยังไม่พร้อมวาง';end if;
    if p_x is null or p_y is null or abs(p_x)>10000 or abs(p_y)>10000 then raise exception 'เลือกช่องว่างที่ติดฟาร์ม';end if;
    with plots(x,y) as (values(0,0),(1,0),(0,1) union all select tile_x,tile_y from public.farm_school_projects where user_id=p_user_id and status='placed' union all select tile_x,tile_y from public.farm_garden_projects where user_id=p_user_id and status='placed')
    select not exists(select 1 from plots where x=p_x and y=p_y) and exists(select 1 from plots where abs(x-p_x)+abs(y-p_y)=1) into ok;
    if not ok then raise exception 'เลือกช่องว่างที่ติดฟาร์ม ไม่ทับพื้นที่เดิม';end if;
    s.status:='placed';s.tile_x:=p_x;s.tile_y:=p_y;passed:=true;
    perform public.farm_credit(p_user_id,'milestone:garden',r.milestone_coins);msg:='สวนต่อกับฟาร์มแล้ว!';
   end if;
  elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';end if;
  update public.farm_garden_projects set status=s.status,leader_id=s.leader_id,builder_id=s.builder_id,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,layout=s.layout,completed_at=s.completed_at where id=s.id returning * into s;
 end if;
 return jsonb_build_object('project',to_jsonb(s),'passed',passed,'message',msg,'server_now',now());
end $$;

-- Add garden exclusivity to the existing Adventure trigger without removing school rules.
create function public.farm_guard_garden_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='in_progress' then
  perform 1 from public.pets where id=new.pet_id for update;
  if exists(select 1 from public.farm_garden_projects where leader_id=new.pet_id and (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) then
   raise exception 'Qmon ตัวนี้คุมงานสวนอยู่ ถอนหัวหน้าก่อนออกผจญภัย';end if;
 end if;return new;
end $$;
create trigger farm_guard_garden_assignment before insert or update of pet_id,status on public.dungeon_runs for each row execute function public.farm_guard_garden_assignment();
revoke all on function public.farm_credit(uuid,text,integer),public.farm_wallet_command(uuid),public.farm_garden_valid(jsonb),public.farm_garden_command(uuid,text,uuid,uuid,uuid,jsonb,integer,integer),public.farm_guard_garden_assignment() from public,anon,authenticated;
grant execute on function public.farm_credit(uuid,text,integer),public.farm_wallet_command(uuid),public.farm_garden_valid(jsonb),public.farm_garden_command(uuid,text,uuid,uuid,uuid,jsonb,integer,integer) to service_role;
