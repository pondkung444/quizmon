begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('public.question_factory_start_run(uuid,bigint,text,text)') is not null then
    raise exception 'question_factory_start_run already exists';
  end if;
end
$$;

create function public.question_factory_start_run(
  p_run_key uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run public.question_factory_runs%rowtype;
  v_event_id bigint;
begin
  if p_run_key is null then raise exception 'run_key is required'; end if;
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception 'expected_state_version must be nonnegative';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'idempotency_key is required'; end if;
  if p_actor_id is null or btrim(p_actor_id) = '' then raise exception 'actor_id is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text, 1));
  select * into v_run from public.question_factory_runs where run_key = p_run_key;
  if not found then raise exception 'unknown Question Factory run'; end if;

  select id into v_event_id from public.question_factory_events
  where run_id = v_run.id and idempotency_key = p_idempotency_key and event_type = 'RUN_STARTED';
  if found then
    return jsonb_build_object(
      'run_id', v_run.id, 'run_key', v_run.run_key, 'status', v_run.status,
      'state_version', v_run.state_version, 'replayed', true
    );
  end if;

  update public.question_factory_runs
  set status = 'running', state_version = state_version + 1,
      started_at = coalesce(started_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where id = v_run.id and status = 'created' and state_version = p_expected_state_version
  returning * into v_run;
  if not found then raise exception 'run state/version conflict'; end if;

  insert into public.question_factory_events
    (run_id, event_type, from_state, to_state, reason_code, payload, actor_type, actor_id, idempotency_key)
  values
    (v_run.id, 'RUN_STARTED', 'created', 'running', 'WORKER_STARTED',
     jsonb_build_object('state_version', v_run.state_version), 'worker', p_actor_id, p_idempotency_key);

  return jsonb_build_object(
    'run_id', v_run.id, 'run_key', v_run.run_key, 'status', v_run.status,
    'state_version', v_run.state_version, 'replayed', false
  );
end;
$$;

revoke all on function public.question_factory_start_run(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.question_factory_start_run(uuid, bigint, text, text)
  to service_role;

comment on function public.question_factory_start_run(uuid, bigint, text, text) is
  'Optimistically transitions a Factory run from created to running and appends RUN_STARTED atomically. Service role only.';

commit;
