begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_signature regprocedure := 'public.question_factory_complete_run(uuid,bigint,text,text)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(v_signature::oid) into v_definition;
  if pg_catalog.strpos(v_definition, 'v_from_status text;') > 0 then return; end if;
  if pg_catalog.strpos(v_definition, 'where id=v_run.id and status=''running'' and state_version=p_expected_state_version') = 0 then
    raise exception 'Run completion update guard no longer matches reviewed baseline';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'v_run public.question_factory_runs%rowtype;',
    'v_run public.question_factory_runs%rowtype;' || pg_catalog.chr(10) || '  v_from_status text;'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    '  update public.question_factory_runs' || pg_catalog.chr(10) || '  set status=''completed''',
    '  v_from_status := v_run.status;' || pg_catalog.chr(10) || pg_catalog.chr(10) ||
    '  update public.question_factory_runs' || pg_catalog.chr(10) || '  set status=''completed'''
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'where id=v_run.id and status=''running'' and state_version=p_expected_state_version',
    'where id=v_run.id and status in (''running'',''waiting_human_review'') and state_version=p_expected_state_version'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    '''RUN_COMPLETED'',''running'',''completed''',
    '''RUN_COMPLETED'',v_from_status,''completed'''
  );
  execute v_definition;
end;
$$;

commit;
