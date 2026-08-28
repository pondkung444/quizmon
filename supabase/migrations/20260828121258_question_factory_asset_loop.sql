begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.question_factory_register_asset(
  p_run_key uuid,p_slot_key text,p_expected_state_version bigint,p_asset_revision integer,
  p_representation_type text,p_staging_path text,p_mime_type text,p_byte_size bigint,
  p_checksum text,p_width integer,p_height integer,p_build_spec jsonb,
  p_idempotency_key text,p_actor_id text
)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_run public.question_factory_runs%rowtype;
  v_slot public.question_factory_slots%rowtype;
  v_event public.question_factory_events%rowtype;
  v_asset_id bigint;
  v_expected_revision integer;
  v_expected_path text;
begin
  if p_expected_state_version is null or p_expected_state_version<0 then raise exception 'expected_state_version must be nonnegative'; end if;
  if p_asset_revision is null or p_asset_revision<1 then raise exception 'asset_revision must be positive'; end if;
  if p_mime_type not in ('image/svg+xml','image/webp') then raise exception 'unsupported asset MIME type'; end if;
  if p_byte_size is null or p_byte_size<1 or p_byte_size>5242880 then raise exception 'asset byte size is outside Factory limits'; end if;
  if p_checksum !~ '^sha256:[0-9a-f]{64}$' then raise exception 'asset checksum must be canonical sha256'; end if;
  if p_width is null or p_height is null or p_width<1 or p_height<1 or p_width>4096 or p_height>4096
     or p_width::bigint*p_height::bigint>16777216 then raise exception 'asset dimensions are outside Factory limits'; end if;
  if p_build_spec is null or jsonb_typeof(p_build_spec)<>'object' then raise exception 'build_spec must be an object'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_actor_id),'') is null then raise exception 'idempotency_key and actor_id are required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text||':'||p_slot_key,3));
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found or v_run.status<>'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots where run_id=v_run.id and slot_key=p_slot_key;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id<>v_run.id or v_event.slot_id<>v_slot.id or v_event.event_type<>'ASSET_CREATED'
       or (v_event.payload->>'asset_revision')::integer<>p_asset_revision
       or v_event.payload->>'checksum'<>p_checksum then raise exception 'idempotency key belongs to another asset operation'; end if;
    return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'asset_id',(v_event.payload->>'asset_id')::bigint,
      'asset_revision',p_asset_revision,'state',v_event.to_state,'state_version',(v_event.payload->>'state_version')::bigint,'replayed',true);
  end if;

  if v_slot.state<>'asset_build' or v_slot.state_version<>p_expected_state_version then raise exception 'slot state/version conflict'; end if;
  if v_slot.slot_spec->>'representationType' is distinct from p_representation_type or p_representation_type='none' then
    raise exception 'asset representation does not match immutable Slot';
  end if;
  select coalesce(max(asset_revision),0)+1 into v_expected_revision from public.question_factory_assets where slot_id=v_slot.id;
  if p_asset_revision<>v_expected_revision then raise exception 'asset revision is stale or out of sequence'; end if;
  v_expected_path:='runs/'||p_run_key::text||'/slots/'||p_slot_key||'/rev-'||p_asset_revision::text||
    case when p_mime_type='image/svg+xml' then '.svg' else '.webp' end;
  if p_staging_path<>v_expected_path then raise exception 'asset staging path is not canonical'; end if;

  insert into public.question_factory_assets(run_id,slot_id,asset_revision,state,representation_type,
    staging_bucket,staging_path,mime_type,byte_size,checksum,width,height,build_spec)
  values(v_run.id,v_slot.id,p_asset_revision,'built',p_representation_type,'question-factory-assets',
    p_staging_path,p_mime_type,p_byte_size,p_checksum,p_width,p_height,p_build_spec)
  returning id into v_asset_id;
  update public.question_factory_slots set state='asset_qc',state_version=state_version+1,updated_at=pg_catalog.now()
  where id=v_slot.id returning * into v_slot;
  insert into public.question_factory_events(run_id,slot_id,event_type,from_state,to_state,reason_code,payload,actor_type,actor_id,idempotency_key)
  values(v_run.id,v_slot.id,'ASSET_CREATED','asset_build','asset_qc','ASSET_BYTES_VERIFIED',
    jsonb_build_object('asset_id',v_asset_id,'asset_revision',p_asset_revision,'checksum',p_checksum,
      'mime_type',p_mime_type,'byte_size',p_byte_size,'width',p_width,'height',p_height,'state_version',v_slot.state_version),
    'worker',p_actor_id,p_idempotency_key);
  return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'asset_id',v_asset_id,
    'asset_revision',p_asset_revision,'state',v_slot.state,'state_version',v_slot.state_version,'replayed',false);
end;$$;

