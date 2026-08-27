-- READY FOR DEPLOYMENT REVIEW — NOT YET APPLIED
-- Deploy the feedback server-action compatibility change before this migration.

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

  if not v_rls_enabled then
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

-- RLS already blocks writes, but revoke unnecessary table authority as a second
-- independent layer. Keep REFERENCES/TRIGGER unchanged pending broader app audit.
revoke select, insert, update, delete, truncate on table public.questions from anon;
revoke insert, update, delete, truncate on table public.questions from authenticated;

commit;
