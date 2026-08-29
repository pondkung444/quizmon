begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_old_guard constant text := 'v_run.status <> ''running''';
  v_new_guard constant text := 'v_run.status not in (''running'', ''waiting_human_review'')';
begin
  foreach v_signature in array array[
    'public.question_factory_publish_draft(uuid,text,bigint,jsonb,text,text,text)'::regprocedure,
    'public.question_factory_promote_asset(uuid,text,bigint,bigint,integer,text,text,text,text,text)'::regprocedure,
    'public.question_factory_activate_draft(uuid,text,bigint,bigint,text,text,text)'::regprocedure,
    'public.question_factory_complete_run(uuid,bigint,text,text)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::oid) into v_definition;
    if pg_catalog.strpos(v_definition, v_new_guard) > 0 then continue; end if;
    if pg_catalog.strpos(v_definition, v_old_guard) = 0 then
      raise exception 'Post-review guard no longer matches reviewed baseline for %', v_signature;
    end if;
    execute pg_catalog.replace(v_definition, v_old_guard, v_new_guard);
  end loop;
end;
$$;

comment on function public.question_factory_complete_run(uuid,bigint,text,text)
  is 'Completes a running or waiting_human_review Run only after every Slot is terminal and the active target is satisfied.';

commit;
