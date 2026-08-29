begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_signature regprocedure := 'public.question_factory_record_human_review(uuid,text,bigint,integer,text,integer,text,text,text,jsonb,jsonb,text,text)'::regprocedure;
  v_definition text;
  v_old_guard constant text := 'v_run.status <> ''running''';
  v_new_guard constant text := 'v_run.status not in (''running'', ''waiting_human_review'')';
begin
  select pg_catalog.pg_get_functiondef(v_signature::oid)
  into v_definition;

  if pg_catalog.strpos(v_definition, v_new_guard) > 0 then
    return;
  end if;
  if pg_catalog.strpos(v_definition, v_old_guard) = 0 then
    raise exception 'Human Review Run-status guard no longer matches the reviewed baseline';
  end if;

  v_definition := pg_catalog.replace(v_definition, v_old_guard, v_new_guard);
  execute v_definition;
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
) is 'Records a service-only Human Review decision while its Run is running or waiting_human_review; candidate, Slot version, mapping checksum and asset guards remain exact.';

commit;