create function public.question_factory_record_asset_qc(
  p_run_key uuid,p_slot_key text,p_expected_state_version bigint,p_asset_revision integer,
  p_checksum text,p_decision text,p_issues jsonb,p_idempotency_key text,p_actor_id text
)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_run public.question_factory_runs%rowtype;
  v_slot public.question_factory_slots%rowtype;
  v_asset public.question_factory_assets%rowtype;
  v_event public.question_factory_events%rowtype;
  v_to_state text;v_event_type text;v_asset_state text;v_reason text;
begin
  if p_decision not in ('PASS','REGENERATE','REJECT') then raise exception 'unsupported Image QC decision'; end if;
  if p_issues is null or jsonb_typeof(p_issues)<>'array' then raise exception 'issues must be an array'; end if;
  if (p_decision='PASS' and jsonb_array_length(p_issues)<>0) or (p_decision<>'PASS' and jsonb_array_length(p_issues)=0) then
    raise exception 'Image QC issues do not match decision'; end if;
  if p_checksum !~ '^sha256:[0-9a-f]{64}$' then raise exception 'asset checksum must be canonical sha256'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_actor_id),'') is null then raise exception 'idempotency_key and actor_id are required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text||':'||p_slot_key,3));
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found or v_run.status<>'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots where run_id=v_run.id and slot_key=p_slot_key;
  if not found then raise exception 'unknown Factory slot'; end if;
  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id<>v_run.id or v_event.slot_id<>v_slot.id or (v_event.payload->>'asset_revision')::integer<>p_asset_revision
       or v_event.payload->>'checksum'<>p_checksum or v_event.payload->>'decision'<>p_decision then
      raise exception 'idempotency key belongs to another Image QC operation'; end if;
    return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'asset_id',(v_event.payload->>'asset_id')::bigint,
      'asset_revision',p_asset_revision,'state',v_event.to_state,'state_version',(v_event.payload->>'state_version')::bigint,'replayed',true);
  end if;
  if v_slot.state<>'asset_qc' or v_slot.state_version<>p_expected_state_version then raise exception 'slot state/version conflict'; end if;
  select * into v_asset from public.question_factory_assets where slot_id=v_slot.id order by asset_revision desc limit 1;
  if not found or v_asset.asset_revision<>p_asset_revision or v_asset.checksum<>p_checksum or v_asset.state<>'built' then
    raise exception 'Image QC does not reference the latest built asset revision/checksum'; end if;

  if p_decision='PASS' then v_to_state:='pending_human_review';v_event_type:='ASSET_QC_PASS';v_asset_state:='qc_passed';v_reason:='IMAGE_QC_PASS';
  elsif p_decision='REGENERATE' then v_to_state:='asset_build';v_event_type:='ASSET_QC_REGENERATE';v_asset_state:='qc_failed';v_reason:='IMAGE_QC_REGENERATE';
  else v_to_state:='rejected';v_event_type:='ASSET_QC_REJECT';v_asset_state:='qc_failed';v_reason:='IMAGE_QC_TERMINAL_REJECT'; end if;
  update public.question_factory_assets set state=v_asset_state,updated_at=pg_catalog.now() where id=v_asset.id;
  update public.question_factory_slots set state=v_to_state,state_version=state_version+1,updated_at=pg_catalog.now()
  where id=v_slot.id returning * into v_slot;
  insert into public.question_factory_events(run_id,slot_id,event_type,from_state,to_state,reason_code,payload,actor_type,actor_id,idempotency_key)
  values(v_run.id,v_slot.id,v_event_type,'asset_qc',v_to_state,v_reason,
    jsonb_build_object('asset_id',v_asset.id,'asset_revision',p_asset_revision,'checksum',p_checksum,
      'decision',p_decision,'issues',p_issues,'state_version',v_slot.state_version),'worker',p_actor_id,p_idempotency_key);
  return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'asset_id',v_asset.id,
    'asset_revision',p_asset_revision,'state',v_slot.state,'state_version',v_slot.state_version,'replayed',false);
end;$$;

revoke all on function public.question_factory_register_asset(uuid,text,bigint,integer,text,text,text,bigint,text,integer,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.question_factory_record_asset_qc(uuid,text,bigint,integer,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.question_factory_register_asset(uuid,text,bigint,integer,text,text,text,bigint,text,integer,integer,jsonb,text,text) to service_role;
grant execute on function public.question_factory_record_asset_qc(uuid,text,bigint,integer,text,text,jsonb,text,text) to service_role;
comment on function public.question_factory_register_asset(uuid,text,bigint,integer,text,text,text,bigint,text,integer,integer,jsonb,text,text) is 'Registers only byte-verified canonical staging assets and advances asset_build to asset_qc atomically. Service only.';
comment on function public.question_factory_record_asset_qc(uuid,text,bigint,integer,text,text,jsonb,text,text) is 'Records Image QC against the exact latest asset revision/checksum and advances the Slot atomically. Service only.';
commit;
