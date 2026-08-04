-- Migration: 20260804120500_dungeon_bonus_rpcs
-- start_dungeon_bonus: guard เป็นรันของ user เรียก · status='in_progress' · bonus_quiz_used=false
-- คืน 5 คำถามจากหมวดที่ไม่แม่นที่สุด (>=10 ข้อเคยตอบ all-time, source is null, ตรง grade_band,
-- accuracy ต่ำสุด) ถ้าไม่มีหมวดไหนผ่านเกณฑ์ -> สุ่มจาก questions.status='active' ทั้งหมด (กรอง
-- grade_band) ไม่ mark bonus_quiz_used ที่นี่ (mark ตอน apply เท่านั้น กันเคสเปิดจอค้าง)
--
-- apply_dungeon_bonus: guard เป็นรันของ user เรียก · bonus_quiz_used=false (atomic ผ่าน UPDATE...WHERE
-- เหมือน claim_daily_mission_bonus) ลด ends_at ตาม p_correct_count*12 นาที (clamp 0-5 ก่อนเสมอ)
-- พื้นต่ำสุด = now() ไม่ติดลบ ไม่ insert quiz_attempts เอง (ทำผ่าน submitDungeonBonusAnswer() server
-- action แยกต่างหาก insert อย่างเดียว ไม่แตะ EXP/pets counters/daily_missions)
--
-- หมายเหตุ: start_dungeon_bonus เวอร์ชันนี้ถูกแก้เพิ่มอีก 2 ครั้งใน migration ถัดไป
-- (20260804121406, 20260804121542, 20260804121622 — บั๊ก ambiguous column "id"/"category" จาก
-- RETURNS TABLE + edge case หมวดไม่มีคำถาม active เหลือ) เก็บไฟล์นี้ไว้ตามลำดับที่ apply จริง
-- ห้ามแก้ไฟล์นี้ย้อนหลัง ดู migration ถัดไปสำหรับเนื้อ query ล่าสุด

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
  where id = p_run_id and user_id = v_user_id;

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

grant execute on function public.start_dungeon_bonus(uuid) to authenticated;

create or replace function public.apply_dungeon_bonus(p_run_id uuid, p_correct_count int)
returns public.dungeon_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_clamped int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  v_clamped := greatest(0, least(5, coalesce(p_correct_count, 0)));

  update public.dungeon_runs
  set ends_at = greatest(now(), ends_at - (v_clamped * 12 || ' minutes')::interval),
      bonus_quiz_used = true,
      bonus_minutes_saved = v_clamped * 12
  where id = p_run_id
    and user_id = v_user_id
    and bonus_quiz_used = false
  returning * into v_run;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้ หรือใช้คำถามโบนัสไปแล้ว';
  end if;

  return v_run;
end;
$$;

grant execute on function public.apply_dungeon_bonus(uuid, int) to authenticated;

-- ============================================================
-- Rollback:
-- drop function if exists public.apply_dungeon_bonus(uuid, int);
-- drop function if exists public.start_dungeon_bonus(uuid);
-- ============================================================
