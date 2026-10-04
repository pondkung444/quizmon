-- Level 1 tutorial only. Trial timing is deliberately isolated from the economy.
create table public.farm_school_projects (
 user_id uuid primary key references auth.users(id) on delete cascade,
 leader_id uuid references public.pets(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','building','puzzle','finishing','paused','ready','placed')),
 resume_status text check(resume_status in ('building','puzzle','finishing')),
 ready_at timestamptz,
 remaining_seconds integer not null default 45 check(remaining_seconds>=0),
 round_deadline timestamptz,
 failures integer not null default 0 check(failures>=0),
 penalty_applied boolean not null default false,
 tile_x integer, tile_y integer,
 completed_at timestamptz,
 updated_at timestamptz not null default now(),
 check ((status='placed') = (tile_x is not null and tile_y is not null))
);
alter table public.farm_school_projects enable row level security;
revoke all on public.farm_school_projects from anon, authenticated;
grant select on public.farm_school_projects to authenticated;
grant all on public.farm_school_projects to service_role;
create policy school_owner_read on public.farm_school_projects for select to authenticated using ((select auth.uid())=user_id);
create index farm_school_leader_idx on public.farm_school_projects(leader_id) where leader_id is not null;

-- Pure validation: four identified pieces, exact coverage, valid rotations and coordinates.
create function public.farm_floor_valid(p_layout jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare p jsonb; seen text[]:='{}'; cells text[]:='{}'; id text; x int; y int; r int; dx int; dy int; cell text; k int;
begin
 if jsonb_typeof(p_layout)<>'array' or jsonb_array_length(p_layout)<>4 then return false; end if;
 for p in select value from jsonb_array_elements(p_layout) loop
  id:=p->>'id';
  if id is null or id not in ('sun','leaf','water','stone') or id=any(seen) then return false; end if;
  if not (p ?& array['x','y','rotation']) then return false; end if;
  if (p->>'x') !~ '^-?[0-9]+$' or (p->>'y') !~ '^-?[0-9]+$' or (p->>'rotation') !~ '^[0-3]$' then return false; end if;
  x:=(p->>'x')::int; y:=(p->>'y')::int; r:=(p->>'rotation')::int; seen:=array_append(seen,id);
  for k in 0..3 loop
   if id in ('sun','leaf') then dx:=k%2; dy:=k/2;
   elsif r%2=0 then dx:=k; dy:=0;
   else dx:=0; dy:=k; end if;
   if x+dx<0 or y+dy<0 or x+dx>3 or y+dy>3 then return false; end if;
   cell:=(x+dx)::text||','||(y+dy)::text;
   if cell=any(cells) then return false; end if;
   cells:=array_append(cells,cell);
  end loop;
 end loop;
 return cardinality(cells)=16;
exception when others then return false;
end $$;
revoke all on function public.farm_floor_valid(jsonb) from public, anon, authenticated;
grant execute on function public.farm_floor_valid(jsonb) to service_role;

-- Server-only RPC. The action authenticates the request and supplies user_id itself.
-- INVOKER: no hidden privilege escalation and no client write permissions.
create function public.farm_school_command(p_user_id uuid,p_operation text,p_pet_id uuid default null,p_layout jsonb default null,p_x integer default null,p_y integer default null)
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
 elsif p_operation='submit' then
  if s.status<>'puzzle' or s.round_deadline is null or s.leader_id is null then raise exception 'เริ่มรอบจัดพื้นก่อนตรวจงาน'; end if;
  expired:=s.round_deadline<=now(); passed:=not expired and public.farm_floor_valid(p_layout);
  if passed then
   s.status:='finishing'; s.round_deadline:=null; s.remaining_seconds:=45+case when s.penalty_applied then 15 else 0 end;
   s.ready_at:=now()+make_interval(secs=>s.remaining_seconds); msg:='ปูพื้นครบแล้ว! Qmon กำลังเก็บงานโรงเรียน';
  else
   s.failures:=s.failures+1; s.penalty_applied:=s.penalty_applied or s.failures>=3; s.round_deadline:=null;
   msg:=case when expired then 'หมดเวลารอบนี้ ลองใหม่ได้เลย' else 'พื้นยังไม่เต็มหรือมีชิ้นซ้อนกัน ลองใช้แผ่นยาวตามแนวขอบห้อง' end;
  end if;
 elsif p_operation='place' then
  if s.status<>'ready' then raise exception 'โรงเรียนยังไม่พร้อมวาง'; end if;
  -- Starter map is (0,0),(1,0),(0,1). Expand only to an empty adjoining plot.
  if p_x is null or p_y is null or not ((p_x=-1 and p_y=0) or (p_x=0 and p_y=-1) or (p_x=1 and p_y=-1) or (p_x=2 and p_y=0) or (p_x=1 and p_y=1) or (p_x=-1 and p_y=1) or (p_x=0 and p_y=2)) then raise exception 'เลือกพื้นที่ว่างที่เชื่อมกับฟาร์ม'; end if;
  s.status:='placed'; s.tile_x:=p_x; s.tile_y:=p_y;
 elsif p_operation<>'refresh' then raise exception 'คำสั่งไม่ถูกต้อง';
 end if;
 update public.farm_school_projects set leader_id=s.leader_id,status=s.status,resume_status=s.resume_status,ready_at=s.ready_at,remaining_seconds=s.remaining_seconds,round_deadline=s.round_deadline,failures=s.failures,penalty_applied=s.penalty_applied,tile_x=s.tile_x,tile_y=s.tile_y,completed_at=s.completed_at,updated_at=now() where user_id=p_user_id returning * into s;
 return jsonb_build_object('project',to_jsonb(s),'message',msg,'passed',passed,'server_now',now());
end $$;
revoke all on function public.farm_school_command(uuid,text,uuid,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.farm_school_command(uuid,text,uuid,jsonb,integer,integer) to service_role;

-- Serialize assignment with every Adventure insertion, including direct RPC calls.
-- Other games are untouched: Notion has not defined school/Raid exclusivity.
create function public.farm_guard_dungeon_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='in_progress' then
  perform 1 from public.pets where id=new.pet_id for update;
  if exists(select 1 from public.farm_school_projects where leader_id=new.pet_id and
   (status in ('building','puzzle') or (status='finishing' and ready_at>now()))) then
   raise exception 'Qmon ตัวนี้กำลังคุมงานโรงเรียน ถอนหัวหน้าจากโรงเรียนก่อนออกผจญภัย';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.farm_guard_dungeon_assignment() from public,anon,authenticated;
create trigger farm_guard_dungeon_assignment before insert or update of pet_id,status on public.dungeon_runs for each row execute function public.farm_guard_dungeon_assignment();
