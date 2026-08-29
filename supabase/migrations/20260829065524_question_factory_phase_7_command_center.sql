begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Phase 7 deliberately runs only one open production Run across the whole Factory.
create unique index question_factory_runs_one_open_global_idx
  on public.question_factory_runs ((1))
  where status in ('created','running','paused','waiting_human_review');

create function public.question_factory_command_run(p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_created jsonb; v_started jsonb; v_budget jsonb; v_run_id bigint; v_run public.question_factory_runs%rowtype;
begin
  if p_command is null or pg_catalog.jsonb_typeof(p_command)<>'object'
     or p_command->>'run_key' is null or p_command->>'request_checksum' is null
     or pg_catalog.jsonb_typeof(p_command->'profile')<>'object'
     or pg_catalog.jsonb_typeof(p_command->'blueprint')<>'object'
     or pg_catalog.jsonb_typeof(p_command->'slots')<>'array' then raise exception 'invalid Factory command'; end if;
  perform pg_catalog.pg_advisory_xact_lock(7041001);
  v_created:=public.question_factory_create_run(
    (p_command->>'run_key')::uuid,p_command->>'request_checksum',p_command->>'scope_key',p_command->>'actor_id',
    p_command->'profile'->>'id',p_command->'profile'->>'version',p_command->'profile'->>'schema_version',
    p_command->'profile'->>'checksum',p_command->'profile'->'resolved',p_command->'blueprint'->>'id',
    p_command->'blueprint'->>'version',p_command->'blueprint'->>'schema_version',
    p_command->'blueprint'->>'checksum',p_command->'blueprint'->'resolved',(p_command->>'target_active')::integer,
    (p_command->>'preferred_batch_size')::integer,(p_command->>'max_batch_size')::integer,
    (p_command->>'max_generated_items')::integer,(p_command->>'max_revisions_per_slot')::smallint,
    (p_command->>'max_technical_retries')::smallint,p_command->'slots');
  v_run_id:=(v_created->>'run_id')::bigint;
  select * into v_run from public.question_factory_runs where id=v_run_id;
  if (v_created->>'replayed')::boolean then
    if exists(select 1 from public.question_factory_run_budgets where run_id=v_run_id)
       and v_run.status in ('running','paused','waiting_human_review') then
      return pg_catalog.jsonb_build_object('run_id',v_run.id,'run_key',v_run.run_key,'status',v_run.status,
        'state_version',v_run.state_version,'replayed',true);
    end if;
    if v_run.status<>'created' then raise exception 'command replay found an incompatible Run state'; end if;
  end if;
  v_started:=public.question_factory_start_run((p_command->>'run_key')::uuid,0,
    p_command->>'idempotency_key'||':start',p_command->>'actor_id');
  v_budget:=public.question_factory_configure_run_budget((p_command->>'run_key')::uuid,
    (v_started->>'state_version')::bigint,(p_command->>'generated_item_limit')::integer,
    (p_command->>'asset_build_limit')::integer,(p_command->>'technical_retry_limit')::integer,
    (p_command->>'cost_limit_microunits')::bigint,p_command->>'actor_id',p_command->>'idempotency_key'||':budget');
  return pg_catalog.jsonb_build_object('run_id',v_run_id,'run_key',p_command->>'run_key','status','running',
    'state_version',(v_started->>'state_version')::bigint,'budget_version',(v_budget->>'budget_version')::bigint,
    'replayed',false);
end $$;

create function public.question_factory_control_run(
  p_run_key uuid, p_expected_state_version bigint, p_action text,
  p_actor_id text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_event public.question_factory_events%rowtype;
  v_from text; v_to text; v_cancelled integer:=0; v_now timestamptz:=pg_catalog.now();
begin
  if p_expected_state_version is null or p_expected_state_version<0
     or p_action not in ('pause','resume','cancel')
     or nullif(pg_catalog.btrim(p_actor_id),'') is null
     or nullif(pg_catalog.btrim(p_idempotency_key),'') is null then
    raise exception 'invalid Run control input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,31));
  select * into v_run from public.question_factory_runs where run_key=p_run_key for update;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id<>v_run.id or v_event.event_type<>(case p_action when 'pause' then 'RUN_PAUSED'
      when 'resume' then 'RUN_RESUMED' else 'RUN_CANCELLED' end) then
      raise exception 'idempotency key belongs to another operation'; end if;
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'run_key',v_run.run_key,'status',v_run.status,
      'state_version',v_run.state_version,'replayed',true);
  end if;
  if v_run.state_version<>p_expected_state_version then raise exception 'run state/version conflict'; end if;
  v_from:=v_run.status;
  if p_action='pause' then
    if v_from not in ('running','waiting_human_review') then raise exception 'Run cannot be paused from %',v_from; end if;
    v_to:='paused';
  elsif p_action='resume' then
    if v_from<>'paused' then raise exception 'Run cannot be resumed from %',v_from; end if;
    v_to:=case when exists(select 1 from public.question_factory_slots where run_id=v_run.id
      and state='pending_human_review') and not exists(select 1 from public.question_factory_slots
      where run_id=v_run.id and state not in ('pending_human_review','active','rejected','cancelled'))
      then 'waiting_human_review' else 'running' end;
  else
    if v_from not in ('created','running','paused','waiting_human_review') then
      raise exception 'Run cannot be cancelled from %',v_from; end if;
    if exists(select 1 from public.question_factory_slots where run_id=v_run.id and state='active')
       or exists(select 1 from public.question_factory_product_mappings where run_id=v_run.id) then
      raise exception 'Run with active/product-mapped content cannot be cancelled'; end if;
    update public.question_factory_slots set state='cancelled',state_version=state_version+1,
      updated_at=v_now where run_id=v_run.id and state not in ('rejected','cancelled');
    get diagnostics v_cancelled=row_count;
    v_to:='cancelled';
  end if;
  update public.question_factory_runs set status=v_to,state_version=state_version+1,
    pipeline_ready_count=case when v_to='cancelled' then 0 else pipeline_ready_count end,
    updated_at=v_now where id=v_run.id and state_version=p_expected_state_version returning * into v_run;
  if not found then raise exception 'run state/version conflict'; end if;
  if p_action in ('pause','cancel') then
    update public.question_factory_run_leases set state='released',lease_version=lease_version+1,
      released_at=v_now,updated_at=v_now,last_idempotency_key=p_idempotency_key||':lease',
      last_event_type='RUN_LEASE_RELEASED' where run_id=v_run.id and state='active';
  end if;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,case p_action when 'pause' then 'RUN_PAUSED'
    when 'resume' then 'RUN_RESUMED' else 'RUN_CANCELLED' end,v_from,v_to,
    case p_action when 'pause' then 'ADMIN_PAUSE' when 'resume' then 'ADMIN_RESUME' else 'ADMIN_CANCEL' end,
    pg_catalog.jsonb_build_object('state_version',v_run.state_version,'cancelled_slots',v_cancelled),
    'human',p_actor_id,p_idempotency_key) returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'run_key',v_run.run_key,'status',v_run.status,
    'state_version',v_run.state_version,'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_next_work_order(p_run_key uuid,p_lease_token uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_slot public.question_factory_slots%rowtype; v_action text;
