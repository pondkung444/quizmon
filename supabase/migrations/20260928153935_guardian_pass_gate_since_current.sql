-- Guardian: เกณฑ์ผ่านบทนับเฉพาะข้อที่ทำ "หลังบทขึ้นเป็น current" (ปอนด์ตัดสินใจ 2026-09-28)
--
-- ปัญหาเดิม: guardian_advance_plan_if_passed นับ quiz_attempts ทั้งหมดตลอดกาลของบทนั้น
-- → บทที่เด็กเคยทำได้ก่อนเริ่มแผนผ่านทันทีที่ถูก promote แล้วไหลต่อกันหลายบทใน loop catch-up
-- → ได้ egg_epic_02 ฟรี (ซันซัน 6 ใบใน 9 วัน, 2026-09-28 ได้ 2 ใบห่างกัน 49 วินาที)
--
-- แก้: นับเฉพาะ attempts ที่ created_at >= coalesce(entered_current_at, plan.created_at)
--   - บทที่เพิ่ง promote ใน loop มี entered_current_at = now() → นับได้ 0 ข้อ → ไม่ผ่านต่อทันที
--   - สาย stuck (ตามสัปดาห์) ยังไหลต่อได้เหมือนเดิม — ตั้งใจ (catch-up เด็กที่หายไปหลายสัปดาห์)
--   - guardian_get_plan_progress แก้ให้ใช้หน้าต่างเดียวกัน ไม่งั้นหน้า progress จะโชว์ "ครบแล้ว" แต่ไม่ผ่าน
-- ไม่ย้อนแก้ข้อมูลเก่า (บทที่ผ่านไปแล้ว/ไข่ที่แจกไปแล้วคงไว้ — ไม่ยึดคืน)
-- CREATE OR REPLACE คง GRANT เดิมไว้ทั้งคู่

CREATE OR REPLACE FUNCTION public.guardian_advance_plan_if_passed(p_student_id uuid)
 RETURNS TABLE(affected_chapter_key text, new_status text, promoted_chapter_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_since timestamptz;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean;
  v_stuck boolean;
  v_target_week integer;
  v_real_week integer;
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

  v_real_week := greatest(0, least(
    v_plan.duration_weeks - 1,
    ((now() at time zone 'Asia/Bangkok')::date - (v_plan.created_at at time zone 'Asia/Bangkok')::date) / 7
  ));

  -- one current per subject: evaluate each independently
  for v_current in
    select * from public.guardian_plan_chapters
    where plan_id = v_plan.id and status = 'current'
    order by subject, queue_order
    for update
  loop
    -- catch-up: เช็คบท current ของวิชานี้ซ้ำไปเรื่อยๆ หลัง promote จนกว่าจะไม่ค้างอีก หรือหมดคิว
    -- เพื่อให้เด็กที่หายไปหลายสัปดาห์กระโดดไปบทที่ควรเรียน ณ ตอนนี้ได้ในครั้งเดียว
    loop
      v_passed := false;
      v_stuck := false;

      select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

      -- NEW (2026-09-28): นับเฉพาะข้อหลังบทนี้ขึ้นเป็น current
      v_since := coalesce(v_current.entered_current_at, v_plan.created_at);

      select count(*) into v_total_attempts
      from public.quiz_attempts qa
      join public.questions q on q.id = qa.question_id
      where qa.user_id = p_student_id
        and qa.source is null
        and qa.created_at >= v_since
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
          and qa.created_at >= v_since
          and q.subject = v_cc.subject
          and (q.branch is not distinct from v_cc.branch)
          and q.grade_band = v_cc.grade_band
          and q.chapter = v_cc.chapter
        order by qa.created_at desc
        limit 15
      ) sub;

      -- target week ของบท current นี้ตามคิวที่วางแผนไว้ — สูตรเดียวกับ placeChapters() ฝั่ง frontend
      -- (เรียง queue_order ข้ามทุกสถานะของวิชานั้น ไม่รวมบทที่ผ่านก่อนวันเริ่มแผน)
      select floor(r.i * v_plan.duration_weeks::numeric / r.m)::int
        into v_target_week
      from (
        select gpc.id,
          row_number() over (order by gpc.queue_order, gpc.id) - 1 as i,
          count(*) over () as m
        from public.guardian_plan_chapters gpc
        where gpc.plan_id = v_plan.id
          and gpc.subject = v_current.subject
          and not (
            gpc.status = 'passed'
            and gpc.passed_at is not null
            and (gpc.passed_at at time zone 'Asia/Bangkok')::date
              < (v_plan.created_at at time zone 'Asia/Bangkok')::date
          )
      ) r
      where r.id = v_current.id;

      v_target_week := least(v_target_week, v_plan.duration_weeks - 1);

      if v_total_attempts >= 20 and v_recent_count > 0
         and v_recent_correct::numeric / v_recent_count >= 0.70 then
        v_passed := true;
      elsif v_real_week > v_target_week then
        v_stuck := true;
      end if;

      if not v_passed and not v_stuck then
        return query select v_current.chapter_key, v_current.status, null::text;
        exit; -- บทนี้ยังไม่ถึงกำหนดเลื่อน — ไปวิชาถัดไป
      end if;

      if v_passed then
        update public.guardian_plan_chapters
        set status = 'passed', passed_at = now()
        where id = v_current.id;

        -- "ผ่านทุก 2 บท → ไข่" (§6.1): plan-wide count across subjects, checked on every pass
        select count(*) into v_passed_chapter_count
        from public.guardian_plan_chapters gpc
        where gpc.plan_id = v_plan.id and gpc.status = 'passed';

        if v_passed_chapter_count % 2 = 0 then
          insert into public.player_eggs (user_id, egg_type_id, source)
          values (p_student_id, v_reward_egg_type_id, 'guardian_plan_reward');
        end if;
      else
        update public.guardian_plan_chapters
        set status = 'stuck'
        where id = v_current.id;
      end if;

      -- promote the next pending chapter of the SAME subject only
      select gpc.chapter_key into v_next_key
      from public.guardian_plan_chapters gpc
      where gpc.plan_id = v_plan.id and gpc.subject = v_current.subject and gpc.status = 'pending'
      order by gpc.queue_order
      limit 1;

      if v_next_key is not null then
        update public.guardian_plan_chapters
        set status = 'current', entered_current_at = now()
        where plan_id = v_plan.id and chapter_key = v_next_key;
      end if;

      return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;

      exit when v_next_key is null; -- หมดคิววิชานี้แล้ว

      select * into v_current from public.guardian_plan_chapters
      where plan_id = v_plan.id and chapter_key = v_next_key
      for update;
    end loop;
  end loop;

  -- plan is done once no subject has a current or pending chapter left
  if not exists (
    select 1 from public.guardian_plan_chapters
    where plan_id = v_plan.id and status in ('current', 'pending')
  ) then
    update public.guardian_plan set status = 'completed' where id = v_plan.id;

    perform public.grant_profile_frame(p_student_id, 'guardian_special', 'guardian_plan_complete');
  end if;
