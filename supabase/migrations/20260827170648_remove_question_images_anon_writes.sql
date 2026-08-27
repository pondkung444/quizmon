-- The trusted uploader is scripts/upload-question-image.mjs and uses server-only
-- service authority. Public downloads remain unchanged because the bucket stays public.

begin;

do $$
declare
  v_bucket_public boolean;
  v_policy_count integer;
  v_policy_ok boolean;
begin
  select public
    into v_bucket_public
  from storage.buckets
  where id = 'question-images';

  if v_bucket_public is distinct from true then
    raise exception 'question-images precondition failed: expected existing public bucket';
  end if;

  select count(*),
         bool_and(
           roles = array['anon']::name[]
           and (
             (
               policyname = 'question-images anon insert'
               and cmd = 'INSERT'
               and qual is null
               and with_check = '(bucket_id = ''question-images''::text)'
             )
             or
             (
               policyname = 'question-images anon update'
               and cmd = 'UPDATE'
               and qual = '(bucket_id = ''question-images''::text)'
               and with_check is null
             )
           )
         )
    into v_policy_count, v_policy_ok
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'question-images anon insert',
      'question-images anon update'
    );

  if v_policy_count <> 2 or not coalesce(v_policy_ok, false) then
    raise exception 'question-images precondition failed: anonymous policies differ from the surveyed definitions';
  end if;
end
$$;

drop policy "question-images anon insert" on storage.objects;
drop policy "question-images anon update" on storage.objects;

commit;