begin
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found then raise exception 'unknown Factory run'; end if;
  if v_run.status<>'running' then return pg_catalog.jsonb_build_object('run_id',v_run.id,'available',false,
    'reason','RUN_NOT_RUNNING','status',v_run.status); end if;
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id;
  if not found or v_lease.state<>'active' or v_lease.expires_at<=pg_catalog.now()
     or v_lease.lease_token<>p_lease_token then raise exception 'active lease token required'; end if;
  select * into v_slot from public.question_factory_slots where run_id=v_run.id
    and state in ('planned','authoring','author_revision','question_qc','asset_build','asset_qc')
    order by case state when 'question_qc' then 1 when 'asset_qc' then 2 when 'author_revision' then 3
      when 'authoring' then 4 when 'asset_build' then 5 else 6 end, ordinal limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'available',false,'reason',
      case when exists(select 1 from public.question_factory_slots where run_id=v_run.id and state='pending_human_review')
      then 'WAITING_HUMAN_REVIEW' else 'NO_PROCESSABLE_SLOT' end,'status',v_run.status);
  end if;
  v_action:=case v_slot.state when 'planned' then 'START_AUTHORING' when 'authoring' then 'AUTHOR_CANDIDATE'
    when 'author_revision' then 'REVISE_CANDIDATE' when 'question_qc' then 'QUESTION_QC'
    when 'asset_build' then 'BUILD_ASSET' else 'ASSET_QC' end;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'available',true,'action',v_action,
    'slot_id',v_slot.id,'slot_key',v_slot.slot_key,'ordinal',v_slot.ordinal,'state',v_slot.state,
    'state_version',v_slot.state_version,'slot_spec',v_slot.slot_spec,'lease_version',v_lease.lease_version);
end $$;

revoke all on function public.question_factory_command_run(jsonb),
  public.question_factory_control_run(uuid,bigint,text,text,text),
  public.question_factory_next_work_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.question_factory_command_run(jsonb),
  public.question_factory_control_run(uuid,bigint,text,text,text),
  public.question_factory_next_work_order(uuid,uuid) to service_role;
comment on index public.question_factory_runs_one_open_global_idx is
  'Phase 7 global single-open-Run invariant; terminal Runs do not block new intake.';
comment on function public.question_factory_next_work_order(uuid,uuid) is
  'Lease-gated deterministic next work order. It never approves, publishes, or activates content.';
commit;
