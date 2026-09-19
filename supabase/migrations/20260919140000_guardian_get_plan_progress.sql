-- Guardian Phase 6: read-only RPC for the Overview plan card ("ตอนเริ่ม → ตอนนี้").
-- NEW function only; no existing function is modified.
--
-- One row per current chapter of the student's active plan (one per subject, Phase 5a).
-- Attempt matching is the same as guardian_advance_plan_if_passed: quiz_attempts with source is null,
-- joined to questions by subject/branch/grade_band/chapter. Counting starts at entered_current_at
-- (falls back to the plan's created_at).
--   accuracy_start  = accuracy of the FIRST 10 attempts since the chapter became current
--   accuracy_recent = accuracy of the LAST 15 attempts (same window guardian_advance_plan_if_passed uses)
-- Both are NULL until attempts_since_current >= 25 (10 + 15) so the two windows never overlap and each
-- has a meaningful sample. pass_threshold_attempts = 20 mirrors the gate in guardian_advance_plan_if_passed.

create or replace function public.guardian_get_plan_progress(p_student_id uuid)
returns table(
  chapter_key text,
  subject text,
  branch text,
  chapter text,
  attempts_since_current int,
  accuracy_start numeric,
  accuracy_recent numeric,
  pass_threshold_attempts int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;
  if not exists (
    select 1 from public.guardian_links gl
    where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
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
      row_number() over (partition by c.ck order by qa.created_at, qa.id) as rn_asc,
      row_number() over (partition by c.ck order by qa.created_at desc, qa.id desc) as rn_desc,
      count(*) over (partition by c.ck) as cnt
    from cur c
    join public.quiz_attempts qa
      on qa.user_id = p_student_id and qa.source is null and qa.created_at >= c.since_at
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
      max(a.cnt)::int as total,
      count(*) filter (where a.rn_asc <= 10 and a.ok) as start_ok,
      count(*) filter (where a.rn_desc <= 15 and a.ok) as recent_ok
    from att a
    group by a.ck
  )
  select
    c.ck, c.subj, c.br, c.chap,
    coalesce(g.total, 0),
    case when coalesce(g.total, 0) >= 25 then round(g.start_ok::numeric / 10 * 100, 0) end,
    case when coalesce(g.total, 0) >= 25 then round(g.recent_ok::numeric / 15 * 100, 0) end,
    20
  from cur c
  left join agg g on g.ck = c.ck
  order by c.subj, c.ck;
end;
$$;

revoke all on function public.guardian_get_plan_progress(uuid) from public, anon;
grant execute on function public.guardian_get_plan_progress(uuid) to authenticated, service_role;
