-- Run in a disposable test database or a transaction. Never keep fixture changes.
begin;
do $$
declare u uuid; p uuid; egg uuid; d uuid; result jsonb;
layout jsonb:='[{"id":"water","x":0,"y":0,"rotation":0},{"id":"stone","x":0,"y":1,"rotation":0},{"id":"sun","x":0,"y":2,"rotation":0},{"id":"leaf","x":2,"y":2,"rotation":0}]';
begin
 select user_id into u from public.pets where user_id not in(select user_id from public.farm_school_projects) limit 1;
 if u is null then raise exception 'Seed a fixture owner without a school first'; end if;
 insert into public.pets(user_id,egg_type_id,stage,is_active) select u,id,2,false from public.egg_types limit 1 returning id into p;
 insert into public.pets(user_id,egg_type_id,stage,is_active) select u,id,1,false from public.egg_types limit 1 returning id into egg;
 begin perform public.farm_school_command(u,'start',egg); raise exception 'TEST egg accepted';
 exception when others then if sqlerrm='TEST egg accepted' then raise; end if; end;
 result:=public.farm_school_command(u,'start',p);
 if result#>>'{project,status}'<>'building' then raise exception 'Start failed'; end if;
 select id into d from public.dungeon_types where is_active limit 1;
 begin insert into public.dungeon_runs(user_id,pet_id,dungeon_type_id,ends_at) values(u,p,d,now()+interval '1 hour'); raise exception 'TEST double assignment';
 exception when others then if sqlerrm not like 'Qmon ตัวนี้กำลังคุมงานโรงเรียน%' then raise; end if; end;
 perform public.farm_school_command(u,'pause');
 insert into public.dungeon_runs(user_id,pet_id,dungeon_type_id,ends_at) values(u,p,d,now()+interval '1 hour');
 begin perform public.farm_school_command(u,'resume',p); raise exception 'TEST busy leader accepted';
 exception when others then if sqlerrm not like 'Qmon ตัวนี้ติดงานผจญภัย%' then raise; end if; end;
 update public.dungeon_runs set status='claimed',claimed_at=now() where pet_id=p;
 perform public.farm_school_command(u,'resume',p);
 update public.farm_school_projects set ready_at=now()-interval '1 second' where user_id=u;
 result:=public.farm_school_command(u,'refresh');
 if result#>>'{project,status}'<>'puzzle' then raise exception 'Checkpoint skipped'; end if;
 for i in 1..3 loop perform public.farm_school_command(u,'begin'); perform public.farm_school_command(u,'submit',null,'[]'); end loop;
 perform public.farm_school_command(u,'begin');
 result:=public.farm_school_command(u,'submit',null,layout);
 if result#>>'{project,status}'<>'finishing' or (result#>>'{project,remaining_seconds}')::int<>60 then raise exception 'Validation or penalty failed'; end if;
 update public.farm_school_projects set ready_at=now()-interval '1 second' where user_id=u;
 result:=public.farm_school_command(u,'place',null,null,1,1);
 if result#>>'{project,status}'<>'placed' or result#>>'{project,leader_id}' is not null then raise exception 'Completion failed'; end if;
 if has_table_privilege('authenticated','public.farm_school_projects','UPDATE') or has_function_privilege('authenticated','public.farm_school_command(uuid,text,uuid,jsonb,integer,integer)','EXECUTE') then raise exception 'Client mutation is exposed'; end if;
end $$;
rollback;
