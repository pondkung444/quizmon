-- Guardian Phase 6 follow-up: make guardian_get_plan_progress use the SAME numbers the pass gate uses.
-- Return column attempts_since_current -> attempts_total, so DROP + CREATE (function is new in Phase 6,
-- nothing else depends on it; grants restored below).
--
--   attempts_total  = ALL attempts on the chapter, no time scope — identical to v_total_attempts in
--                     guardian_advance_plan_if_passed, so "N/20" matches the real pass gate
--   accuracy_recent = accuracy of the last 15 attempts, no time scope — identical to the pass-gate window;
--                     NULL when attempts_total < 15
--   accuracy_start  = accuracy of the first 5 attempts made since the chapter became current
--                     (entered_current_at, falls back to plan created_at); NULL when fewer than 5 such attempts.
--                     The only time-scoped number: the "start of this round" reference point.

drop function if exists public.guardian_get_plan_progress(uuid);

create function public.guardian_get_plan_progress(p_student_id uuid)
returns table(
  chapter_key text,
  subject text,
  branch text,
  chapter text,
  attempts_total int,
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
      (qa.created_at >= c.since_at) as is_since,
      row_number() over (partition by c.ck order by qa.created_at desc, qa.id desc) as rn_desc,
      row_number() over (partition by c.ck, (qa.created_at >= c.since_at) order by qa.created_at, qa.id) as rn_since_asc
    from cur c
    join public.quiz_attempts qa
      on qa.user_id = p_student_id and qa.source is null
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
      count(*) filter (where a.is_since)::int as since_total,
      count(*) filter (where a.is_since and a.rn_since_asc <= 5 and a.ok) as start_ok,
      count(*) filter (where a.rn_desc <= 15 and a.ok) as recent_ok
    from att a
    group by a.ck
  )
  select
    c.ck, c.subj, c.br, c.chap,
    coalesce(g.total, 0),
    case when coalesce(g.since_total, 0) >= 5 then round(g.start_ok::numeric / 5 * 100, 0) end,
    case when coalesce(g.total, 0) >= 15 then round(g.recent_ok::numeric / 15 * 100, 0) end,
    20
  from cur c
  left join agg g on g.ck = c.ck
  order by c.subj, c.ck;
end;
$$;

revoke all on function public.guardian_get_plan_progress(uuid) from public, anon;
grant execute on function public.guardian_get_plan_progress(uuid) to authenticated, service_role;
