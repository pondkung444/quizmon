-- Premium phase 1.5b: temporary observer for direct writes to public.pets
-- by anon/authenticated. Removed in phase 1.5f (drop schema pets_audit_private cascade).

create schema if not exists pets_audit_private;

revoke all on schema pets_audit_private from public;
grant usage on schema pets_audit_private to anon, authenticated;

create table pets_audit_private.pets_write_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  db_role         text        not null,
  op              text        not null,
  pet_id          uuid,
  auth_uid        uuid,
  changed_columns text[]      not null,
  request_method  text,
  request_path    text
);

revoke all on pets_audit_private.pets_write_log from public;
grant insert on pets_audit_private.pets_write_log to anon, authenticated;

create or replace function pets_audit_private.log_pets_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cols text[];
begin
  if current_user not in ('anon', 'authenticated') then
    return null;
  end if;

  begin
    if tg_op = 'INSERT' then
      select coalesce(array_agg(n.key order by n.key), '{}')
        into v_cols
        from jsonb_each(to_jsonb(new)) n
       where n.key <> 'updated_at';
    else
      select coalesce(array_agg(n.key order by n.key), '{}')
        into v_cols
        from jsonb_each(to_jsonb(new)) n
       where n.key <> 'updated_at'
         and n.value is distinct from (to_jsonb(old) -> n.key);
    end if;

    insert into pets_audit_private.pets_write_log
      (db_role, op, pet_id, auth_uid, changed_columns, request_method, request_path)
    values
      (current_user, tg_op, new.id, auth.uid(), v_cols,
       current_setting('request.method', true),
       current_setting('request.path', true));
  exception when others then
    null;
  end;

  return null;
end;
$$;

create trigger trg_pets_write_audit
  after insert or update on public.pets
  for each row
  execute function pets_audit_private.log_pets_write();
