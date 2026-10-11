-- Additive layout positions; legacy coins, jobs, drafts and timestamps are unchanged.
create table public.farm_base_positions(
 user_id uuid not null references auth.users(id) on delete cascade,
 tile_id text not null check(tile_id in ('home-meadow','qmon-residence','egg-storage')),
 x integer not null check(abs(x::bigint)<=10000),y integer not null check(abs(y::bigint)<=10000),
 primary key(user_id,tile_id)
);
alter table public.farm_base_positions enable row level security;
revoke all on public.farm_base_positions from public,anon,authenticated;
grant select on public.farm_base_positions to authenticated;
grant all on public.farm_base_positions to service_role;
create policy farm_base_owner on public.farm_base_positions for select to authenticated using(user_id=(select auth.uid()));
alter table public.farm_projects add column orientation smallint not null default 0 check(orientation in (0,1));
create function public.farm_layout_tiles(p_user uuid)
returns table(id text,kind text,x integer,y integer,orientation integer,level integer)
language sql stable security invoker set search_path='' as $$
 select b.id,b.kind,coalesce(o.x,b.x),coalesce(o.y,b.y),0,1 from (values
 ('home-meadow','meadow',0,0),('qmon-residence','residence',1,0),('egg-storage','eggs',0,1)) b(id,kind,x,y)
 left join public.farm_base_positions o on o.user_id=p_user and o.tile_id=b.id
 union all select 'main-school','school',tile_x,tile_y,0,public.farm_school_level(p_user) from public.farm_school_projects where user_id=p_user and status='placed'
 union all select id::text,'garden',tile_x,tile_y,0,1 from public.farm_garden_projects where user_id=p_user and status='placed'
 union all select id::text,rules_snapshot->>'place',tile_x,tile_y,orientation,1 from public.farm_projects where user_id=p_user and status='placed' and rules_snapshot->>'place'<>'school';
$$;
revoke all on function public.farm_layout_tiles(uuid) from public,anon,authenticated;
grant execute on function public.farm_layout_tiles(uuid) to service_role;
create function public.farm_layout_valid(p_tiles jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare n integer;connected integer;
begin
 if jsonb_typeof(p_tiles)<>'array' then return false;end if;n:=jsonb_array_length(p_tiles);
 if n<3 or n>24 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_tiles) t where jsonb_typeof(t)<>'object' or t->>'id' is null or coalesce(t->>'kind','') not in ('meadow','residence','eggs','school','garden','pond','flower','bridge','observatory') or coalesce(t->>'x','')!~'^-?[0-9]+$' or coalesce(t->>'y','')!~'^-?[0-9]+$' or coalesce(t->>'orientation','0') not in ('0','1') or abs((t->>'x')::bigint)>10000 or abs((t->>'y')::bigint)>10000) then return false;end if;
 if (select count(distinct t->>'id') from jsonb_array_elements(p_tiles) t)<>n or (select count(distinct (t->>'x',t->>'y')) from jsonb_array_elements(p_tiles) t)<>n then return false;end if;
 if exists(select 1 from (values('home-meadow','meadow'),('qmon-residence','residence'),('egg-storage','eggs')) b(id,kind) where not exists(select 1 from jsonb_array_elements(p_tiles) t where t->>'id'=b.id and t->>'kind'=b.kind)) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_tiles) t group by t->>'kind' having count(*)>case t->>'kind' when 'meadow' then 1 when 'residence' then 1 when 'eggs' then 1 when 'school' then 1 when 'garden' then 4 when 'pond' then 3 when 'flower' then 3 when 'bridge' then 2 when 'observatory' then 1 else 0 end) then return false;end if;
 with recursive tiles as (select t->>'id' id,t->>'kind' kind,(t->>'x')::int x,(t->>'y')::int y,coalesce((t->>'orientation')::int,0) orientation from jsonb_array_elements(p_tiles) t),
 edges as(select a.id source,b.id target from tiles a join tiles b on abs(a.x-b.x)+abs(a.y-b.y)=1
 where (a.kind<>'bridge' or (a.orientation=0 and a.y=b.y) or (a.orientation=1 and a.x=b.x))
 and (b.kind<>'bridge' or (b.orientation=0 and a.y=b.y) or (b.orientation=1 and a.x=b.x))),
 reached(id) as(select id from tiles where id='home-meadow' union select e.target from reached r join edges e on e.source=r.id)
 select count(*) into connected from reached;
 return connected=n;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function public.farm_layout_valid(jsonb) from public,anon,authenticated;
