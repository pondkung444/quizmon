begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.question_factory_create_run(
  p_run_key uuid, p_request_checksum text, p_scope_key text, p_created_by text,
  p_profile_id text, p_profile_version text, p_profile_schema_version text,
  p_profile_checksum text, p_resolved_profile jsonb, p_blueprint_id text,
  p_blueprint_version text, p_blueprint_schema_version text, p_blueprint_checksum text,
  p_resolved_blueprint jsonb, p_target_active integer, p_preferred_batch_size integer,
  p_max_batch_size integer, p_max_generated_items integer, p_max_revisions_per_slot smallint,
  p_max_technical_retries smallint, p_slots jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_profile_snapshot_id bigint;
  v_blueprint_snapshot_id bigint;
  v_run_id bigint;
  v_existing public.question_factory_runs%rowtype;
  v_slot jsonb;
  v_slot_id bigint;
  v_existing_request_checksum text;
  v_slot_count integer;
begin
  if p_run_key is null then raise exception 'run_key is required'; end if;
  if p_request_checksum !~ '^sha256:[0-9a-f]{64}$' then raise exception 'request checksum must be canonical sha256'; end if;
  if p_created_by is null or btrim(p_created_by) = '' then raise exception 'created_by is required'; end if;
  if p_resolved_profile is null or jsonb_typeof(p_resolved_profile) <> 'object' then raise exception 'resolved_profile must be an object'; end if;
  if p_resolved_blueprint is null or jsonb_typeof(p_resolved_blueprint) <> 'object' then raise exception 'resolved_blueprint must be an object'; end if;
  if p_profile_checksum !~ '^sha256:[0-9a-f]{64}$' or p_blueprint_checksum !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'snapshot checksums must be canonical sha256 values';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'slots must be an array'; end if;
  v_slot_count := jsonb_array_length(p_slots);
  if v_slot_count = 0 then raise exception 'a run requires at least one coverage-gap slot'; end if;
  if v_slot_count > p_max_generated_items then raise exception 'slot count exceeds max_generated_items'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_slots) item
    where jsonb_typeof(item) <> 'object' or nullif(btrim(item->>'slot_key'), '') is null
      or (item->>'ordinal') is null or (item->>'ordinal') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(item->'slot_spec') <> 'object'
  ) then raise exception 'each slot requires slot_key, positive ordinal, and object slot_spec'; end if;
  if (select count(*) from jsonb_array_elements(p_slots)) <>
     (select count(distinct item->>'slot_key') from jsonb_array_elements(p_slots) item)
  then raise exception 'slot_key values must be unique'; end if;
  if (select count(*) from jsonb_array_elements(p_slots)) <>
     (select count(distinct (item->>'ordinal')::integer) from jsonb_array_elements(p_slots) item)
  then raise exception 'slot ordinals must be unique'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text, 0));
  select * into v_existing from public.question_factory_runs where run_key = p_run_key;
  if found then
    select payload->>'request_checksum' into v_existing_request_checksum
    from public.question_factory_events where run_id = v_existing.id and event_type = 'RUN_CREATED'
    order by id asc limit 1;
    if v_existing_request_checksum is distinct from p_request_checksum then
      raise exception 'run_key replay does not match the existing run';
    end if;
    return jsonb_build_object('run_id',v_existing.id,'run_key',v_existing.run_key,
      'status',v_existing.status,'replayed',true);
  end if;

  insert into public.question_factory_profile_snapshots
    (profile_id,profile_version,schema_version,checksum,resolved_profile)
  values (p_profile_id,p_profile_version,p_profile_schema_version,p_profile_checksum,p_resolved_profile)
  on conflict (profile_id,profile_version,checksum) do nothing;
  select id into strict v_profile_snapshot_id from public.question_factory_profile_snapshots
  where profile_id=p_profile_id and profile_version=p_profile_version and checksum=p_profile_checksum;

  insert into public.question_factory_blueprint_snapshots
    (blueprint_id,blueprint_version,schema_version,profile_snapshot_id,checksum,resolved_blueprint)
  values (p_blueprint_id,p_blueprint_version,p_blueprint_schema_version,v_profile_snapshot_id,
    p_blueprint_checksum,p_resolved_blueprint)
  on conflict (blueprint_id,blueprint_version,checksum) do nothing;
  select id,profile_snapshot_id into strict v_blueprint_snapshot_id,v_slot_id
  from public.question_factory_blueprint_snapshots
  where blueprint_id=p_blueprint_id and blueprint_version=p_blueprint_version and checksum=p_blueprint_checksum;
  if v_slot_id <> v_profile_snapshot_id then raise exception 'blueprint identity is already pinned to a different profile snapshot'; end if;

  insert into public.question_factory_runs
    (run_key,scope_key,profile_snapshot_id,blueprint_snapshot_id,target_active,preferred_batch_size,
     max_batch_size,max_generated_items,max_revisions_per_slot,max_technical_retries,created_by,
     coverage_summary)
  values
    (p_run_key,p_scope_key,v_profile_snapshot_id,v_blueprint_snapshot_id,p_target_active,
     p_preferred_batch_size,p_max_batch_size,p_max_generated_items,p_max_revisions_per_slot,
     p_max_technical_retries,p_created_by,jsonb_build_object('planned_gap_slots',v_slot_count))
  returning id into v_run_id;

  insert into public.question_factory_events
    (run_id,event_type,from_state,to_state,reason_code,payload,actor_type,actor_id,idempotency_key)
  values
    (v_run_id,'RUN_CREATED',null,'created','RUN_INITIALIZED',
     jsonb_build_object('target_active',p_target_active,'slot_count',v_slot_count,
       'request_checksum',p_request_checksum),
     'system',p_created_by,'qf:run:'||p_run_key::text||':created');

  for v_slot in select value from jsonb_array_elements(p_slots) loop
    insert into public.question_factory_slots(run_id,slot_key,ordinal,slot_spec)
    values(v_run_id,v_slot->>'slot_key',(v_slot->>'ordinal')::integer,v_slot->'slot_spec')
    returning id into v_slot_id;
    insert into public.question_factory_events
      (run_id,slot_id,event_type,from_state,to_state,reason_code,payload,actor_type,actor_id,idempotency_key)
    values
      (v_run_id,v_slot_id,'SLOT_PLANNED',null,'planned','BLUEPRINT_SLOT_PINNED',
       jsonb_build_object('ordinal',(v_slot->>'ordinal')::integer),'system',p_created_by,
       'qf:run:'||p_run_key::text||':slot:'||(v_slot->>'slot_key')||':planned');
  end loop;
  return jsonb_build_object('run_id',v_run_id,'run_key',p_run_key,'status','created','replayed',false);
end;
$$;

comment on function public.question_factory_create_run(
  uuid,text,text,text,text,text,text,text,jsonb,text,text,text,text,jsonb,
  integer,integer,integer,integer,smallint,smallint,jsonb
) is 'Atomically creates or replays a Factory run. target_active is the bank goal; slots represent only the audited coverage gap. Service role only.';

commit;
