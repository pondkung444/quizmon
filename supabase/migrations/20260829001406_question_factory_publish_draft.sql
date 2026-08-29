begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.question_factory_publish_draft(
  p_run_key uuid,
  p_slot_key text,
  p_expected_state_version bigint,
  p_mapping_candidate jsonb,
  p_mapping_candidate_checksum text,
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
  v_mapping public.question_factory_product_mappings%rowtype;
  v_review public.question_factory_reviews%rowtype;
  v_asset public.question_factory_assets%rowtype;
  v_product jsonb;
  v_approved_asset jsonb;
  v_question_id bigint;
begin
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception 'expected_state_version must be nonnegative';
  end if;
  if p_mapping_candidate is null or pg_catalog.jsonb_typeof(p_mapping_candidate) <> 'object' then
    raise exception 'mapping_candidate must be an object';
  end if;
  if p_mapping_candidate_checksum is null
     or p_mapping_candidate_checksum !~ '^sha256:[0-9a-f]{64}$'
     or p_mapping_candidate->>'checksum' <> p_mapping_candidate_checksum then
    raise exception 'mapping candidate checksum is missing or inconsistent';
  end if;
  if p_mapping_candidate->>'schemaVersion' <> 'question-product-candidate/v1'
     or p_mapping_candidate->>'mappingVersion' <> 'question-product-mapping/v1' then
    raise exception 'unsupported Product Mapping Candidate version';
  end if;
  if nullif(pg_catalog.btrim(p_slot_key), '') is null
     or nullif(pg_catalog.btrim(p_actor_id), '') is null
     or nullif(pg_catalog.btrim(p_idempotency_key), '') is null then
    raise exception 'slot_key, actor_id, and idempotency_key are required';
  end if;

  v_product := p_mapping_candidate->'productRow';
  v_approved_asset := p_mapping_candidate->'approvedAsset';
  if v_product is null or pg_catalog.jsonb_typeof(v_product) <> 'object' then
    raise exception 'Product Mapping Candidate productRow must be an object';
  end if;
  if v_product->>'status' <> 'draft' then
    raise exception 'Factory publication may create only draft questions';
  end if;
  if v_product->>'grade_band' is null or v_product->>'grade_band' not in ('junior', 'senior')
     or v_product->>'subject' is null or v_product->>'subject' not in ('math', 'science')
     or (v_product->>'branch' is not null and v_product->>'branch' not in ('physics', 'chemistry', 'biology'))
     or v_product->>'difficulty' is null or (v_product->>'difficulty')::integer not between 1 and 3
     or nullif(pg_catalog.btrim(v_product->>'category'), '') is null
     or nullif(pg_catalog.btrim(v_product->>'grade_level'), '') is null
     or nullif(pg_catalog.btrim(v_product->>'chapter'), '') is null
     or nullif(pg_catalog.btrim(v_product->>'question_text'), '') is null
     or nullif(pg_catalog.btrim(v_product->>'explanation'), '') is null then
    raise exception 'Product Mapping Candidate contains invalid product fields';
  end if;
  if pg_catalog.jsonb_typeof(v_product->'choices') <> 'array'
     or pg_catalog.jsonb_array_length(v_product->'choices') <> 4
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_product->'choices') as choice(value)
       where pg_catalog.jsonb_typeof(choice.value) <> 'string'
          or nullif(pg_catalog.btrim(choice.value #>> '{}'), '') is null
     )
     or v_product->>'correct_index' is null
     or (v_product->>'correct_index')::integer not between 0 and 3 then
    raise exception 'Product Mapping Candidate answer fields are invalid';
  end if;
  if not (v_product @> '{"image_url":null,"image_prompt":null,"image_filename":null,"image_type":null}'::jsonb) then
    raise exception 'draft publication requires an all-null product image tuple';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_run_key::text || ':' || p_slot_key, 5)
  );
  select * into v_run from public.question_factory_runs where run_key = p_run_key;
  if not found or v_run.status <> 'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots
  where run_id = v_run.id and slot_key = p_slot_key for update;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_mapping from public.question_factory_product_mappings where slot_id = v_slot.id;
  if found then
    if v_mapping.run_id <> v_run.id
       or v_mapping.checksum <> p_mapping_candidate_checksum
       or v_mapping.mapping_version <> 'question-product-mapping/v1'
       or v_mapping.mapping_input <> p_mapping_candidate
       or v_slot.question_id is distinct from v_mapping.question_id then
      raise exception 'Factory Slot is already mapped to a different product candidate';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', v_run.id, 'slot_id', v_slot.id, 'slot_key', v_slot.slot_key,
      'question_id', v_mapping.question_id, 'mapping_id', v_mapping.id,
      'state', v_slot.state, 'state_version', v_slot.state_version, 'replayed', true
    );
  end if;

  if v_slot.state <> 'approved' or v_slot.state_version <> p_expected_state_version
     or v_slot.question_id is not null then
    raise exception 'slot state/version conflict';
  end if;
  if p_mapping_candidate->>'questionRevision' is null
     or (p_mapping_candidate->>'questionRevision')::integer <> v_slot.author_revision + 1 then
    raise exception 'draft publication does not reference the current question revision';
  end if;

  select * into v_review
  from public.question_factory_reviews
  where slot_id = v_slot.id and review_kind = 'human' and decision = 'approve'
    and subject_revision = (p_mapping_candidate->>'questionRevision')::integer
    and evidence->>'mapping_candidate_checksum' = p_mapping_candidate_checksum
    and evidence->'product_mapping_candidate' = p_mapping_candidate
  order by created_at desc, id desc limit 1;
  if not found then raise exception 'no exact Human approval exists for this Product Mapping Candidate'; end if;

  if v_slot.slot_spec->>'representationType' = 'none' then
    if v_approved_asset is distinct from 'null'::jsonb then
      raise exception 'text-only draft cannot bind an approved asset';
    end if;
  else
    if v_approved_asset is null or pg_catalog.jsonb_typeof(v_approved_asset) <> 'object' then
      raise exception 'visual draft requires an approved asset reference';
    end if;
    select * into v_asset from public.question_factory_assets
    where slot_id = v_slot.id order by asset_revision desc, id desc limit 1 for update;
    if not found or v_asset.state <> 'qc_passed'
       or v_asset.asset_revision <> (v_approved_asset->>'assetRevision')::integer
       or v_asset.checksum <> v_approved_asset->>'checksum' then
      raise exception 'draft publication does not reference the latest QC-passed asset';
    end if;
  end if;

  insert into public.questions(
    grade_band, subject, branch, category, grade_level, chapter, difficulty,
    question_text, choices, correct_index, explanation, status,
    image_url, image_prompt, image_filename, image_type
  ) values (
    v_product->>'grade_band', v_product->>'subject', v_product->>'branch',
    v_product->>'category', v_product->>'grade_level', v_product->>'chapter',
    (v_product->>'difficulty')::smallint, v_product->>'question_text',
    v_product->'choices', (v_product->>'correct_index')::smallint,
    v_product->>'explanation', 'draft', null, null, null, null
  ) returning id into v_question_id;

  insert into public.question_factory_product_mappings(
    run_id, slot_id, question_id, mapping_version, mapping_input, mapping_output, checksum
  ) values (
    v_run.id, v_slot.id, v_question_id, 'question-product-mapping/v1',
    p_mapping_candidate, v_product, p_mapping_candidate_checksum
  ) returning * into v_mapping;

  update public.question_factory_slots
  set question_id = v_question_id, state_version = state_version + 1, updated_at = pg_catalog.now()
  where id = v_slot.id and state = 'approved' and state_version = p_expected_state_version
  returning * into v_slot;
  if not found then raise exception 'slot state/version conflict'; end if;

  insert into public.question_factory_events(
    run_id, slot_id, event_type, from_state, to_state, reason_code, payload,
    actor_type, actor_id, idempotency_key
  ) values (
    v_run.id, v_slot.id, 'PRODUCT_DRAFT_CREATED', 'approved', 'approved',
    'APPROVED_CANDIDATE_PERSISTED_AS_DRAFT',
    pg_catalog.jsonb_build_object(
      'question_id', v_question_id, 'mapping_id', v_mapping.id,
      'mapping_candidate_checksum', p_mapping_candidate_checksum,
      'status', 'draft', 'state_version', v_slot.state_version
    ), 'worker', p_actor_id, p_idempotency_key
  );

  return pg_catalog.jsonb_build_object(
    'run_id', v_run.id, 'slot_id', v_slot.id, 'slot_key', v_slot.slot_key,
    'question_id', v_question_id, 'mapping_id', v_mapping.id,
    'state', v_slot.state, 'state_version', v_slot.state_version, 'replayed', false
  );
end;
$$;

revoke all on function public.question_factory_publish_draft(uuid,text,bigint,jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.question_factory_publish_draft(uuid,text,bigint,jsonb,text,text,text)
  to service_role;
comment on function public.question_factory_publish_draft(uuid,text,bigint,jsonb,text,text,text) is
  'Atomically persists an exactly Human-approved Product Mapping Candidate as a non-active draft question and immutable Factory mapping. Service role only.';

commit;
