-- Guardian: "ค้าง" (stuck) เปลี่ยนจาก 14 วันคงที่นับจาก entered_current_at เป็นเทียบสัปดาห์ตามแผนจริง
-- (real week ปัจจุบัน vs. target week ของบท current ตามลำดับคิว) — สูตร target week ต้องตรงกับฝั่ง
-- frontend เป๊ะ: placeChapters() ใน src/lib/planSchedule.ts ใช้ weekIndex = min(n-1, floor(i*n/m))
-- โดย i = ตำแหน่ง 0-based ในคิวของวิชา (เรียง queue_order, ไม่รวม beforePlan), m = จำนวนบทที่ไม่ใช่
-- beforePlan ของวิชานั้น, n = duration_weeks — ไฟล์นี้ทำสิ่งเดียวกันฝั่ง SQL
--
-- เกณฑ์ผ่าน (>=20 ข้อ + ล่าสุด 15 ข้อ >=70%) และระบบไข่รางวัลไม่เปลี่ยน — เงื่อนไข stuck ใหม่เป็นแค่
-- fallback ตอนยังไม่ผ่านเกณฑ์แต่เลยสัปดาห์แผนไปแล้ว
--
-- เพิ่ม catch-up: เดิม loop ผ่านแถว status='current' แค่รอบเดียวตอนเริ่มฟังก์ชัน พอ promote บทถัดไป
-- แล้วไม่เช็คซ้ำว่าบทที่เพิ่ง promote ยังค้างอยู่อีกหรือเปล่า — เด็กที่หายไปหลายสัปดาห์เลยต้องเล่น
-- หลายรอบกว่าจะตามทัน ตอนนี้ loop ซ้ำในวิชาเดียวกันจนกว่าจะไม่ค้างอีก หรือหมดคิว (v_next_key is null)
--
-- guardian_advance_plan_if_passed keeps its return columns => CREATE OR REPLACE is enough.

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
