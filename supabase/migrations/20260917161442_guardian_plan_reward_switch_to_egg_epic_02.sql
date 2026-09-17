-- Migration: 20260917161442_guardian_plan_reward_switch_to_egg_epic_02
-- ไฟล์นี้ backfill เข้า repo โดยดึง statement คำต่อคำจาก supabase_migrations.schema_migrations
-- ผ่าน Supabase MCP (execute_sql) ไม่ใช่เขียนใหม่ — apply ตรงใน production ไปแล้วก่อนหน้านี้
-- (ตาม pattern เดียวกับ supabase/migrations/20260810151902_add_egg_epic_01_napha.sql)
--
-- สรุปสิ่งที่ทำ:
--   * เปิด egg_types.is_obtainable = true ให้ egg_epic_02 (ไข่ศักดิ์ธรา)
--   * แก้ guardian_advance_plan_if_passed() ให้แจกเฉพาะ egg_epic_02 แบบ hardcode แทนการสุ่มจาก
--     pool tier='epic' and is_obtainable=true ที่เพิ่งเพิ่มใน
--     20260917100000_guardian_plan_every_2_chapters_egg_reward.sql — pattern เดียวกับ
--     v_epic_egg_id constant text := 'egg_epic_01' ใน claim_raid_reward_egg_require_win()
--   * egg_epic_01 ไม่ถูกแตะ ยังคง is_obtainable=true เหมือนเดิม เพราะยังใช้ในระบบ raid_reward
--     แยกต่างหาก แค่ถูกตัดออกจาก pool ที่ guardian plan สุ่มเท่านั้น

-- Migration: guardian_plan_reward_switch_to_egg_epic_02
-- ปอนด์ตัดสินใจ (17 ก.ย. 69): เปิด egg_epic_02 ให้แจกได้จริง และให้ระบบผู้พิทักษ์
-- แจกเฉพาะ egg_epic_02 เท่านั้น (ไม่สุ่มกับ egg_epic_01 อีกต่อไป) — egg_epic_01 ยัง
-- เป็น is_obtainable=true ต่อไปเหมือนเดิม เพราะยังใช้ในระบบท้าทาย (raid_reward)
-- แค่ตัดออกจาก epic pool ที่ guardian_advance_plan_if_passed() สุ่มจากเท่านั้น
--
-- Pattern เดียวกับ claim_raid_reward_egg_require_win() ที่ hardcode 'egg_epic_01'
-- ไว้ตรงๆ ไม่ query จาก tier — เปลี่ยนจุดนี้จาก random-pool มาเป็น hardcode เหมือนกัน

update public.egg_types set is_obtainable = true where id = 'egg_epic_02';

create or replace function public.guardian_advance_plan_if_passed(p_student_id uuid)
 returns table(affected_chapter_key text, new_status text, promoted_chapter_key text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean := false;
  v_stuck boolean := false;
  v_next_key text;
  v_passed_chapter_count integer;
  v_reward_egg_type_id constant text := 'egg_epic_02'; -- hardcoded per ปอนด์ decision (2026-09-17)
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id then
    raise exception 'เรียกได้เฉพาะตัวนักเรียนเจ้าของบัญชีเท่านั้น';
  end if;

  select * into v_plan from public.guardian_plan
  where student_id = p_student_id and status = 'active';

  if not found then
    return;
  end if;

  select * into v_current from public.guardian_plan_chapters
  where plan_id = v_plan.id and status = 'current';

  if not found then
    return;
  end if;

  select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

  select count(*) into v_total_attempts
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.user_id = p_student_id
    and qa.source is null
    and q.subject = v_cc.subject
    and (q.branch is not distinct from v_cc.branch)
    and q.grade_band = v_cc.grade_band
    and q.chapter = v_cc.chapter;

  select count(*) filter (where sub.is_correct), count(*)
    into v_recent_correct, v_recent_count
  from (
    select qa.is_correct
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and q.subject = v_cc.subject
      and (q.branch is not distinct from v_cc.branch)
      and q.grade_band = v_cc.grade_band
      and q.chapter = v_cc.chapter
    order by qa.created_at desc
    limit 15
  ) sub;

  if v_total_attempts >= 20 and v_recent_count > 0
     and v_recent_correct::numeric / v_recent_count >= 0.70 then
    v_passed := true;
  elsif v_current.entered_current_at is not null
    and v_current.entered_current_at < now() - interval '14 days' then
    v_stuck := true;
  end if;

  if v_passed then
    update public.guardian_plan_chapters
    set status = 'passed', passed_at = now()
    where id = v_current.id;

    -- "ผ่านทุก 2 บท → ไข่" (§6.1) — นับบทที่ผ่านสะสมทั้งแผน ครบเลขคู่ถึงแจก
    select count(*) into v_passed_chapter_count
    from public.guardian_plan_chapters gpc
    where gpc.plan_id = v_plan.id and gpc.status = 'passed';

    if v_passed_chapter_count % 2 = 0 then
      insert into public.player_eggs (user_id, egg_type_id, source)
      values (p_student_id, v_reward_egg_type_id, 'guardian_plan_reward');
    end if;
  elsif v_stuck and v_current.status <> 'stuck' then
    update public.guardian_plan_chapters
    set status = 'stuck'
    where id = v_current.id;
  else
    return query select v_current.chapter_key, v_current.status, null::text;
    return;
  end if;

  select gpc.chapter_key into v_next_key
  from public.guardian_plan_chapters gpc
  where gpc.plan_id = v_plan.id and gpc.status = 'pending'
  order by gpc.queue_order
  limit 1;

  if v_next_key is not null then
    update public.guardian_plan_chapters
    set status = 'current', entered_current_at = now()
    where plan_id = v_plan.id and chapter_key = v_next_key;
  else
    update public.guardian_plan
    set status = 'completed'
    where id = v_plan.id;

    perform public.grant_profile_frame(p_student_id, 'guardian_special', 'guardian_plan_complete');
  end if;

  return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;
end;
$function$;
