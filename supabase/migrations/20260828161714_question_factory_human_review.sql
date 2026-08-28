begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.question_factory_record_human_review(
  p_run_key uuid,
  p_slot_key text,
  p_expected_state_version bigint,
  p_subject_revision integer,
  p_mapping_candidate_checksum text,
  p_asset_revision integer,
  p_asset_checksum text,
  p_decision text,
  p_revision_target text,
  p_issues jsonb,
  p_evidence jsonb,
  p_reviewer_id text,
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
  v_review public.question_factory_reviews%rowtype;
  v_to_state text;
  v_event_type text;
  v_reason_code text;
  v_evidence jsonb;
begin
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception 'expected_state_version must be nonnegative';
  end if;
  if p_subject_revision is null or p_subject_revision < 0 then
    raise exception 'subject_revision must be nonnegative';
  end if;
  if p_mapping_candidate_checksum is null
     or p_mapping_candidate_checksum !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'mapping candidate checksum must be canonical sha256';
  end if;
  if p_decision not in ('APPROVE', 'REQUEST_REVISION', 'REJECT') then
    raise exception 'unsupported human review decision';
  end if;
  if p_issues is null or pg_catalog.jsonb_typeof(p_issues) <> 'array' then
    raise exception 'issues must be an array';
  end if;
  if p_evidence is null or pg_catalog.jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'evidence must be an object';
  end if;
  if p_decision = 'APPROVE' and pg_catalog.jsonb_array_length(p_issues) <> 0 then
    raise exception 'approval cannot contain unresolved issues';
  end if;
  if p_decision <> 'APPROVE' and pg_catalog.jsonb_array_length(p_issues) = 0 then
    raise exception 'revision and rejection decisions require issues';
  end if;
  if (p_decision = 'REQUEST_REVISION' and p_revision_target not in ('text', 'asset'))
     or (p_decision <> 'REQUEST_REVISION' and p_revision_target is not null) then
    raise exception 'revision_target does not match human review decision';
  end if;
  if nullif(pg_catalog.btrim(p_slot_key), '') is null
     or nullif(pg_catalog.btrim(p_reviewer_id), '') is null
     or nullif(pg_catalog.btrim(p_idempotency_key), '') is null then
    raise exception 'slot_key, reviewer_id, and idempotency_key are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_run_key::text || ':' || p_slot_key, 4)
  );

  select * into v_run
  from public.question_factory_runs
  where run_key = p_run_key;
  if not found or v_run.status <> 'running' then
    raise exception 'run is not running';
  end if;

  select * into v_slot
  from public.question_factory_slots
  where run_id = v_run.id and slot_key = p_slot_key
  for update;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_review
  from public.question_factory_reviews
  where idempotency_key = p_idempotency_key;
  if found then
    if v_review.run_id <> v_run.id
       or v_review.slot_id <> v_slot.id
       or v_review.review_kind <> 'human'
       or v_review.subject_revision <> p_subject_revision
       or v_review.decision <> pg_catalog.lower(p_decision)
       or v_review.issues <> p_issues
       or v_review.reviewer_id is distinct from p_reviewer_id
       or v_review.evidence->>'mapping_candidate_checksum' <> p_mapping_candidate_checksum
       or v_review.evidence->>'revision_target' is distinct from p_revision_target
       or (v_review.evidence->>'asset_revision')::integer is distinct from p_asset_revision
       or v_review.evidence->>'asset_checksum' is distinct from p_asset_checksum then
      raise exception 'idempotency key belongs to another human review operation';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', v_run.id,
      'slot_id', v_slot.id,
      'slot_key', v_slot.slot_key,
      'review_id', v_review.id,
      'state', v_review.evidence->>'result_state',
      'state_version', (v_review.evidence->>'result_state_version')::bigint,
      'replayed', true
    );
  end if;

  if v_slot.state <> 'pending_human_review'
     or v_slot.state_version <> p_expected_state_version then
    raise exception 'slot state/version conflict';
  end if;
  if v_slot.author_revision <> p_subject_revision then
    raise exception 'human review does not reference the current question revision';
  end if;

  if v_slot.slot_spec->>'representationType' = 'none' then
    if p_asset_revision is not null or p_asset_checksum is not null then
      raise exception 'text-only Slot cannot bind an asset';
    end if;
    if p_revision_target = 'asset' then
      raise exception 'text-only Slot cannot request an asset revision';
    end if;
  else
    if p_asset_revision is null or p_asset_checksum is null
       or p_asset_checksum !~ '^sha256:[0-9a-f]{64}$' then
      raise exception 'visual Slot review requires a canonical asset revision/checksum';
    end if;
    select * into v_asset
    from public.question_factory_assets
    where slot_id = v_slot.id
    order by asset_revision desc, id desc
    limit 1
    for update;
    if not found
       or v_asset.state <> 'qc_passed'
       or v_asset.asset_revision <> p_asset_revision
       or v_asset.checksum <> p_asset_checksum then
      raise exception 'human review does not reference the latest QC-passed asset revision/checksum';
    end if;
  end if;

  if p_decision = 'APPROVE' then
    v_to_state := 'approved';
    v_event_type := 'HUMAN_APPROVED';
    v_reason_code := 'HUMAN_APPROVED_EXACT_CANDIDATE';
  elsif p_decision = 'REQUEST_REVISION' and p_revision_target = 'text' then
    v_to_state := 'author_revision';
    v_event_type := 'HUMAN_REVISION_REQUESTED';
    v_reason_code := 'HUMAN_TEXT_REVISION_REQUESTED';
  elsif p_decision = 'REQUEST_REVISION' then
    v_to_state := 'asset_build';
    v_event_type := 'HUMAN_REVISION_REQUESTED';
    v_reason_code := 'HUMAN_ASSET_REVISION_REQUESTED';
  else
    v_to_state := 'rejected';
    v_event_type := 'HUMAN_REJECTED';
    v_reason_code := 'HUMAN_TERMINAL_REJECT';
  end if;

  update public.question_factory_slots
  set state = v_to_state,
      state_version = state_version + 1,
      author_revision = author_revision +
        case when v_to_state = 'author_revision' then 1 else 0 end,
      updated_at = pg_catalog.now()
  where id = v_slot.id
  returning * into v_slot;

  if p_decision = 'REQUEST_REVISION' and v_asset.id is not null then
    update public.question_factory_assets
    set state = 'superseded', updated_at = pg_catalog.now()
    where id = v_asset.id;
  end if;

  v_evidence := p_evidence || pg_catalog.jsonb_build_object(
    'mapping_candidate_checksum', p_mapping_candidate_checksum,
    'revision_target', p_revision_target,
    'asset_revision', p_asset_revision,
    'asset_checksum', p_asset_checksum,
    'result_state', v_slot.state,
    'result_state_version', v_slot.state_version
  );

  insert into public.question_factory_reviews(
    run_id, slot_id, review_kind, subject_revision, decision, issues, evidence,
    reviewer_type, reviewer_id, idempotency_key
  ) values (
    v_run.id, v_slot.id, 'human', p_subject_revision,
    pg_catalog.lower(p_decision), p_issues, v_evidence,
    'human', p_reviewer_id, p_idempotency_key
  ) returning * into v_review;

  insert into public.question_factory_events(
    run_id, slot_id, event_type, from_state, to_state, reason_code, payload,
    actor_type, actor_id, idempotency_key
  ) values (
    v_run.id, v_slot.id, v_event_type, 'pending_human_review', v_to_state,
    v_reason_code,
    pg_catalog.jsonb_build_object(
      'review_id', v_review.id,
      'subject_revision', p_subject_revision,
      'mapping_candidate_checksum', p_mapping_candidate_checksum,
      'asset_revision', p_asset_revision,
      'asset_checksum', p_asset_checksum,
      'decision', p_decision,
      'revision_target', p_revision_target,
      'issues', p_issues,
      'state_version', v_slot.state_version
    ),
    'human', p_reviewer_id, p_idempotency_key || ':event'
  );

  return pg_catalog.jsonb_build_object(
    'run_id', v_run.id,
    'slot_id', v_slot.id,
    'slot_key', v_slot.slot_key,
    'review_id', v_review.id,
    'state', v_slot.state,
    'state_version', v_slot.state_version,
    'replayed', false
  );
end;
$$;

revoke all on function public.question_factory_record_human_review(
  uuid, text, bigint, integer, text, integer, text, text, text, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.question_factory_record_human_review(
  uuid, text, bigint, integer, text, integer, text, text, text, jsonb, jsonb, text, text
) to service_role;

comment on function public.question_factory_record_human_review(
  uuid, text, bigint, integer, text, integer, text, text, text, jsonb, jsonb, text, text
) is 'Records a service-only human decision against an exact question revision, mapping candidate checksum, and latest QC-passed asset identity.';

commit;