end;
$function$;


-- หน้า progress ต้องใช้หน้าต่างเวลาเดียวกับเกณฑ์ผ่าน: attempts_total / accuracy_recent นับเฉพาะหลัง since_at
-- (accuracy_start ใช้หน้าต่างนี้อยู่แล้ว — ตอนนี้ทั้ง 3 ค่าใช้หน้าต่างเดียวกัน)
CREATE OR REPLACE FUNCTION public.guardian_get_plan_progress(p_student_id uuid)
 RETURNS TABLE(chapter_key text, subject text, branch text, chapter text, attempts_total integer, accuracy_start numeric, accuracy_recent numeric, pass_threshold_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  with cur as (
    select
      gpc.chapter_key as ck, cc.subject as subj, cc.branch as br, cc.chapter as chap,
      cc.grade_band as gb, coalesce(gpc.entered_current_at, gp.created_at) as since_at
    from public.guardian_plan gp
    join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
    join public.curriculum_chapters cc on cc.chapter_key = gpc.chapter_key
    where gp.student_id = p_student_id and gp.status = 'active' and gpc.status = 'current'
  ),
  att as (
    select
      c.ck,
      qa.is_correct as ok,
      row_number() over (partition by c.ck order by qa.created_at desc, qa.id desc) as rn_desc,
      row_number() over (partition by c.ck order by qa.created_at, qa.id) as rn_asc
    from cur c
    join public.quiz_attempts qa
      on qa.user_id = p_student_id and qa.source is null
     and qa.created_at >= c.since_at   -- NEW (2026-09-28): หน้าต่างเดียวกับ guardian_advance_plan_if_passed
    join public.questions q
      on q.id = qa.question_id
     and q.subject = c.subj
     and (q.branch is not distinct from c.br)
     and q.grade_band = c.gb
     and q.chapter = c.chap
  ),
  agg as (
    select
      a.ck,
      count(*)::int as total,
      count(*) filter (where a.rn_asc <= 5 and a.ok) as start_ok,
      count(*) filter (where a.rn_desc <= 15 and a.ok) as recent_ok
    from att a
    group by a.ck
  )
  select
    c.ck, c.subj, c.br, c.chap,
    coalesce(g.total, 0),
    case when coalesce(g.total, 0) >= 5 then round(g.start_ok::numeric / 5 * 100, 0) end,
    case when coalesce(g.total, 0) >= 15 then round(g.recent_ok::numeric / 15 * 100, 0) end,
    20
  from cur c
  left join agg g on g.ck = c.ck
  order by c.subj, c.ck;
end;
$function$;
