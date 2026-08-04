-- Migration: 20260804120600_fix_start_dungeon_bonus_ambiguous_id
-- แก้บั๊ก: RETURNS TABLE(id bigint, ...) ของ start_dungeon_bonus ทำให้ "id" กลายเป็นตัวแปร OUT
-- โดยอัตโนมัติ ชนกับ dungeon_runs.id ตรงเงื่อนไข guard แรก (พบตอนทดสอบจริง: 42702 column
-- reference "id" is ambiguous) — แก้ด้วยการ qualify เป็น dungeon_runs.id/dungeon_runs.user_id

create or replace function public.start_dungeon_bonus(p_run_id uuid)
returns table (
  id bigint,
  subject text,
  category text,
  difficulty smallint,
  question_text text,
  choices jsonb,
  correct_index smallint,
  explanation text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_band text;
  v_weak_category text;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.dungeon_runs
  where dungeon_runs.id = p_run_id and dungeon_runs.user_id = v_user_id;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้';
  end if;

  if v_run.status <> 'in_progress' then
    raise exception 'การผจญภัยนี้จบไปแล้ว';
  end if;

  if v_run.bonus_quiz_used then
    raise exception 'ใช้คำถามโบนัสของการผจญภัยนี้ไปแล้ว';
  end if;

  select p.grade_band into v_band from public.profiles p where p.id = v_user_id;
  v_band := coalesce(v_band, 'junior');

  select q.category into v_weak_category
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.user_id = v_user_id
    and qa.source is null
    and q.grade_band = v_band
  group by q.category
  having count(*) >= 10
  order by (sum(qa.is_correct::int)::numeric / count(*)) asc
  limit 1;

  if v_weak_category is not null then
    return query
      select qz.id, qz.subject, qz.category, qz.difficulty, qz.question_text, qz.choices, qz.correct_index, qz.explanation
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category
      order by random()
      limit 5;
  else
    return query
      select qz.id, qz.subject, qz.category, qz.difficulty, qz.question_text, qz.choices, qz.correct_index, qz.explanation
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band
      order by random()
      limit 5;
  end if;
end;
$$;

-- ============================================================
-- Rollback: re-apply 20260804120500_dungeon_bonus_rpcs.sql (เนื้อ query เดิมก่อนแก้)
-- ============================================================
