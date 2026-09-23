-- Guardian: เปิดให้ guardian_set_plan_chapter_queue แก้ไข (ลาก/ลบ) บทสถานะ "ผ่านแล้ว" ได้ด้วย ไม่ใช่
-- แค่ pending/current/stuck เหมือนเดิม — ตัด "and status <> 'passed'" ออกทั้ง 2 จุด (DELETE + queue_order
-- UPDATE) ที่เดิมกันบทผ่านแล้วไว้ไม่ให้แก้ผ่าน RPC นี้เลย
--
-- ⚠️ ผลที่ตามมาต้องคู่กับฝั่ง frontend เสมอ: caller (PlanWizard.tsx) ต้องส่ง chapter_key ของบทที่
-- ผ่านแล้วทุกบทเข้า p_chapter_keys เสมอ (ยกเว้นตอนตั้งใจลบบทนั้นจริงๆ) ไม่งั้น DELETE ข้างล่างจะลบบทที่
-- ผ่านแล้วทั้งหมดที่ไม่อยู่ใน array ทิ้งทันที (history หาย) — ดู PR ที่แก้ editableKeys() คู่กับ migration นี้
--
-- guardian_set_plan_chapter_queue keeps its signature/return type => CREATE OR REPLACE is enough.

create or replace function public.guardian_set_plan_chapter_queue(p_plan_id uuid, p_chapter_keys text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_bad_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_plan from public.guardian_plan where id = p_plan_id;

  if not found or v_plan.guardian_id <> v_uid then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if v_plan.status <> 'active' then
    raise exception 'แก้ไขได้เฉพาะแผนที่ active อยู่';
  end if;

  if p_chapter_keys is null or array_length(p_chapter_keys, 1) is null then
    raise exception 'คิวต้องมีอย่างน้อย 1 บทเรียน';
  end if;

  if (select count(distinct ck) from unnest(p_chapter_keys) ck) <> array_length(p_chapter_keys, 1) then
    raise exception 'chapter_key ซ้ำกันในคิว';
  end if;

  select ck into v_bad_key
  from unnest(p_chapter_keys) ck
  where not exists (select 1 from public.curriculum_chapters cc where cc.chapter_key = ck)
  limit 1;

  if v_bad_key is not null then
    raise exception 'chapter_key ไม่ถูกต้อง: %', v_bad_key;
  end if;

  -- drop any chapter (any status, รวมถึง passed) ที่หายไปจาก array — caller ต้องส่ง key ของบทที่
  -- ผ่านแล้วเข้ามาเสมอถ้าไม่ได้ตั้งใจลบมัน (ดู warning ด้านบน)
  delete from public.guardian_plan_chapters
  where plan_id = p_plan_id
    and chapter_key <> all (p_chapter_keys);

  -- add new chapters as pending; existing ones (incl. passed) are skipped by on conflict
  insert into public.guardian_plan_chapters (plan_id, chapter_key, subject, branch, queue_order, status)
  select p_plan_id, k.ck, cc.subject, cc.branch, 0, 'pending'
  from unnest(p_chapter_keys) k(ck)
  join public.curriculum_chapters cc on cc.chapter_key = k.ck
  on conflict (plan_id, chapter_key) do nothing;

  -- queue_order per subject, in the order received — ทุกสถานะ (รวม passed) เรียงตาม array ที่ส่งมา
  update public.guardian_plan_chapters gpc
  set queue_order = o.q
  from (
    select k.ck, (row_number() over (partition by cc.subject order by k.ord) - 1)::int as q
    from unnest(p_chapter_keys) with ordinality as k(ck, ord)
    join public.curriculum_chapters cc on cc.chapter_key = k.ck
  ) o
  where gpc.plan_id = p_plan_id and gpc.chapter_key = o.ck;

  -- any subject left without a current (current removed, or subject newly added): promote its first pending
  update public.guardian_plan_chapters gpc
  set status = 'current', entered_current_at = now()
  where gpc.id in (
    select distinct on (p.subject) p.id
    from public.guardian_plan_chapters p
    where p.plan_id = p_plan_id and p.status = 'pending'
      and not exists (
        select 1 from public.guardian_plan_chapters c
        where c.plan_id = p_plan_id and c.subject = p.subject and c.status = 'current'
      )
    order by p.subject, p.queue_order
  );

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, v_plan.student_id, 'view_plan');
end;
$$;
