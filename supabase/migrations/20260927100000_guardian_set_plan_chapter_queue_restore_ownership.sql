-- Restore the ownership check of guardian_set_plan_chapter_queue() that 20260926152310 loosened.
--
-- 20260926152310 (fix for the guardian_activity_log FK) replaced the 20260920072707 check with
--   guardian_id is distinct from uid AND student_id is distinct from uid → deny
-- which allows two things that were denied before:
--   1) a student editing a plan their GUARDIAN created (guardian_id not null, student_id = uid)
--   2) a self-serve student editing their own plan after premium expired (no enrollment check)
-- The RPC is executable by authenticated, so the DB must enforce both.
--
-- Rule (same as 20260920072707, Pond's decision 2026-09-27):
--   guardian_id not null → caller must be that guardian (always allowed; the student is denied)
--   guardian_id null     → self-serve plan: caller must be the student AND have an active,
--                          unexpired self_serve_enrollment
--   anything else → denied
-- Everything else is unchanged from the live 20260926152310 body (queue semantics from
-- 20260923041146: any status editable; activity log only when the caller is not the student).
-- No schema change, same signature → existing grants are kept.
create or replace function public.guardian_set_plan_chapter_queue(p_plan_id uuid, p_chapter_keys text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_bad_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_plan from public.guardian_plan where id = p_plan_id;

  if not found then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if v_plan.guardian_id is not null then
    -- plan created by a guardian: only that guardian may edit it (not the student)
    if v_plan.guardian_id <> v_uid then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
  else
    -- self-serve plan: only the student, and only while premium is active
    if v_plan.student_id <> v_uid then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = v_uid and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
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

  -- log only when a guardian edits someone else's plan (self-serve students have no guardians row)
  if v_uid <> v_plan.student_id then
    insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
    values (v_uid, v_plan.student_id, 'view_plan');
  end if;
end;
$function$;
