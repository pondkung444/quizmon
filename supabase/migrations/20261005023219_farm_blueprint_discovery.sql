create table public.farm_blueprint_discoveries (
 user_id uuid not null references auth.users(id) on delete cascade,
 blueprint_id text not null check(blueprint_id='garden-rest-v1'),
 pet_id uuid references public.pets(id) on delete set null,
 lesson_version integer not null default 1 check(lesson_version=1),
 completed_at timestamptz not null default now(),
 primary key(user_id,blueprint_id)
);
alter table public.farm_blueprint_discoveries enable row level security;
revoke all on public.farm_blueprint_discoveries from anon,authenticated;
grant select on public.farm_blueprint_discoveries to authenticated;
grant all on public.farm_blueprint_discoveries to service_role;
create policy blueprint_owner_read on public.farm_blueprint_discoveries for select to authenticated using ((select auth.uid())=user_id);
create index farm_blueprint_pet_idx on public.farm_blueprint_discoveries(pet_id) where pet_id is not null;
-- The authenticated server action validates the lesson answers before invoking this service-only command.
-- Recheck prerequisites here so a stale client or a race cannot grant a discovery.
create function public.farm_discover_blueprint(p_user_id uuid,p_pet_id uuid,p_blueprint_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare discovery public.farm_blueprint_discoveries; created boolean;
begin
 if p_blueprint_id is distinct from 'garden-rest-v1' then raise exception 'แบบสร้างนี้ยังไม่เปิดให้เรียน'; end if;
 if not exists(select 1 from public.farm_school_projects where user_id=p_user_id and status='placed' for share) then raise exception 'วางโรงเรียนในฟาร์มก่อน แล้วกลับมาเรียนได้เลย'; end if;
 if not exists(select 1 from public.pets where id=p_pet_id and user_id=p_user_id and stage between 2 and 4 for share) then raise exception 'เลือก Qmon ที่ฟักเป็นตัวของเรา ระยะ 2–4'; end if;
 insert into public.farm_blueprint_discoveries(user_id,blueprint_id,pet_id)
 values(p_user_id,p_blueprint_id,p_pet_id) on conflict(user_id,blueprint_id) do nothing returning * into discovery;
 created:=found;
 if not created then select * into discovery from public.farm_blueprint_discoveries where user_id=p_user_id and blueprint_id=p_blueprint_id; end if;
 return jsonb_build_object('created',created,'discovery',jsonb_build_object('blueprint_id',discovery.blueprint_id,'pet_id',discovery.pet_id,'completed_at',discovery.completed_at));
end $$;
revoke all on function public.farm_discover_blueprint(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.farm_discover_blueprint(uuid,uuid,text) to service_role;
