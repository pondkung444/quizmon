begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.question_factory_promote_asset(
  p_run_key uuid,
  p_slot_key text,
  p_expected_state_version bigint,
  p_question_id bigint,
  p_asset_revision integer,
  p_checksum text,
  p_public_path text,
  p_image_url text,
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
  v_slot public.question_factory_slots%rowtype;
  v_asset public.question_factory_assets%rowtype;
  v_question public.questions%rowtype;
  v_mapping public.question_factory_product_mappings%rowtype;
  v_event public.question_factory_events%rowtype;
  v_extension text;
  v_expected_path text;
begin
  if p_expected_state_version is null or p_expected_state_version < 0
     or p_question_id is null or p_question_id < 1
     or p_asset_revision is null or p_asset_revision < 1 then
    raise exception 'state version, question ID, and asset revision are invalid';
  end if;
  if p_checksum is null or p_checksum !~ '^sha256:[0-9a-f]{64}$'
     or nullif(pg_catalog.btrim(p_slot_key), '') is null
     or nullif(pg_catalog.btrim(p_image_url), '') is null
     or nullif(pg_catalog.btrim(p_actor_id), '') is null
     or nullif(pg_catalog.btrim(p_idempotency_key), '') is null then
    raise exception 'canonical checksum, slot key, image URL, actor, and idempotency key are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_run_key::text || ':' || p_slot_key, 6)
  );
  select * into v_run from public.question_factory_runs where run_key = p_run_key;
  if not found or v_run.status <> 'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots
  where run_id = v_run.id and slot_key = p_slot_key for update;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_event from public.question_factory_events where idempotency_key = p_idempotency_key;
  if found then
    if v_event.run_id <> v_run.id or v_event.slot_id <> v_slot.id
       or v_event.event_type <> 'ASSET_PROMOTED'
       or (v_event.payload->>'question_id')::bigint <> p_question_id
       or (v_event.payload->>'asset_revision')::integer <> p_asset_revision
       or v_event.payload->>'checksum' <> p_checksum
       or v_event.payload->>'public_path' <> p_public_path then
      raise exception 'idempotency key belongs to another asset promotion';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', v_run.id, 'slot_id', v_slot.id, 'question_id', p_question_id,
      'asset_id', (v_event.payload->>'asset_id')::bigint,
      'state', v_event.to_state, 'state_version', (v_event.payload->>'state_version')::bigint,
      'public_path', p_public_path, 'image_url', p_image_url, 'replayed', true
    );
  end if;

  if v_slot.state <> 'approved' or v_slot.state_version <> p_expected_state_version
     or v_slot.question_id is distinct from p_question_id
     or v_slot.slot_spec->>'representationType' = 'none' then
    raise exception 'slot state/version/question conflict';
  end if;
  select * into v_mapping from public.question_factory_product_mappings
  where slot_id = v_slot.id and question_id = p_question_id;
  if not found or v_mapping.run_id <> v_run.id then raise exception 'Factory product mapping is missing'; end if;

  select * into v_asset from public.question_factory_assets
  where slot_id = v_slot.id order by asset_revision desc, id desc limit 1 for update;
  if not found or v_asset.asset_revision <> p_asset_revision or v_asset.checksum <> p_checksum then
    raise exception 'promotion does not reference the latest Factory asset';
  end if;
  v_extension := case v_asset.mime_type when 'image/svg+xml' then 'svg' when 'image/webp' then 'webp' else null end;
  v_expected_path := 'q' || p_question_id::text || '.' || v_extension;
  if p_public_path <> v_expected_path
     or p_image_url not like '%/storage/v1/object/public/question-images/' || v_expected_path then
    raise exception 'public image path or URL is not canonical';
  end if;

  if v_asset.state = 'promoted' then
    select * into v_question from public.questions where id = p_question_id;
    if v_asset.public_bucket <> 'question-images' or v_asset.public_path <> p_public_path
       or v_question.image_url <> p_image_url or v_question.image_filename <> p_public_path
       or v_question.image_type <> v_extension then
      raise exception 'asset was promoted with different product data';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', v_run.id, 'slot_id', v_slot.id, 'question_id', p_question_id,
      'asset_id', v_asset.id, 'state', v_slot.state, 'state_version', v_slot.state_version,
      'public_path', p_public_path, 'image_url', p_image_url, 'replayed', true
    );
  end if;
  if v_asset.state <> 'qc_passed' then raise exception 'latest Factory asset has not passed QC'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'question-images' and name = p_public_path) then
    raise exception 'verified public Storage object does not exist';
  end if;

  select * into v_question from public.questions where id = p_question_id for update;
  if not found or v_question.status <> 'draft' then raise exception 'product question is not a draft'; end if;
  if v_question.image_url is not null or v_question.image_prompt is not null
     or v_question.image_filename is not null or v_question.image_type is not null then
    raise exception 'product question image tuple is already populated';
  end if;

  update public.questions set
    image_url = p_image_url,
    image_prompt = v_asset.build_spec::text,
    image_filename = p_public_path,
    image_type = v_extension
  where id = p_question_id;
  update public.question_factory_assets set
    state = 'promoted', public_bucket = 'question-images', public_path = p_public_path,
    updated_at = pg_catalog.now()
  where id = v_asset.id;
  update public.question_factory_slots set state_version = state_version + 1, updated_at = pg_catalog.now()
  where id = v_slot.id and state_version = p_expected_state_version returning * into v_slot;
  if not found then raise exception 'slot state/version conflict'; end if;

  insert into public.question_factory_events(
    run_id, slot_id, event_type, from_state, to_state, reason_code, payload,
    actor_type, actor_id, idempotency_key
  ) values (
    v_run.id, v_slot.id, 'ASSET_PROMOTED', 'approved', 'approved', 'VERIFIED_ASSET_ATTACHED_TO_PRODUCT_DRAFT',
    pg_catalog.jsonb_build_object(
      'question_id', p_question_id, 'asset_id', v_asset.id, 'asset_revision', p_asset_revision,
      'checksum', p_checksum, 'public_bucket', 'question-images', 'public_path', p_public_path,
      'image_url', p_image_url, 'state_version', v_slot.state_version
    ), 'worker', p_actor_id, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object(
    'run_id', v_run.id, 'slot_id', v_slot.id, 'question_id', p_question_id,
    'asset_id', v_asset.id, 'state', v_slot.state, 'state_version', v_slot.state_version,
    'public_path', p_public_path, 'image_url', p_image_url, 'replayed', false
  );
end;
$$;

revoke all on function public.question_factory_promote_asset(uuid,text,bigint,bigint,integer,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.question_factory_promote_asset(uuid,text,bigint,bigint,integer,text,text,text,text,text)
  to service_role;
comment on function public.question_factory_promote_asset(uuid,text,bigint,bigint,integer,text,text,text,text,text) is
  'Atomically binds a byte-verified QC-passed Factory asset to its mapped draft question after the canonical public Storage object exists. Service role only.';

commit;
