begin;
do $test$
declare users uuid[]; board jsonb; stats jsonb; u uuid; n integer; hist jsonb;
begin
 select array_agg(id) into users from (select id from public.profiles order by id limit 3) p;
 if array_length(users,1)<3 then raise exception 'Need three existing profiles for rollback-only fixtures'; end if;
 for n in 1..3 loop
  u:=users[n];
  select jsonb_agg(jsonb_build_object('room',i,'battle',true,'boss',i in (10,20,30))) into hist from generate_series(1,case when n<3 then 30 else 12 end) i;
  insert into public.forest2048_runs(user_id,status,engine_state) values(u,'ended',jsonb_build_object('run',jsonb_build_object('journeyVersion',1,'mechanicsVersion',1,'contentVersion',1,'phase',case when n<3 then 'complete' else 'ended' end,'history',hist,'companion',jsonb_build_object('name','test','image','/pets/egg1_stage4_math_A.png'))));
 end loop;
 insert into public.forest2048_runs(user_id,engine_state) values(users[1],jsonb_build_object('run',jsonb_build_object('journeyVersion',1,'mechanicsVersion',1,'contentVersion',1,'history',(select jsonb_agg(jsonb_build_object('room',i)) from generate_series(1,7) i))));
 board:=public.forest2048_acts_board(users[1],0);
 if (board->>'players')::int<>3 or (board->'mine'->>'rooms')::int<>30 or (board->'mine'->>'rank')::int<>1 then raise exception 'Best run or mine failed'; end if;
 if (select count(*) from jsonb_array_elements(board->'leaders') r where r->>'rank'='1')<>2 then raise exception 'Shared rank failed'; end if;
 if not exists(select 1 from jsonb_array_elements(board->'leaders') r where r->>'rooms'='12' and r->>'rank'='3') then raise exception 'Lower rank failed'; end if;
 if jsonb_array_length(public.forest2048_acts_board(users[1],1)->'leaders')<>0 then raise exception 'Pagination failed'; end if;
 stats:=public.forest2048_acts_stats(users[1]);
 if (stats->>'runs')::int<>2 or (stats->>'best')::int<>30 or (stats->>'bosses')::int<>3 then raise exception 'Stats failed'; end if;
 if has_function_privilege('anon','public.forest2048_acts_stats(uuid)','execute') or has_function_privilege('authenticated','public.forest2048_acts_board(uuid,integer)','execute') then raise exception 'Role restriction failed'; end if;
 raise notice 'PASS: best run, shared ranks, pagination, stats, service-only grants';
end $test$;
rollback;
select public.forest2048_acts_board(null,0) as board_after_rollback;
