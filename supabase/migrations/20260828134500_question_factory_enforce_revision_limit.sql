begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.question_factory_enforce_slot_revision_limit()
returns trigger language plpgsql set search_path='' as $$
declare v_limit smallint;
begin
  if new.author_revision<=old.author_revision then return new; end if;
  select max_revisions_per_slot into strict v_limit
  from public.question_factory_runs where id=new.run_id;
  if new.author_revision>v_limit then raise exception 'slot author revision limit exceeded'; end if;
  return new;
end;$$;

revoke all on function public.question_factory_enforce_slot_revision_limit() from public,anon,authenticated;
create trigger question_factory_slots_revision_limit
before update of author_revision on public.question_factory_slots
for each row execute function public.question_factory_enforce_slot_revision_limit();

comment on function public.question_factory_enforce_slot_revision_limit() is
'Fails closed when any write attempts to increment a slot beyond its Run max_revisions_per_slot guardrail.';
commit;
