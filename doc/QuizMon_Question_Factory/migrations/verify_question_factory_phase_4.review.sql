-- READ-ONLY VERIFICATION DRAFT
-- Run after each approved migration step in Phase 4.5/4.6.

-- 1. Expected Factory tables and RLS flags.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'question_factory_%'
  and c.relkind = 'r'
order by c.relname;

-- 2. Factory policy inventory must be empty in server-only v1.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'question_factory_%'
order by tablename, policyname;

-- 3. No anon/authenticated Factory table privileges.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'question_factory_%'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 4. Service grants must match immutable/current-state split.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'question_factory_%'
  and grantee = 'service_role'
order by table_name, privilege_type;

-- 5. Constraints and indexes for review.
select
  conrelid::regclass as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid, true) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text like 'question_factory_%'
order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename like 'question_factory_%'
order by tablename, indexname;

-- 6. Question read policy and relevant client grants.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'questions'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'questions'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 7. Storage bucket and object policy inventory.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('question-images', 'question-factory-assets')
order by id;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 8. Existing product data must be unchanged by schema/permission migrations.
select status, count(*)
from public.questions
group by status
order by status;
