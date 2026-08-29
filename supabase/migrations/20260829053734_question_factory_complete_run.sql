begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.question_factory_complete_run(
  p_run_key uuid,
  p_expected_state_version bigint,
  p_actor_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.question_factory_runs%rowtype;
  v_event public.question_factory_events%rowtype;
  v_slot_count integer;
  v_active_count integer;
  v_ready_count integer;
  v_rejected_count integer;
  v_cancelled_count integer;
  v_nonterminal_count integer;
begin
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception 'expected_state_version must be nonnegative';
  end if;
  if nullif(pg_catalog.btrim(p_actor_id), '') is null
     or nullif(pg_catalog.btrim(p_idempotency_key), '') is null then
    raise exception 'actor_id and idempotency_key are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text, 11));
  select * into v_run from public.question_factory_runs where run_key=p_run_key for update;
  if not found then raise exception 'unknown Factory run'; end if;

  select * into v_event
  from public.question_factory_events
  where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id <> v_run.id or v_event.slot_id is not null
       or v_event.event_type <> 'RUN_COMPLETED'
       or (v_event.payload->>'active_count')::integer <> v_run.active_count then
      raise exception 'idempotency key belongs to another Run completion';
    end if;
    if v_run.status <> 'completed' or v_run.completed_at is null then
      raise exception 'Run completion event exists but current state is inconsistent';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id',v_run.id,'status',v_run.status,'state_version',v_run.state_version,
      'active_count',v_run.active_count,'pipeline_ready_count',v_run.pipeline_ready_count,
      'completed_at',v_run.completed_at,'replayed',true
    );
  end if;

  if v_run.status <> 'running' or v_run.state_version <> p_expected_state_version then
    raise exception 'run state/version conflict';
  end if;

  select count(*),
         count(*) filter(where state='active'),
         count(*) filter(where state='approved'),
         count(*) filter(where state='rejected'),
         count(*) filter(where state='cancelled'),
         count(*) filter(where state not in ('active','rejected','cancelled'))
  into v_slot_count,v_active_count,v_ready_count,v_rejected_count,v_cancelled_count,v_nonterminal_count
  from public.question_factory_slots
  where run_id=v_run.id;

  if v_slot_count = 0 or v_nonterminal_count <> 0 or v_ready_count <> 0
     or v_active_count <> v_run.target_active then
    raise exception 'run is not terminal: slots %, active %, target %, approved %, nonterminal %',
      v_slot_count,v_active_count,v_run.target_active,v_ready_count,v_nonterminal_count;
  end if;
  if v_run.active_count <> v_active_count or v_run.pipeline_ready_count <> v_ready_count then
    raise exception 'run counters do not match terminal Slot facts';
  end if;
  if (
    select count(*)
    from public.question_factory_slots s
    join public.questions q on q.id=s.question_id and q.status='active'
    join public.question_factory_product_mappings pm
      on pm.run_id=s.run_id and pm.slot_id=s.id and pm.question_id=q.id
    where s.run_id=v_run.id and s.state='active'
      and pm.mapping_version='question-product-mapping/v1'
      and pm.mapping_input->>'checksum'=pm.checksum
  ) <> v_active_count then
    raise exception 'active Slots do not have exact active product mappings';
  end if;

  update public.question_factory_runs
  set status='completed',
      state_version=state_version+1,
      coverage_summary=coverage_summary || pg_catalog.jsonb_build_object(
        'terminal_slot_count',v_slot_count,
        'active_slot_count',v_active_count,
        'rejected_slot_count',v_rejected_count,
        'cancelled_slot_count',v_cancelled_count
      ),
      completed_at=pg_catalog.now(),
      updated_at=pg_catalog.now()
  where id=v_run.id and status='running' and state_version=p_expected_state_version
  returning * into v_run;
  if not found then raise exception 'run state/version conflict'; end if;

  insert into public.question_factory_events(
    run_id,slot_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key
  ) values (
    v_run.id,null,'RUN_COMPLETED','running','completed','TARGET_ACTIVE_AND_TERMINAL_SLOTS_VERIFIED',
    pg_catalog.jsonb_build_object(
      'slot_count',v_slot_count,'active_count',v_active_count,
      'pipeline_ready_count',v_ready_count,'rejected_count',v_rejected_count,
      'cancelled_count',v_cancelled_count,'state_version',v_run.state_version,
      'completed_at',v_run.completed_at
    ),
    'worker',p_actor_id,p_idempotency_key
  ) returning * into v_event;

  return pg_catalog.jsonb_build_object(
    'run_id',v_run.id,'status',v_run.status,'state_version',v_run.state_version,
    'active_count',v_run.active_count,'pipeline_ready_count',v_run.pipeline_ready_count,
    'completed_at',v_run.completed_at,'event_id',v_event.id,'replayed',false
  );
end;
$$;

revoke all on function public.question_factory_complete_run(uuid,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.question_factory_complete_run(uuid,bigint,text,text)
  to service_role;
comment on function public.question_factory_complete_run(uuid,bigint,text,text) is
  'Completes a running Factory Run only when all Slots are terminal, the target active count is exact, counters agree, and every active Slot has an exact active product mapping. Service role only.';

commit;
