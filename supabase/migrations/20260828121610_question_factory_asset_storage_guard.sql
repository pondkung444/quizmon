begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.question_factory_verify_staging_object()
returns trigger language plpgsql set search_path='' as $$
declare v_metadata jsonb;
begin
  select metadata into v_metadata from storage.objects
  where bucket_id=new.staging_bucket and name=new.staging_path;
  if not found then raise exception 'staging object does not exist'; end if;
  if (v_metadata->>'size')::bigint is distinct from new.byte_size then
    raise exception 'staging object size does not match asset row';
  end if;
  if v_metadata->>'mimetype' is distinct from new.mime_type then
    raise exception 'staging object MIME type does not match asset row';
  end if;
  return new;
end;$$;

revoke all on function public.question_factory_verify_staging_object() from public,anon,authenticated;
create trigger question_factory_assets_verify_staging_object
before insert on public.question_factory_assets
for each row execute function public.question_factory_verify_staging_object();
comment on function public.question_factory_verify_staging_object() is
'Prevents phantom Factory asset rows by requiring an existing Storage object with matching size and MIME metadata. Content hash remains worker-verified by exact download.';
commit;
