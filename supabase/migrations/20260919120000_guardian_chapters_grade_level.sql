-- Guardian Report: expose cc.grade_level / cc.grade_order so the UI can group chapters by grade
-- (chapter_order alone restarts per grade and looked continuous across grades).
--
-- Adding OUTPUT columns changes RETURNS TABLE, which CREATE OR REPLACE cannot do, so each function
-- is DROPped and recreated. Input signature, auth checks, filters and every existing column are
-- unchanged; the two new columns are APPENDED at the end. Grants are restored to what they were
-- before (PUBLIC, anon, authenticated, service_role, postgres = EXECUTE).
-- NOTE: grade_level is NULL (grade_order 0) for some junior "general" chapters — UI handles it.

drop function if exists public.guardian_get_categories(uuid);
drop function if exists public.guardian_get_available_chapters(uuid);

create function public.guardian_get_categories(p_student_id uuid)
returns table(subject text, branch text, chapter_key text, chapter text, answered_count integer,
              accuracy numeric, tier text, grade_level text, grade_order integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  return query
  select
    cc.subject,
    cc.branch,
    cc.chapter_key,
    cc.chapter,
    count(*)::integer as answered_count,
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0) as accuracy,
    case
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.80 then 'คล่องแล้ว'
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.50 then 'กำลังไปได้'
      else 'ยังต้องฝึก'
    end as tier,
    cc.grade_level,
    cc.grade_order
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
    and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= now() - interval '30 days'
  group by cc.chapter_key, cc.subject, cc.branch, cc.chapter, cc.grade_level, cc.grade_order
  having count(*) >= 10
  order by cc.subject, cc.chapter;
end;
$function$;

create function public.guardian_get_available_chapters(p_student_id uuid)
returns table(chapter_key text, subject text, branch text, chapter text, chapter_order integer,
              question_count integer, is_available boolean, recent_attempts integer,
              recent_accuracy numeric, already_in_active_plan boolean,
              grade_level text, grade_order integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_grade_band text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id and not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = p_student_id;

  if v_grade_band is null then
    raise exception 'ไม่พบข้อมูลระดับชั้นของนักเรียนคนนี้';
  end if;

  return query
  select
    cc.chapter_key,
    cc.subject,
    cc.branch,
    cc.chapter,
    cc.chapter_order,
    coalesce(cca.question_count, 0)::integer,
    coalesce(cca.is_available, false),
    coalesce(stats.attempts, 0)::integer as recent_attempts,
    stats.accuracy as recent_accuracy,
    exists (
      select 1 from public.guardian_plan gp
      join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
      where gp.student_id = p_student_id and gp.status = 'active' and gpc.chapter_key = cc.chapter_key
    ) as already_in_active_plan,
    cc.grade_level,
    cc.grade_order
  from public.curriculum_chapters cc
  join public.curriculum_chapter_availability cca
    on cca.chapter = cc.chapter and cca.subject = cc.subject
    and (cca.branch is not distinct from cc.branch) and cca.grade_band = cc.grade_band
  left join lateral (
    select
      count(*)::integer as attempts,
      round(count(*) filter (where qa.is_correct)::numeric / nullif(count(*), 0) * 100, 0) as accuracy
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and qa.created_at >= now() - interval '30 days'
      and q.subject = cc.subject
      and (q.branch is not distinct from cc.branch)
      and q.grade_band = cc.grade_band
      and q.chapter = cc.chapter
  ) stats on true
  where cc.grade_band = v_grade_band
  order by cc.subject, cc.chapter_order;
end;
$function$;

grant execute on function public.guardian_get_categories(uuid) to public, anon, authenticated, service_role;
grant execute on function public.guardian_get_available_chapters(uuid) to public, anon, authenticated, service_role;
