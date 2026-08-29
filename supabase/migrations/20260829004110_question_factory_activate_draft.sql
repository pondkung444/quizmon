begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.question_factory_activate_draft(
  p_run_key uuid,
  p_slot_key text,
  p_expected_state_version bigint,
  p_question_id bigint,
  p_mapping_checksum text,
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
  v_question public.questions%rowtype;
  v_mapping public.question_factory_product_mappings%rowtype;
  v_review public.question_factory_reviews%rowtype;
  v_asset public.question_factory_assets%rowtype;
  v_event public.question_factory_events%rowtype;
  v_product jsonb;
  v_active_count integer;
  v_ready_count integer;
begin
  if p_expected_state_version is null or p_expected_state_version < 0
     or p_question_id is null or p_question_id < 1 then
    raise exception 'state version and question ID are invalid';
  end if;
  if p_mapping_checksum is null or p_mapping_checksum !~ '^sha256:[0-9a-f]{64}$'
     or nullif(pg_catalog.btrim(p_slot_key), '') is null
     or nullif(pg_catalog.btrim(p_actor_id), '') is null
     or nullif(pg_catalog.btrim(p_idempotency_key), '') is null then
    raise exception 'canonical mapping checksum, slot key, actor, and idempotency key are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_run_key::text || ':' || p_slot_key, 7)
  );
  select * into v_run from public.question_factory_runs where run_key = p_run_key for update;
  if not found or v_run.status <> 'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots
  where run_id = v_run.id and slot_key = p_slot_key for update;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_event from public.question_factory_events where idempotency_key = p_idempotency_key;
  if found then
    if v_event.run_id <> v_run.id or v_event.slot_id <> v_slot.id
       or v_event.event_type <> 'QUESTION_ACTIVATED'
       or (v_event.payload->>'question_id')::bigint <> p_question_id
       or v_event.payload->>'mapping_checksum' <> p_mapping_checksum then
      raise exception 'idempotency key belongs to another activation';
    end if;
    if v_slot.state <> 'active' or v_slot.question_id is distinct from p_question_id
       or not exists(select 1 from public.questions where id = p_question_id and status = 'active') then
      raise exception 'activation event exists but current state is inconsistent';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', v_run.id, 'slot_id', v_slot.id, 'question_id', p_question_id,
      'state', v_slot.state, 'state_version', v_slot.state_version,
      'active_count', v_run.active_count, 'pipeline_ready_count', v_run.pipeline_ready_count,
      'replayed', true
    );
  end if;

  if v_slot.state <> 'approved' or v_slot.state_version <> p_expected_state_version
     or v_slot.question_id is distinct from p_question_id then
    raise exception 'slot state/version/question conflict';
  end if;
  select * into v_mapping from public.question_factory_product_mappings
  where slot_id = v_slot.id and question_id = p_question_id;
  if not found or v_mapping.run_id <> v_run.id or v_mapping.checksum <> p_mapping_checksum
     or v_mapping.mapping_version <> 'question-product-mapping/v1' then
    raise exception 'exact Factory product mapping is missing';
  end if;
  select * into v_review from public.question_factory_reviews
  where slot_id = v_slot.id and review_kind = 'human' and decision = 'approve'
    and evidence->>'mapping_candidate_checksum' = p_mapping_checksum
    and evidence->'product_mapping_candidate' = v_mapping.mapping_input
  order by created_at desc, id desc limit 1;
  if not found then raise exception 'exact Human approval evidence is missing'; end if;

  select * into v_question from public.questions where id = p_question_id for update;
  if not found or v_question.status <> 'draft' then raise exception 'product question is not a draft'; end if;
  v_product := v_mapping.mapping_output;
  if v_question.grade_band is distinct from v_product->>'grade_band'
     or v_question.subject is distinct from v_product->>'subject'
     or v_question.branch is distinct from v_product->>'branch'
     or v_question.category is distinct from v_product->>'category'
     or v_question.grade_level is distinct from v_product->>'grade_level'
     or v_question.chapter is distinct from v_product->>'chapter'
     or v_question.difficulty is distinct from (v_product->>'difficulty')::smallint
     or v_question.question_text is distinct from v_product->>'question_text'
     or v_question.choices is distinct from v_product->'choices'
     or v_question.correct_index is distinct from (v_product->>'correct_index')::smallint
     or v_question.explanation is distinct from v_product->>'explanation' then
    raise exception 'product draft no longer matches its immutable Factory mapping';
  end if;

  if v_slot.slot_spec->>'representationType' = 'none' then
    if v_mapping.mapping_input->'approvedAsset' is distinct from 'null'::jsonb
       or v_question.image_url is not null or v_question.image_prompt is not null
       or v_question.image_filename is not null or v_question.image_type is not null then
      raise exception 'text-only draft image evidence is inconsistent';
    end if;
  else
    select * into v_asset from public.question_factory_assets
    where slot_id = v_slot.id order by asset_revision desc, id desc limit 1 for update;
    if not found or v_asset.state <> 'promoted' or v_asset.public_bucket <> 'question-images'
       or v_asset.public_path is null
       or v_mapping.mapping_input->'approvedAsset'->>'checksum' <> v_asset.checksum
       or (v_mapping.mapping_input->'approvedAsset'->>'assetRevision')::integer <> v_asset.asset_revision
       or v_question.image_filename is distinct from v_asset.public_path
       or v_question.image_type is distinct from (case v_asset.mime_type when 'image/svg+xml' then 'svg' else 'webp' end)
       or v_question.image_prompt is distinct from v_asset.build_spec::text
       or v_question.image_url is null
       or v_question.image_url not like '%/storage/v1/object/public/question-images/' || v_asset.public_path
       or not exists(select 1 from storage.objects where bucket_id = 'question-images' and name = v_asset.public_path) then
      raise exception 'visual draft does not have an exact promoted product asset';
    end if;
  end if;

  update public.questions set status = 'active' where id = p_question_id and status = 'draft';
  if not found then raise exception 'product question activation conflict'; end if;
  update public.question_factory_slots
  set state = 'active', state_version = state_version + 1, updated_at = pg_catalog.now()
  where id = v_slot.id and state = 'approved' and state_version = p_expected_state_version
  returning * into v_slot;
  if not found then raise exception 'slot state/version conflict'; end if;

  select count(*) filter (where state = 'active'),
         count(*) filter (where state = 'approved')
  into v_active_count, v_ready_count
  from public.question_factory_slots where run_id = v_run.id;
  update public.question_factory_runs
  set active_count = v_active_count, pipeline_ready_count = v_ready_count, updated_at = pg_catalog.now()
  where id = v_run.id returning * into v_run;

  insert into public.question_factory_events(
    run_id, slot_id, event_type, from_state, to_state, reason_code, payload,
    actor_type, actor_id, idempotency_key
  ) values (
    v_run.id, v_slot.id, 'QUESTION_ACTIVATED', 'approved', 'active', 'VERIFIED_PRODUCT_DRAFT_ACTIVATED',
    pg_catalog.jsonb_build_object(
      'question_id', p_question_id, 'mapping_id', v_mapping.id,
      'mapping_checksum', p_mapping_checksum, 'status', 'active',
      'state_version', v_slot.state_version, 'active_count', v_run.active_count,
      'pipeline_ready_count', v_run.pipeline_ready_count
    ), 'human', p_actor_id, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object(
    'run_id', v_run.id, 'slot_id', v_slot.id, 'question_id', p_question_id,
    'state', v_slot.state, 'state_version', v_slot.state_version,
    'active_count', v_run.active_count, 'pipeline_ready_count', v_run.pipeline_ready_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.question_factory_activate_draft(uuid,text,bigint,bigint,text,text,text)
  from public, anon, authenticated;
grant execute on function public.question_factory_activate_draft(uuid,text,bigint,bigint,text,text,text)
  to service_role;
comment on function public.question_factory_activate_draft(uuid,text,bigint,bigint,text,text,text) is
  'Atomically activates an exactly Human-approved mapped Factory draft only after its text-only or promoted-asset evidence is complete. Service role only.';

commit;
