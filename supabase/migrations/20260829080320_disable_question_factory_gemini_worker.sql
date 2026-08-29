do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
   where jobname = 'question-factory-worker';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

drop function if exists public.question_factory_mark_waiting_review(uuid,bigint,text,text);
