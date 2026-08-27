-- Deploy the application change in src/app/feedback/actions.ts before this migration.
-- It removes the last authenticated historical-question read from the base table.

begin;

do $$
declare
  v_rls_enabled boolean;
  v_policy_count integer;
  v_policy_ok boolean;
begin
  select c.relrowsecurity
    into v_rls_enabled
  from pg_class c
  where c.oid = 'public.questions'::regclass;

  if not coalesce(v_rls_enabled, false) then
    raise exception 'questions RLS precondition failed: RLS is not enabled';
  end if;

  select count(*),
         bool_and(
           policyname = 'read questions'
           and roles = array['public']::name[]
           and cmd = 'SELECT'
           and qual = '(auth.role() = ''authenticated''::text)'
           and with_check is null
         )
    into v_policy_count, v_policy_ok
  from pg_policies
  where schemaname = 'public' and tablename = 'questions';

  if v_policy_count <> 1 or not coalesce(v_policy_ok, false) then
    raise exception 'questions policy precondition failed: expected exactly the surveyed legacy SELECT policy';
  end if;
end
$$;

drop policy "read questions" on public.questions;

create policy "authenticated users read active questions"
on public.questions
for select
to authenticated
using (status = 'active');

revoke select, insert, update, delete, truncate on table public.questions from anon;
revoke insert, update, delete, truncate on table public.questions from authenticated;

commit;
