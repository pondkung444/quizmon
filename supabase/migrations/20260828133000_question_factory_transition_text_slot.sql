begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.question_factory_transition_text_slot(
  p_run_key uuid, p_slot_key text, p_expected_state_version bigint,
  p_from_state text, p_to_state text, p_event_type text, p_reason_code text,
  p_payload jsonb, p_idempotency_key text, p_actor_id text
)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_run public.question_factory_runs%rowtype;
  v_slot public.question_factory_slots%rowtype;
  v_event public.question_factory_events%rowtype;
  v_allowed boolean;
begin
  if p_expected_state_version is null or p_expected_state_version<0 then raise exception 'expected_state_version must be nonnegative'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be an object'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_actor_id),'') is null then raise exception 'idempotency_key and actor_id are required'; end if;

  v_allowed := (p_from_state,p_to_state,p_event_type) in (
    ('planned','authoring','AUTHOR_STARTED'),
    ('authoring','question_qc','AUTHOR_COMPLETE'),
    ('author_revision','question_qc','QUESTION_REVISED'),
    ('question_qc','author_revision','QUESTION_QC_REVISE'),
    ('question_qc','rejected','QUESTION_QC_REJECT'),
    ('question_qc','pending_human_review','QUESTION_QC_PASS'),
    ('question_qc','asset_build','QUESTION_QC_PASS')
  );
  if not v_allowed then raise exception 'unsupported text-loop transition'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text||':'||p_slot_key,2));
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found or v_run.status<>'running' then raise exception 'run is not running'; end if;
  select * into v_slot from public.question_factory_slots where run_id=v_run.id and slot_key=p_slot_key;
  if not found then raise exception 'unknown Factory slot'; end if;

  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id<>v_run.id or v_event.slot_id<>v_slot.id or v_event.event_type<>p_event_type
       or v_event.from_state is distinct from p_from_state or v_event.to_state is distinct from p_to_state then
      raise exception 'idempotency key belongs to another operation';
    end if;
    return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'slot_key',v_slot.slot_key,
      'state',v_event.to_state,'state_version',(v_event.payload->>'state_version')::bigint,'replayed',true);
  end if;

  update public.question_factory_slots set
    state=p_to_state,
    state_version=state_version+1,
    author_revision=author_revision+case when p_to_state='author_revision' then 1 else 0 end,
    updated_at=pg_catalog.now()
  where id=v_slot.id and state=p_from_state and state_version=p_expected_state_version
  returning * into v_slot;
  if not found then raise exception 'slot state/version conflict'; end if;

  insert into public.question_factory_events
    (run_id,slot_id,event_type,from_state,to_state,reason_code,payload,actor_type,actor_id,idempotency_key)
  values
    (v_run.id,v_slot.id,p_event_type,p_from_state,p_to_state,p_reason_code,
     p_payload||jsonb_build_object('state_version',v_slot.state_version),'worker',p_actor_id,p_idempotency_key);

  return jsonb_build_object('run_id',v_run.id,'slot_id',v_slot.id,'slot_key',v_slot.slot_key,
    'state',v_slot.state,'state_version',v_slot.state_version,'replayed',false);
end;$$;

revoke all on function public.question_factory_transition_text_slot(uuid,text,bigint,text,text,text,text,jsonb,text,text)
from public,anon,authenticated;
grant execute on function public.question_factory_transition_text_slot(uuid,text,bigint,text,text,text,text,jsonb,text,text)
to service_role;
comment on function public.question_factory_transition_text_slot(uuid,text,bigint,text,text,text,text,jsonb,text,text)
is 'Optimistic service-only text-loop transition. Updates slot current state and appends one factual event atomically.';
commit;
