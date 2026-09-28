-- Guardian เฟส 0 — ปิดบั๊ก + เก็บสิทธิ์ (ปอนด์ตัดสินใจ 2026-09-28)
--
-- 1) Q8  กัน senior: สร้าง/ใช้รหัสเชิญได้เฉพาะ junior (spec v1 = ม.1–3 เท่านั้น)
-- 2) B3  ถอดลิงก์แล้วแผน/เป้าต้องหยุด (spec รูที่ 5) + จำไว้ว่าใครเคยผูก เพื่อแสดงข้อความหลังถูกถอด (G6)
-- 3) B2  ไข่ egg_epic_02: ได้ตอนผ่านบทที่ 1, 3, 5, … (spec รูที่ 7) นับเฉพาะบทที่ผ่านหลังวันเริ่มแผน
-- 4) H1  ปิด EXECUTE จาก PUBLIC/anon ของ RPC ผู้พิทักษ์ทุกตัว → authenticated เท่านั้น
--
-- ไม่ย้อนแก้ข้อมูลเก่า: ลิงก์ที่ถูกถอดไปก่อนหน้านี้ (3 แถว) guardian_id ถูกล้างไปแล้ว กู้ไม่ได้ — ไม่กระทบใคร

-- =====================================================================
-- 1) Q8 — กัน senior
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guardian_create_invite_code()
 RETURNS TABLE(invite_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  -- NEW (2026-09-28): v1 เปิดให้ junior เท่านั้น
  if coalesce((select p.grade_band from public.profiles p where p.id = v_uid), '') <> 'junior' then
    raise exception 'ระบบผู้พิทักษ์ยังเปิดให้ ม.1–3 ก่อน';
  end if;

  update public.guardian_links
  set status = 'revoked'
  where student_id = v_uid and status = 'pending';

  loop
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 8)
    );
    exit when not exists (
      select 1 from public.guardian_links gl where gl.invite_code = v_code and gl.status = 'pending'
    );
  end loop;

  v_expires := now() + interval '24 hours';

  insert into public.guardian_links (student_id, invite_code, expires_at)
  values (v_uid, v_code, v_expires);

  return query select v_code, v_expires;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_claim_invite_code(p_invite_code text)
 RETURNS TABLE(student_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_link public.guardian_links;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'บัญชีนี้ไม่ใช่บัญชีผู้ปกครอง';
  end if;

  select * into v_link
  from public.guardian_links
  where invite_code = upper(btrim(p_invite_code))
    and status = 'pending'
  for update;

  if not found then
    raise exception 'รหัสเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว';
  end if;

  if v_link.expires_at < now() then
    update public.guardian_links set status = 'expired' where id = v_link.id;
    raise exception 'รหัสเชิญหมดอายุแล้ว';
  end if;

  -- NEW (2026-09-28): กันกรณีเด็กสร้างรหัสตอนเป็น junior แล้วเปลี่ยนระดับชั้นก่อนผู้ปกครองกรอก
  if coalesce((select p.grade_band from public.profiles p where p.id = v_link.student_id), '') <> 'junior' then
    raise exception 'ระบบผู้พิทักษ์ยังเปิดให้ ม.1–3 ก่อน';
  end if;

  if exists (
    select 1 from public.guardian_links gl2
    where gl2.guardian_id = v_uid and gl2.student_id = v_link.student_id and gl2.status = 'claimed'
  ) then
    raise exception 'ผู้ปกครองคนนี้เชื่อมกับบัญชีนี้อยู่แล้ว';
  end if;

  update public.guardian_links
  set status = 'claimed', guardian_id = v_uid, claimed_at = now()
  where id = v_link.id;

  return query select v_link.student_id;
end;
$function$;

-- =====================================================================
-- 2) B3 — ถอดลิงก์แล้วแผน/เป้าหยุด + จำว่าใครเคยผูก
-- =====================================================================

-- guardian_id ต้องเป็น NULL เมื่อไม่ใช่ claimed (constraint guardian_links_claimed_consistency)
-- → เก็บผู้พิทักษ์ที่ถูกถอดไว้ในคอลัมน์แยก
ALTER TABLE public.guardian_links
  ADD COLUMN IF NOT EXISTS revoked_guardian_id uuid REFERENCES public.guardians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS guardian_links_revoked_guardian_idx
  ON public.guardian_links (revoked_guardian_id) WHERE revoked_guardian_id IS NOT NULL;

-- สถานะแผนใหม่ 'revoked' = หยุดเพราะเด็กถอดผู้พิทักษ์ (แยกจาก 'replaced' เพื่อดูใน log/pilot ได้)
-- ตรวจแล้ว: ทุก RPC + startQuizRound อ่านเฉพาะ status='active' ไม่มีโค้ดไหน map ค่าอื่น
ALTER TABLE public.guardian_plan DROP CONSTRAINT guardian_plan_status_check;
ALTER TABLE public.guardian_plan ADD CONSTRAINT guardian_plan_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'replaced'::text, 'revoked'::text]));

