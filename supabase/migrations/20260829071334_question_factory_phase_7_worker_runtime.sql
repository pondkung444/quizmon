begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.question_factory_mark_waiting_review(
  p_run_key uuid,p_expected_state_version bigint,p_actor_id text,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_event public.question_factory_events%rowtype;
  v_pending integer; v_terminal integer; v_total integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,32));
  select * into v_run from public.question_factory_runs where run_key=p_run_key for update;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    if v_event.run_id<>v_run.id or v_event.event_type<>'RUN_WAITING_HUMAN_REVIEW' then
      raise exception 'idempotency key belongs to another operation'; end if;
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'status',v_run.status,
      'state_version',v_run.state_version,'replayed',true);
  end if;
  if v_run.status<>'running' or v_run.state_version<>p_expected_state_version then
    raise exception 'run state/version conflict'; end if;
  select count(*),count(*) filter(where state='pending_human_review'),
    count(*) filter(where state in ('rejected','cancelled')) into v_total,v_pending,v_terminal
    from public.question_factory_slots where run_id=v_run.id;
  if v_total=0 or v_pending=0 or v_pending+v_terminal<>v_total then
    raise exception 'Run has processable or invalid Slot states'; end if;
  update public.question_factory_runs set status='waiting_human_review',state_version=state_version+1,
    updated_at=pg_catalog.now() where id=v_run.id returning * into v_run;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,'RUN_WAITING_HUMAN_REVIEW','running',
    'waiting_human_review','ALL_PROCESSABLE_SLOTS_COMPLETE',pg_catalog.jsonb_build_object(
    'pending_human_review',v_pending,'terminal_without_review',v_terminal),'worker',p_actor_id,p_idempotency_key)
    returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'status',v_run.status,
    'state_version',v_run.state_version,'event_id',v_event.id,'replayed',false);
end $$;

revoke all on function public.question_factory_mark_waiting_review(uuid,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.question_factory_mark_waiting_review(uuid,bigint,text,text) to service_role;

-- Reuse the already provisioned server-to-server cron bearer without committing it.
do $$
declare v_secret text; v_job_id bigint;
begin
  select substring(command from 'Bearer ([0-9a-f]+)') into v_secret
  from cron.job where command like '%/api/cron/adventure-return%' and active order by jobid limit 1;
  if nullif(v_secret,'') is null then raise exception 'existing server cron credential not found'; end if;
  select jobid into v_job_id from cron.job where jobname='question-factory-worker';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('question-factory-worker','* * * * *',pg_catalog.format(
    $job$select net.http_post(url := 'https://quizmon.xyz/api/cron/question-factory', headers := jsonb_build_object('Authorization','Bearer %s','Content-Type','application/json'), body := '{}'::jsonb);$job$,
    v_secret));
end $$;

commit;
