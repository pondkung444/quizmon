-- ขยาย subline ให้รับสาย senior เพิ่ม 3 ค่า (คงของเดิม 3 ค่าไว้ junior ยังใช้อยู่)
alter table public.pets drop constraint pets_subline_check;
alter table public.pets add constraint pets_subline_check
  check (
    subline is null
    or subline = any (array['math','science','balanced','physics','chemistry','biology'])
  );

-- นับข้อที่ "ตอบถูก" แยกตามสาย สำหรับ pet 1 ตัว
-- เหตุผลที่ต้องเป็น SQL function ไม่ใช่ query จาก supabase-js:
--   PostgREST ไม่มี group-by aggregate และถ้าดึงแถวมานับใน JS จะติดเพดาน 1,000 แถวเงียบๆ
create or replace function public.get_pet_branch_counts(p_pet_id uuid)
returns table (branch text, correct_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select q.branch, count(*)::int as correct_count
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.pet_id = p_pet_id
    and qa.is_correct
    and q.branch is not null
    and (auth.uid() is null or qa.user_id = auth.uid())  -- service role ผ่าน / user เห็นแค่ของตัวเอง
  group by q.branch;
$$;

revoke all on function public.get_pet_branch_counts(uuid) from public;
grant execute on function public.get_pet_branch_counts(uuid) to authenticated, service_role;