CREATE OR REPLACE FUNCTION public.guardian_revoke_link(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guardian_id uuid;
  v_week_start date;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  update public.guardian_links
  set status = 'revoked',
      revoked_guardian_id = guardian_id,   -- NEW: จำไว้ก่อนล้าง (สำหรับข้อความฝั่งผู้ปกครอง รูที่ 5)
      revoked_at = now(),                  -- NEW
      guardian_id = null,
      claimed_at = null
  where id = p_link_id and student_id = v_uid and status = 'claimed'
  returning revoked_guardian_id into v_guardian_id;

  if v_guardian_id is null then
    raise exception 'ไม่พบการเชื่อมต่อนี้ หรือถูกถอดไปแล้ว';
  end if;

  -- NEW: แผนที่ผู้พิทักษ์คนนี้สร้างหยุดทันที → startQuizRound กลับเป็นสุ่ม 100% เอง (อ่านแค่ active)
  update public.guardian_plan
  set status = 'revoked', replaced_at = now()
  where student_id = v_uid and guardian_id = v_guardian_id and status = 'active';

  -- NEW: เป้าสัปดาห์นี้/ล่วงหน้าหยุดด้วย — เฉพาะเมื่อไม่เหลือผู้พิทักษ์คนอื่น และไม่ได้ใช้ "แผนของฉัน" (Premium)
  -- (guardian_goal ไม่มีคอลัมน์บอกว่าใครตั้ง — ถ้ายังมีคนอื่นหรือเด็กตั้งเองได้ ให้คงไว้)
  -- ของที่ได้ไปแล้ว (guardian_goal_reached_weeks / กรอบ / ไข่) ไม่แตะ
  if not exists (
    select 1 from public.guardian_links gl
    where gl.student_id = v_uid and gl.status = 'claimed'
  ) and not exists (
    select 1 from public.self_serve_enrollment e
    where e.student_id = v_uid and e.status = 'active' and now() < e.expires_at
  ) then
    select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;
    delete from public.guardian_goal g
    where g.student_id = v_uid and g.week_start >= v_week_start;
  end if;
end;
$function$;

-- ผู้ปกครองที่ถูกถอด: คืนแค่ชื่อเล่น + เวลา ไม่คืนข้อมูลอื่นของเด็ก
-- ไม่คืนถ้าผูกกลับมาแล้ว (มีลิงก์ claimed กับเด็กคนเดิม)
CREATE OR REPLACE FUNCTION public.guardian_get_unlinked_students()
 RETURNS TABLE(student_username text, revoked_at timestamp with time zone)
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

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  return query
  select distinct on (gl.student_id) p.username, gl.revoked_at
  from public.guardian_links gl
  join public.profiles p on p.id = gl.student_id
  where gl.revoked_guardian_id = v_uid
    and gl.status = 'revoked'
    and not exists (
      select 1 from public.guardian_links gl2
      where gl2.student_id = gl.student_id and gl2.guardian_id = v_uid and gl2.status = 'claimed'
    )
  order by gl.student_id, gl.revoked_at desc;
end;
$function$;

-- =====================================================================
-- 3) B2 — จังหวะไข่ 1, 3, 5, … นับเฉพาะบทที่ผ่านหลังวันเริ่มแผน
--    (เนื้อหาเหมือน 20260928153935 ทุกบรรทัด ยกเว้นส่วนนับไข่)
-- =====================================================================

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

      -- (2026-09-28): นับเฉพาะข้อหลังบทนี้ขึ้นเป็น current
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

        -- CHANGED (2026-09-28, Q1): ไข่ที่บทที่ 1, 3, 5, … ของแผน (spec รูที่ 7: ใบแรกตอนผ่านบทแรก)
        -- นับเฉพาะบทที่ผ่าน "ตั้งแต่วันเริ่มแผน" (เงื่อนไขเดียวกับที่ใช้คำนวณ target week ด้านบน)
        -- เดิม: นับทุกบท passed รวมบทก่อนแผน แล้วให้ที่เลขคู่
        select count(*) into v_passed_chapter_count
        from public.guardian_plan_chapters gpc
        where gpc.plan_id = v_plan.id
          and gpc.status = 'passed'
          and gpc.passed_at is not null
          and (gpc.passed_at at time zone 'Asia/Bangkok')::date
            >= (v_plan.created_at at time zone 'Asia/Bangkok')::date;

        if v_passed_chapter_count % 2 = 1 then
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

-- =====================================================================
-- 4) H1 — RPC ผู้พิทักษ์เรียกได้เฉพาะผู้ที่ล็อกอิน (authenticated)
--    guest (anonymous sign-in) เป็น role authenticated อยู่แล้ว แต่ถูกกันด้วย is_guardian_admin ในตัวฟังก์ชัน
--    ไม่แตะ grant_profile_frame / guardian_daily_points_bkk (ปิดไว้แล้ว — service_role เท่านั้น)
-- =====================================================================

DO $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (
        p.proname like 'guardian\_%'
        or p.proname in ('is_guardian_admin', 'get_my_frames', 'set_equipped_frame')
      )
      and p.proname not in ('guardian_daily_points_bkk')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;
