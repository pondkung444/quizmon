-- Immutable server-only puzzle sessions. No solution or generator seed is exposed
-- through authenticated table grants or the compatibility view.
alter table public.farm_project_checkpoints add column session_id uuid not null default gen_random_uuid();
alter table public.farm_project_checkpoints add column draft_revision integer not null default 0 check(draft_revision>=0);
create table public.farm_puzzle_submissions (
 project_id uuid not null references public.farm_projects(id) on delete cascade,
 request_id uuid not null, session_id uuid not null, response jsonb not null,
 primary key(project_id,request_id)
);
alter table public.farm_puzzle_submissions enable row level security;
revoke all on public.farm_puzzle_submissions from public,anon,authenticated;
grant all on public.farm_puzzle_submissions to service_role;

create function public.farm_puzzle_open(p_user uuid,p_id uuid,p_checkpoint integer,p_puzzle jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;c public.farm_project_checkpoints;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 s:=public.farm_project_refresh(p_user,p_id);
 if s.status<>'puzzle' or s.checkpoint<>p_checkpoint then raise exception 'จุดช่วยเปลี่ยนแล้ว';end if;
 if jsonb_typeof(p_puzzle)<>'object' or octet_length(p_puzzle::text)>65536 or
    (p_puzzle->>'version')::integer<>(s.rules_snapshot->>'contentVersion')::integer then raise exception 'ผังไม่ตรงรุ่น';end if;
 insert into public.farm_project_checkpoints(project_id,checkpoint,content_version,puzzle)
 values(p_id,p_checkpoint,(s.rules_snapshot->>'contentVersion')::integer,p_puzzle)
 on conflict(project_id,checkpoint) do nothing;
 select * into c from public.farm_project_checkpoints where project_id=p_id and checkpoint=p_checkpoint;
 if c.puzzle is null or c.completed_at is not null then raise exception 'ผังไม่พร้อม';end if;
 return jsonb_build_object('session',to_jsonb(c),'project',to_jsonb(s));
end $$;

create function public.farm_puzzle_draft(p_user uuid,p_id uuid,p_session uuid,p_revision integer,p_draft jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;c public.farm_project_checkpoints;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into s from public.farm_projects where id=p_id and user_id=p_user for update;
 if not found or s.status<>'puzzle' then raise exception 'ไม่พบจุดช่วยที่กำลังเล่น';end if;
 select * into c from public.farm_project_checkpoints where project_id=p_id and checkpoint=s.checkpoint for update;
 if c.session_id is distinct from p_session or c.completed_at is not null then raise exception 'ผังเปลี่ยนแล้ว';end if;
 if p_revision is null or p_revision<0 or p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>8192 then raise exception 'ผังร่างไม่ถูกต้อง';end if;
 if p_revision<>c.draft_revision then return jsonb_build_object('revision',c.draft_revision,'draft',c.draft,'saved',false);end if;
 update public.farm_project_checkpoints set draft=p_draft,draft_revision=draft_revision+1
 where project_id=p_id and checkpoint=s.checkpoint returning * into c;
 return jsonb_build_object('revision',c.draft_revision,'draft',c.draft,'saved',true);
end $$;

-- p_passed is computed by the trusted puzzle server against the stored puzzle.
-- The session/deadline comparison rejects an old response arriving in a new round.
create function public.farm_puzzle_submit(p_user uuid,p_id uuid,p_session uuid,p_deadline timestamptz,p_request uuid,p_draft jsonb,p_passed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_projects;c public.farm_project_checkpoints;result jsonb;passed boolean;
begin
 if p_user is null or p_request is null or p_passed is null then raise exception 'ข้อมูลคำตอบไม่ถูกต้อง';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into s from public.farm_projects where id=p_id and user_id=p_user for update;
 if not found then raise exception 'ไม่พบโครงการของเรา';end if;
 select response into result from public.farm_puzzle_submissions where project_id=p_id and request_id=p_request;
 if found then return result;end if;
 select * into c from public.farm_project_checkpoints where project_id=p_id and checkpoint=s.checkpoint for update;
 if s.status<>'puzzle' or c.session_id is distinct from p_session or c.completed_at is not null or
    s.round_deadline is null or s.round_deadline is distinct from p_deadline then raise exception 'รอบเล่นเปลี่ยนแล้ว';end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>8192 then raise exception 'คำตอบไม่ถูกต้อง';end if;
 update public.farm_project_checkpoints set draft=p_draft,draft_revision=draft_revision+1 where project_id=p_id and checkpoint=s.checkpoint;
 passed:=p_passed and s.round_deadline>now();
 result:=jsonb_build_object('passed',passed,'project',public.farm_project_checkpoint_result(p_user,p_id,passed));
 insert into public.farm_puzzle_submissions values(p_id,p_request,p_session,result);
 return result;
end $$;
revoke all on function public.farm_puzzle_open(uuid,uuid,integer,jsonb),public.farm_puzzle_draft(uuid,uuid,uuid,integer,jsonb),public.farm_puzzle_submit(uuid,uuid,uuid,timestamptz,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.farm_puzzle_open(uuid,uuid,integer,jsonb),public.farm_puzzle_draft(uuid,uuid,uuid,integer,jsonb),public.farm_puzzle_submit(uuid,uuid,uuid,timestamptz,uuid,jsonb,boolean) to service_role;

-- Additive legacy draft storage: existing saves, prices and timing are untouched.
alter table public.farm_school_projects add column draft_layout jsonb not null default '[]';
alter table public.farm_garden_projects add column draft_layout jsonb not null default '[]';
create function public.farm_layout_draft_valid(p_layout jsonb,p_garden boolean) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb;ids text[]:='{}';allowed text[];
begin
 if p_layout is null or jsonb_typeof(p_layout)<>'array' then return false;end if;
 if jsonb_array_length(p_layout)>(case when p_garden then 5 else 4 end) then return false;end if;
 allowed:=case when p_garden then array['straight-a','straight-b','bend-a','bend-b','bend-c'] else array['sun','leaf','water','stone'] end;
 for p in select value from jsonb_array_elements(p_layout) loop
  if jsonb_typeof(p)<>'object' or not coalesce(p->>'id'=any(allowed),false) or p->>'id'=any(ids) then return false;end if;
  if not coalesce((p->>'x')~'^[0-3]$' and (p->>'y')~'^[0-3]$' and (p->>'rotation')~'^[0-3]$',false) then return false;end if;
  ids:=array_append(ids,p->>'id');
 end loop;
 return true;
end $$;
revoke all on function public.farm_layout_draft_valid(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.farm_layout_draft_valid(jsonb,boolean) to service_role;

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
  if p_x is null or p_y is null or not ((p_x=-1 and p_y=0) or (p_x=0 and p_y=-1) or (p_x=1 and p_y=-1) or (p_x=2 and p_y=0) or (p_x=1 and p_y=1) or (p_x=-1 and p_y=1) or (p_x=0 and p_y=2)) then raise exception 'เลือกพื้นที่ว่างที่เชื่อมกับฟาร์ม'; end if;
  s.status:='placed'; s.tile_x:=p_x; s.tile_y:=p_y;
 elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';
 end if;
 update public.farm_school_projects set draft_layout=s.draft_layout,leader_id=s.leader_id,status=s.status,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,completed_at=s.completed_at,updated_at=now() where user_id=p_user_id returning * into s;
 return jsonb_build_object('project',to_jsonb(s),'message',msg,'passed',passed,'server_now',now());
end $$;

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
    with plots(x,y) as (values(0,0),(1,0),(0,1) union all select tile_x,tile_y from public.farm_school_projects where user_id=p_user_id and status='placed' union all select tile_x,tile_y from public.farm_garden_projects where user_id=p_user_id and status='placed')
    select not exists(select 1 from plots where x=p_x and y=p_y) and exists(select 1 from plots where abs(x-p_x)+abs(y-p_y)=1) into ok;
    if not ok then raise exception 'เลือกช่องว่างที่ติดฟาร์ม ไม่ทับพื้นที่เดิม';end if;
    s.status:='placed';s.tile_x:=p_x;s.tile_y:=p_y;passed:=true;
    perform public.farm_credit(p_user_id,'milestone:garden',r.milestone_coins);msg:='สวนต่อกับฟาร์มแล้ว!';
   end if;
  elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';end if;
  update public.farm_garden_projects set draft_layout=s.draft_layout,status=s.status,leader_id=s.leader_id,builder_id=s.builder_id,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,layout=s.layout,completed_at=s.completed_at where id=s.id returning * into s;
 end if;
 return jsonb_build_object('project',to_jsonb(s),'passed',passed,'message',msg,'server_now',now());
end $$;


alter table public.farm_blueprint_discoveries drop constraint farm_blueprint_discoveries_blueprint_id_check;
alter table public.farm_blueprint_discoveries add constraint farm_blueprint_discoveries_blueprint_id_check check(blueprint_id in ('garden-rest-v1','pond-cycle-v1','flower-photosynthesis-v1','bridge-balance-v1','observatory-orbits-v1'));
alter table public.farm_blueprint_discoveries drop constraint farm_blueprint_discoveries_lesson_version_check;
alter table public.farm_blueprint_discoveries add constraint farm_blueprint_discoveries_lesson_version_check check(lesson_version>0);
create table public.farm_lesson_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, blueprint_id text not null,
 session_id uuid not null default gen_random_uuid(),pet_id uuid references public.pets(id) on delete set null,
 content_version integer not null,puzzle jsonb not null,draft jsonb,draft_revision integer not null default 0,
 failures integer not null default 0,completed_at timestamptz,
 primary key(user_id,blueprint_id),unique(session_id)
);
alter table public.farm_lesson_sessions enable row level security;
revoke all on public.farm_lesson_sessions from public,anon,authenticated;
grant all on public.farm_lesson_sessions to service_role;
create function public.farm_lesson_open(p_user uuid,p_blueprint text,p_pet uuid,p_puzzle jsonb,p_replay boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.farm_catalogue;s public.farm_lesson_sessions;
begin
 if p_user is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into c from public.farm_catalogue where definition->>'blueprint'=p_blueprint and id<>'garden';
 if not found or not c.enabled then raise exception 'บทเรียนนี้ยังไม่เปิด';end if;
 if public.farm_school_level(p_user)<(c.definition->>'schoolLevel')::int then raise exception 'พัฒนาโรงเรียนก่อนเรียนบทนี้';end if;
 if not exists(select 1 from public.pets where id=p_pet and user_id=p_user and stage between 2 and 4 for share) then raise exception 'เลือก Qmon ระยะ 2–4 ของเรา';end if;
 if p_puzzle is null or jsonb_typeof(p_puzzle)<>'object' or octet_length(p_puzzle::text)>65536 or (p_puzzle->>'version')::int<>(c.definition->>'contentVersion')::int then raise exception 'ผังไม่ตรงรุ่น';end if;
 select * into s from public.farm_lesson_sessions where user_id=p_user and blueprint_id=p_blueprint;
 if not found then
  insert into public.farm_lesson_sessions(user_id,blueprint_id,pet_id,content_version,puzzle)
  values(p_user,p_blueprint,p_pet,(c.definition->>'contentVersion')::int,p_puzzle) returning * into s;
 elsif s.completed_at is not null and p_replay then
  update public.farm_lesson_sessions set session_id=gen_random_uuid(),pet_id=p_pet,puzzle=p_puzzle,content_version=(c.definition->>'contentVersion')::int,draft=null,draft_revision=0,failures=0,completed_at=null where user_id=p_user and blueprint_id=p_blueprint returning * into s;
 end if;
 return to_jsonb(s);
end $$;
create function public.farm_lesson_answer(p_user uuid,p_session uuid,p_revision integer,p_draft jsonb,p_submit boolean,p_passed boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.farm_lesson_sessions;created boolean:=false;
begin
 if p_user is null or p_submit is null then raise exception 'ต้องเข้าสู่ระบบก่อน';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,729));
 select * into s from public.farm_lesson_sessions where session_id=p_session and user_id=p_user for update;
 if not found then raise exception 'ไม่พบบทเรียนของเรา';end if;
 if s.completed_at is not null then return jsonb_build_object('passed',true,'created',false,'revision',s.draft_revision,'draft',s.draft,'saved',false);end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>8192 or p_revision is null or p_revision<0 then raise exception 'คำตอบไม่ถูกต้อง';end if;
 if p_revision<>s.draft_revision then return jsonb_build_object('passed',false,'created',false,'revision',s.draft_revision,'draft',s.draft,'saved',false);end if;
 if p_submit and p_passed then
  if not exists(select 1 from public.pets where id=s.pet_id and user_id=p_user and stage between 2 and 4 for share) then raise exception 'เลือก Qmon ที่ฟักแล้วของเรา';end if;
  insert into public.farm_blueprint_discoveries(user_id,blueprint_id,pet_id,lesson_version)
  values(p_user,s.blueprint_id,s.pet_id,s.content_version) on conflict(user_id,blueprint_id) do nothing;
  created:=found;
 end if;
 update public.farm_lesson_sessions set draft=p_draft,draft_revision=draft_revision+1,
 failures=failures+case when p_submit and not p_passed then 1 else 0 end,
 completed_at=case when p_submit and p_passed then now() else null end
 where session_id=p_session returning * into s;
 return jsonb_build_object('passed',s.completed_at is not null,'created',created,'revision',s.draft_revision,'draft',s.draft,'saved',true);
end $$;
revoke all on function public.farm_lesson_open(uuid,text,uuid,jsonb,boolean),public.farm_lesson_answer(uuid,uuid,integer,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.farm_lesson_open(uuid,text,uuid,jsonb,boolean),public.farm_lesson_answer(uuid,uuid,integer,jsonb,boolean,boolean) to service_role;