grant execute on function public.farm_layout_valid(jsonb) to service_role;
create function public.farm_layout_candidate(p_user uuid,p_id text,p_kind text,p_x integer,p_y integer,p_orientation integer default 0) returns boolean
language sql stable security invoker set search_path='' as $$
 select public.farm_layout_valid(coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',p_id,'kind',p_kind,'x',p_x,'y',p_y,'orientation',p_orientation))) from public.farm_layout_tiles(p_user) t where t.id<>p_id;
$$;
revoke all on function public.farm_layout_candidate(uuid,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.farm_layout_candidate(uuid,text,text,integer,integer,integer) to service_role;
create function public.farm_assert_layout() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name<>'farm_base_positions' then if new.status<>'placed' then return new;end if;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,729));
 if not public.farm_layout_valid((select jsonb_agg(to_jsonb(t)) from public.farm_layout_tiles(new.user_id) t)) then raise exception 'ผังต้องเชื่อมกัน ไม่ซ้อน และสะพานต้องมีทางเข้าออกตามแกน';end if;
 return new;
end $$;
revoke all on function public.farm_assert_layout() from public,anon,authenticated;
create trigger farm_base_layout after insert or update on public.farm_base_positions for each row execute function public.farm_assert_layout();
create trigger farm_school_layout after insert or update of status,tile_x,tile_y on public.farm_school_projects for each row execute function public.farm_assert_layout();
create trigger farm_garden_layout after insert or update of status,tile_x,tile_y on public.farm_garden_projects for each row execute function public.farm_assert_layout();
create trigger farm_project_layout after insert or update of status,tile_x,tile_y,orientation on public.farm_projects for each row execute function public.farm_assert_layout();
create function public.farm_layout_move(p_user uuid,p_id text,p_x integer,p_y integer,p_orientation integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare selected record;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into selected from public.farm_layout_tiles(p_user) where id=p_id;
 if not found then raise exception 'เลือกชิ้นในฟาร์มของเรา';end if;
 if selected.kind<>'bridge' and p_orientation<>0 then raise exception 'หมุนได้เฉพาะสะพาน';end if;
 if not public.farm_layout_candidate(p_user,p_id,selected.kind,p_x,p_y,p_orientation) then raise exception 'ย้ายแล้วทุกชิ้นต้องเชื่อมกัน ไม่ซ้อน และสะพานต้องตรงทาง';end if;
 if p_id in ('home-meadow','qmon-residence','egg-storage') then
  insert into public.farm_base_positions values(p_user,p_id,p_x,p_y) on conflict(user_id,tile_id) do update set x=excluded.x,y=excluded.y;
 elsif p_id='main-school' then
  update public.farm_school_projects set tile_x=p_x,tile_y=p_y where user_id=p_user and status='placed';
  update public.farm_projects set tile_x=p_x,tile_y=p_y where user_id=p_user and status='placed' and rules_snapshot->>'place'='school';
 elsif exists(select 1 from public.farm_garden_projects where id=p_id::uuid and user_id=p_user and status='placed') then
  update public.farm_garden_projects set tile_x=p_x,tile_y=p_y where id=p_id::uuid and user_id=p_user;
 else
  update public.farm_projects set tile_x=p_x,tile_y=p_y,orientation=p_orientation where id=p_id::uuid and user_id=p_user and status='placed';
 end if;
 return (select jsonb_agg(to_jsonb(t)) from public.farm_layout_tiles(p_user) t);
end $$;
revoke all on function public.farm_layout_move(uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.farm_layout_move(uuid,text,integer,integer,integer) to service_role;
create function public.farm_layout_place(p_user uuid,p_id uuid,p_x integer default null,p_y integer default null,p_orientation integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));s:=public.farm_project_refresh(p_user,p_id);
 if s.status='placed' then return to_jsonb(s);end if;
 if s.status<>'ready' then raise exception 'งานยังไม่พร้อมวาง';end if;
 if s.rules_snapshot->>'place'='school' then select tile_x,tile_y into p_x,p_y from public.farm_school_projects where user_id=p_user and status='placed';p_orientation:=0;
 elsif not public.farm_layout_candidate(p_user,p_id::text,s.rules_snapshot->>'place',p_x,p_y,p_orientation) then raise exception 'เลือกพื้นที่ว่างเชื่อมฟาร์มตามทางเข้าออก';end if;
 if p_x is null or p_y is null or p_orientation not in (0,1) or (s.rules_snapshot->>'place'<>'bridge' and p_orientation<>0) then raise exception 'ตำแหน่งหรือทิศไม่ถูกต้อง';end if;
 update public.farm_projects set status='placed',tile_x=p_x,tile_y=p_y,orientation=p_orientation where id=p_id returning * into s;
 if s.reward_eligible then perform public.farm_credit(p_user,s.reward_key,(s.rules_snapshot->>'firstReward')::int);end if;return to_jsonb(s);
end $$;
revoke all on function public.farm_layout_place(uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.farm_layout_place(uuid,uuid,integer,integer,integer) to service_role;
create or replace function public.farm_project_place(p_user uuid,p_id uuid,p_x integer default null,p_y integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select public.farm_layout_place(p_user,p_id,p_x,p_y,0); $$;

-- Preserve legacy commands; only placement reads the unified layout.
create or replace function public.farm_school_command(p_user_id uuid,p_operation text,p_pet_id uuid default null,p_layout jsonb default null,p_x integer default null,p_y integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.farm_school_projects; msg text:=''; passed boolean:=false; expired boolean:=false;
begin
 if p_user_id is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,729));
 insert into public.farm_school_projects(user_id) values(p_user_id) on conflict do nothing;
 select * into s from public.farm_school_projects where user_id=p_user_id for update;
 if s.status='building' and s.ready_at<=now() then s.status:='puzzle'; s.ready_at:=null; s.remaining_seconds:=0; end if;
 if s.status='finishing' and s.ready_at<=now() then s.status:='ready'; s.ready_at:=null; s.leader_id:=null; s.completed_at:=now(); end if;
 if p_operation in ('start','resume') then
  if (p_operation='start' and s.status<>'draft') or (p_operation='resume' and s.status<>'paused') then raise exception 'งานเปลี่ยนแล้ว กรุณาเปิดหน้านี้ใหม่'; end if;
  perform 1 from public.pets where id=p_pet_id and user_id=p_user_id and stage between 2 and 4 for update;
  if not found then raise exception 'เลือก Qmon ที่ฟักแล้วและเป็นของเรา'; end if;
  if exists(select 1 from public.dungeon_runs where pet_id=p_pet_id and status='in_progress') then raise exception 'Qmon ตัวนี้ติดงานผจญภัยอยู่ เลือกตัวอื่นหรือทำงานเดิมให้จบก่อน'; end if;
  s.leader_id:=p_pet_id; s.status:=case when p_operation='start' then 'building' else s.resume_status end;
  s.resume_status:=null;
  if s.status<>'puzzle' then s.ready_at:=now()+make_interval(secs=>s.remaining_seconds); end if;
 elsif p_operation='pause' then
  if s.status not in ('building','puzzle','finishing') then raise exception 'งานนี้ไม่ได้กำลังทำอยู่'; end if;
  -- Settle a timed-out round once before releasing the leader.
  if s.round_deadline is not null and s.round_deadline<=now() then
   s.failures:=s.failures+1; s.penalty_applied:=s.penalty_applied or s.failures>=3;
  end if;
  s.resume_status:=s.status; s.status:='paused';
  s.remaining_seconds:=greatest(0,ceil(extract(epoch from s.ready_at-now())))::int;
  s.ready_at:=null; s.leader_id:=null; s.round_deadline:=null;
 elsif p_operation='begin' then
  if s.status<>'puzzle' or s.leader_id is null then raise exception 'ยังไม่ถึงช่วงจัดพื้น หรือยังไม่มีหัวหน้าคุมงาน'; end if;
  if s.round_deadline is not null and s.round_deadline<=now() then
   s.failures:=s.failures+1; s.penalty_applied:=s.penalty_applied or s.failures>=3; msg:='หมดเวลารอบก่อน ลองจัดพื้นใหม่ได้เลย';
  end if;
  if s.round_deadline is null or s.round_deadline<=now() then s.round_deadline:=now()+interval '90 seconds'; end if;
 elsif p_operation='draft' then
   if s.status<>'puzzle' or s.leader_id is null or not public.farm_layout_draft_valid(p_layout,false) then raise exception 'ผังร่างไม่ถูกต้อง';end if;
   s.draft_layout:=p_layout;
  elsif p_operation='submit' then
  if s.status<>'puzzle' or s.round_deadline is null or s.leader_id is null then raise exception 'เริ่มรอบจัดพื้นก่อนตรวจงาน'; end if;
  if not public.farm_layout_draft_valid(p_layout,false) then raise exception 'ผังร่างไม่ถูกต้อง';end if;
   s.draft_layout:=p_layout;
   expired:=s.round_deadline<=now(); passed:=not expired and public.farm_floor_valid(p_layout);
  if passed then
   s.status:='finishing'; s.round_deadline:=null; s.remaining_seconds:=45+case when s.penalty_applied then 15 else 0 end;
   s.ready_at:=now()+make_interval(secs=>s.remaining_seconds); msg:='ปูพื้นครบแล้ว! Qmon กำลังเก็บงานโรงเรียน';
  else
   s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;if expired then s.round_deadline:=null;end if;
   msg:=case when expired then 'หมดเวลารอบนี้ ลองใหม่ได้เลย' else 'พื้นยังไม่เต็มหรือมีชิ้นซ้อนกัน ลองใช้แผ่นยาวตามแนวขอบห้อง' end;
  end if;
 elsif p_operation='place' then
  if s.status<>'ready' then raise exception 'โรงเรียนยังไม่พร้อมวาง'; end if;
  -- Starter map is (0,0),(1,0),(0,1). Expand only to an empty adjoining plot.
  if not public.farm_layout_candidate(p_user_id,'main-school','school',p_x,p_y,0) then raise exception 'เลือกพื้นที่ว่างที่เชื่อมกับฟาร์ม';end if;
  s.status:='placed'; s.tile_x:=p_x; s.tile_y:=p_y;
 elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';
 end if;
 update public.farm_school_projects set draft_layout=s.draft_layout,leader_id=s.leader_id,status=s.status,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,completed_at=s.completed_at,updated_at=now() where user_id=p_user_id returning * into s;
 return jsonb_build_object('project',to_jsonb(s),'message',msg,'passed',passed,'server_now',now());
end $$;

-- Preserve legacy commands; only placement reads the unified layout.
create or replace function public.farm_garden_command(p_user_id uuid,p_operation text,p_project_id uuid default null,p_pet_id uuid default null,p_request_id uuid default null,p_layout jsonb default null,p_x integer default null,p_y integer default null)
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
  elsif p_operation='draft' then
   if s.status<>'puzzle' or s.leader_id is null or not public.farm_layout_draft_valid(p_layout,true) then raise exception 'ผังร่างไม่ถูกต้อง';end if;
   s.draft_layout:=p_layout;
  elsif p_operation='submit' then
   if s.status<>'puzzle' or s.round_deadline is null or s.leader_id is null then raise exception 'เริ่มรอบช่วยต่อทางก่อน';end if;
   if not public.farm_layout_draft_valid(p_layout,true) then raise exception 'ผังร่างไม่ถูกต้อง';end if;
   s.draft_layout:=p_layout;
   expired:=s.round_deadline<=now();passed:=not expired and public.farm_garden_valid(p_layout);
   if passed then
    s.status:='finishing';s.round_deadline:=null;s.layout:=p_layout;s.remaining_seconds:=s.finish_seconds+case when s.penalty_applied then s.penalty_seconds else 0 end;
    s.ready_at:=now()+make_interval(secs=>s.remaining_seconds);msg:='ทางเดินพร้อมแล้ว คู่หูกำลังเก็บงาน';
   else
    s.failures:=s.failures+1;s.penalty_applied:=s.penalty_applied or s.failures>=3;if expired then s.round_deadline:=null;end if;
    msg:=case when expired then 'หมดเวลารอบนี้ เริ่มใหม่ได้เลย' else 'ทางยังไปไม่ถึงม้านั่ง ลองต่อใหม่ได้เลย' end;
   end if;
  elsif p_operation='place' then
   if s.status='placed' and s.tile_x=p_x and s.tile_y=p_y then passed:=true;
   else
    if s.status<>'ready' then raise exception 'สวนยังไม่พร้อมวาง';end if;
    if p_x is null or p_y is null or abs(p_x)>10000 or abs(p_y)>10000 then raise exception 'เลือกช่องว่างที่ติดฟาร์ม';end if;
    select public.farm_layout_candidate(p_user_id,s.id::text,'garden',p_x,p_y,0) into ok;
    if not ok then raise exception 'เลือกช่องว่างที่ติดฟาร์ม ไม่ทับพื้นที่เดิม';end if;
    s.status:='placed';s.tile_x:=p_x;s.tile_y:=p_y;passed:=true;
    perform public.farm_credit(p_user_id,'milestone:garden',r.milestone_coins);msg:='สวนต่อกับฟาร์มแล้ว!';
   end if;
  elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';end if;
  update public.farm_garden_projects set draft_layout=s.draft_layout,status=s.status,leader_id=s.leader_id,builder_id=s.builder_id,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,layout=s.layout,completed_at=s.completed_at where id=s.id returning * into s;
 end if;
 return jsonb_build_object('project',to_jsonb(s),'passed',passed,'message',msg,'server_now',now());
end $$;
