-- ระบบท้าทาย ทาง A "สนามไม่หาย" — เฟส 1 (DB): เลือกบทครั้งเดียว + สุ่มโจทย์ตอนกดท่า
-- ร่างโดย Claude 2026-11-02 จาก pg_get_functiondef บน prod (ไม่ได้ลอกจากไฟล์ใน repo)
-- การตัดสินใจ: Project doc claude/raid-arena-a-decisions-2026-11-01.md
--
-- ของใหม่ทั้งหมด จะไม่มีใครเรียกจนกว่าเฟส 2 เปิด RAID_ARENA_ENABLED
-- ไม่แตะ: commit_raid_card_state, answer_raid_card_question, commit_raid_card_turn,
--         draw_raid_chapter_hand, select_raid_chapter_offer, finish_exhausted_raid_chapters,
--         start_raid_run, start_raid_card_run(_unchecked), start_raid_chapter_run,
--         claim_raid_reward, claim_raid_card_reward, raid_pity, exp/evolution
-- คง state.version = 4 · ดาเมจ / ผลตัดสินยังมาจาก resolveTurn ของ engineV4 เหมือนเดิม

set local lock_timeout = '5s';

-- 1) เก็บบทที่เลือกไว้กับสนาม -------------------------------------------------
-- ค่าว่างทั้งคู่ = รอบ v4 เดิม (จั่วการ์ดบท) หรือรอบ v4 ที่ค้างอยู่ → pick_raid_move สุ่มจากทั้ง band
alter table public.raid_card_battles
  add column if not exists chapter_mode text,
  add column if not exists chapter_keys text[];

alter table public.raid_card_battles
  add constraint raid_card_battles_chapter_mode_check
    check (chapter_mode is null or chapter_mode in ('auto', 'manual')),
  add constraint raid_card_battles_chapter_keys_check
    check (
      (chapter_mode is null and chapter_keys is null)
      or (chapter_mode is not null and chapter_keys is not null and cardinality(chapter_keys) between 1 and 3)
    );

comment on column public.raid_card_battles.chapter_mode is
  'ทาง A: auto = ระบบเลือกบทให้ (บทที่ฝึกบ่อย 30 วัน + สุ่มเติม), manual = เด็กเลือกเอง · null = รอบ v4 แบบจั่วการ์ดบทเดิม';
comment on column public.raid_card_battles.chapter_keys is
  'บทที่ใช้สุ่มโจทย์ 1–3 บท รูปแบบเดียวกับ raid_chapter_offers.chapter_key: jsonb_build_array(coalesce(branch,subject), coalesce(chapter,category))::text';

-- 2) คลังบทที่ใช้ได้ของแต่ละ band (ภายใน) ----------------------------------------
-- label / subject ใช้ตรรกะเดียวกับ draw_raid_chapter_hand บน prod
-- เกณฑ์ >= 8 ข้อต่อบท (ด่านยาวสุด 8 ข้อ เลือกบทเดียวก็จบรอบได้)
-- ชั้น/ลำดับเติมจาก curriculum_chapters (จับด้วย chapter ไม่ใช้ category)
create or replace function public._raid_chapter_pool(p_band text)
returns table (
  chapter_key text,
  chapter text,
  subject text,
  subject_label text,
  grade_level text,
  grade_order integer,
  chapter_order integer,
  question_count integer
)
language sql
stable
set search_path to ''
as $$
  with eligible as (
    select
      coalesce(nullif(btrim(q.chapter), ''), nullif(btrim(q.category), '')) as label,
      coalesce(q.branch, q.subject) as learning_subject
    from public.questions q
    where q.status = 'active'
      and q.grade_band = p_band
      and coalesce(nullif(btrim(q.chapter), ''), nullif(btrim(q.category), '')) is not null
      and case when jsonb_typeof(q.choices) = 'array'
        then jsonb_array_length(q.choices) >= 2
          and q.correct_index between 0 and jsonb_array_length(q.choices) - 1
        else false end
  ), grouped as (
    select learning_subject, label, count(*)::integer as n
    from eligible
    group by learning_subject, label
    having count(*) >= 8
  )
  select
    jsonb_build_array(g.learning_subject, g.label)::text,
    g.label,
    g.learning_subject,
    cc.subject_label,
    cc.grade_level,
    cc.grade_order,
    cc.chapter_order,
    g.n
  from grouped g
  left join lateral (
    select c.subject_label, c.grade_level, c.grade_order, c.chapter_order
    from public.curriculum_chapters c
    where c.grade_band = p_band and c.chapter = g.label
    order by (coalesce(c.branch, c.subject) = g.learning_subject) desc, c.grade_order, c.chapter_order
    limit 1
  ) cc on true;
$$;

-- 3) "ให้ระบบเลือกให้" (ภายใน) -------------------------------------------------
-- Q3: บทที่ทำบ่อยสุด 3 บทใน 30 วัน จากฝึกปกติ (source is null) + เลือกบทเอง (topic_select)
--     เฉพาะบทที่อยู่ในคลังของ band ปัจจุบัน · ไม่พอ 3 บทสุ่มเติม · ไม่นับ raid/pvp/dungeon
create or replace function public._raid_auto_chapters(p_user_id uuid, p_band text)
returns text[]
language sql
volatile
set search_path to ''
as $$
  with pool as (
    select p.chapter_key from public._raid_chapter_pool(p_band) p
  ), freq as (
    select
      jsonb_build_array(
        coalesce(q.branch, q.subject),
        coalesce(nullif(btrim(q.chapter), ''), nullif(btrim(q.category), ''))
      )::text as k,
      count(*) as n
    from public.quiz_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = p_user_id
      and a.created_at >= now() - interval '30 days'
      and (a.source is null or a.source = 'topic_select')
      and q.grade_band = p_band
    group by 1
  )
  select coalesce(array(
    select pool.chapter_key
    from pool
    left join freq on freq.k = pool.chapter_key
    order by coalesce(freq.n, 0) desc, random()
    limit 3
  ), '{}'::text[]);
$$;

-- 4) รายการบทสำหรับหน้าเตรียมตัว ---------------------------------------------------
-- Q4: แสดงทุกชั้นใน band โดยเรียงชั้นของเด็กขึ้นก่อน · auto = บทที่ระบบจะเลือกให้ (แสดงเป็นชิป)
-- หน้าเตรียมตัวส่ง auto ชุดนี้กลับมาตอนเริ่ม เพื่อให้บทที่เห็นตรงกับบทที่ใช้จริง
create or replace function public.list_raid_chapters()
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_band text;
  v_grade text;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'เข้าสู่ระบบก่อน';
  end if;
  select grade_band, grade_level into v_band, v_grade from public.profiles where id = v_user;
  if v_band is null or v_band not in ('primary', 'junior', 'senior') then
    raise exception 'เลือกช่วงชั้นก่อนท้าทาย';
  end if;

  return jsonb_build_object(
    'gradeLevel', v_grade,
    'auto', to_jsonb(public._raid_auto_chapters(v_user, v_band)),
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', p.chapter_key,
          'chapter', p.chapter,
          'subject', p.subject,
          'subjectLabel', p.subject_label,
          'gradeLevel', p.grade_level,
          'questionCount', p.question_count,
          'ownGrade', p.grade_level is not distinct from v_grade
        )
        order by (p.grade_level is not distinct from v_grade) desc,
          p.grade_order nulls last, p.subject, p.chapter_order nulls last, p.chapter)
      from public._raid_chapter_pool(v_band) p
    ), '[]'::jsonb)
  );
end;
$$;

-- 5) เริ่มรอบพร้อมบท ---------------------------------------------------------------
-- ตรวจบทก่อนใช้กุญแจเสมอ · ล็อกด้วย key 9210 ตัวเดียวกับ start_raid_card_run_unchecked
-- (advisory lock ซ้อนในทรานแซกชันเดียวกันได้) · มีรอบค้างอยู่ = คืนรอบเดิมแบบเดียวกับ start_raid_chapter_run
create or replace function public.start_raid_arena_run(
  p_pet_id uuid,
  p_raid_type_id uuid,
  p_mode text,
  p_keys text[] default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_band text;
  v_keys text[];
  v_existing uuid;
  v_run uuid;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'เข้าสู่ระบบก่อน';
  end if;
  if p_mode is null or p_mode not in ('auto', 'manual') then
    raise exception 'Invalid chapter mode';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 9210));

  select id into v_existing from public.raid_runs
    where user_id = v_user and status = 'in_progress' limit 1;
  if v_existing is not null then
    return public.start_raid_card_run(p_pet_id, p_raid_type_id);
  end if;

  select grade_band into v_band from public.profiles where id = v_user;
  if v_band is null or v_band not in ('primary', 'junior', 'senior') then
    raise exception 'เลือกช่วงชั้นก่อนท้าทาย';
  end if;

  if p_mode = 'auto' and coalesce(cardinality(p_keys), 0) = 0 then
    v_keys := public._raid_auto_chapters(v_user, v_band);
  else
    v_keys := array(select distinct k from unnest(p_keys) as k where k is not null);
  end if;

  if coalesce(cardinality(v_keys), 0) not between 1 and 3 then
    raise exception 'เลือกบท 1–3 บท ยังไม่ใช้กุญแจ';
  end if;
  if exists (
    select 1 from unnest(v_keys) as k
    where k not in (select p.chapter_key from public._raid_chapter_pool(v_band) p)
  ) then
    raise exception 'บทที่เลือกมีโจทย์ไม่พอ ลองเลือกบทอื่น ยังไม่ใช้กุญแจ';
  end if;

  v_run := public.start_raid_card_run(p_pet_id, p_raid_type_id);

  update public.raid_card_battles
    set requested_ruleset = 4, chapter_mode = p_mode, chapter_keys = v_keys
    where run_id = v_run and state is null;

  return v_run;
end;
$$;

-- 6) กดท่าแล้วสุ่มโจทย์ -------------------------------------------------------------
-- เรียกจาก server action ด้วย service_role เท่านั้น (แบบเดียวกับ select_raid_chapter_offer)
-- มือท่า 3 ใบคำนวณด้วย moveHand() ฝั่ง TS · ที่นี่ตรวจแค่ชื่อท่า 6 ตัวของ v4
-- ลำดับสุ่ม: บทที่เลือกก่อน → บทที่ถูกใช้น้อยสุดในรอบ → สุ่ม · ไม่ซ้ำข้อในรอบ
-- บทที่เลือกหมด → ขยายไปทุกบทใน band · ทั้ง band หมด → raise 'RAID_NO_QUESTIONS'
--   (server action จับแล้วเรียก finish_exhausted_raid_chapters เดิม)
-- chapter_keys ว่าง (รอบ v4 เดิม/ค้าง) = สุ่มจากทั้ง band
create or replace function public.pick_raid_move(
  p_run_id uuid,
  p_user_id uuid,
  p_revision integer,
  p_card_id text
)
returns void
language plpgsql
set search_path to ''
as $$
declare
  v_b public.raid_card_battles;
  v_band text;
  v_q public.questions;
begin
  perform 1 from public.raid_runs
    where id = p_run_id and user_id = p_user_id and status = 'in_progress'
    for update;
  if not found then raise exception 'ไม่พบรอบ'; end if;

  select * into v_b from public.raid_card_battles
    where run_id = p_run_id and user_id = p_user_id
    for update;
  if not found then raise exception 'ไม่พบสนาม'; end if;
  if v_b.revision is distinct from p_revision or v_b.finished_at is not null then return; end if;
  if v_b.state->>'version' is distinct from '4' then raise exception 'Invalid ruleset'; end if;
  -- รีเฟรช/กดซ้ำ: มีโจทย์ของ revision นี้แล้ว ไม่สุ่มใหม่
  if exists (select 1 from public.raid_card_questions where run_id = p_run_id and revision = p_revision) then
    return;
  end if;
  if p_card_id is null or p_card_id not in ('strike', 'mend', 'counter', 'pierce', 'interrupt', 'focus') then
    raise exception 'Invalid move';
  end if;

  select grade_band into v_band from public.profiles where id = p_user_id;
  if v_band is null or v_band not in ('primary', 'junior', 'senior') then
    raise exception 'เลือกช่วงชั้นก่อนท้าทาย';
  end if;

  with eligible as materialized (
    select
      qu.id,
      jsonb_build_array(
        coalesce(qu.branch, qu.subject),
        coalesce(nullif(btrim(qu.chapter), ''), nullif(btrim(qu.category), ''))
      )::text as k
    from public.questions qu
    where qu.status = 'active'
      and qu.grade_band = v_band
      and coalesce(nullif(btrim(qu.chapter), ''), nullif(btrim(qu.category), '')) is not null
      and case when jsonb_typeof(qu.choices) = 'array'
        then jsonb_array_length(qu.choices) >= 2
          and qu.correct_index between 0 and jsonb_array_length(qu.choices) - 1
        else false end
      and not exists (
        select 1 from public.raid_card_questions used
        where used.run_id = p_run_id and used.question_id = qu.id
      )
  ), usage as (
    select
      jsonb_build_array(
        coalesce(qu.branch, qu.subject),
        coalesce(nullif(btrim(qu.chapter), ''), nullif(btrim(qu.category), ''))
      )::text as k,
      count(*) as n
    from public.raid_card_questions used
    join public.questions qu on qu.id = used.question_id
    where used.run_id = p_run_id
    group by 1
  ), pick as (
    select e.id
    from eligible e
    left join usage u on u.k = e.k
    order by
      (v_b.chapter_keys is null or e.k = any (v_b.chapter_keys)) desc,
      coalesce(u.n, 0),
      random()
    limit 1
  )
  select qu.* into v_q from public.questions qu join pick on pick.id = qu.id;

  if v_q.id is null then
    raise exception 'RAID_NO_QUESTIONS';
  end if;

  -- รูปแบบ question jsonb เหมือน draw_raid_chapter_hand (subject = branch/subject, category = ชื่อบท)
  insert into public.raid_card_questions
    (run_id, revision, card_id, question_id, question, correct_index, explanation)
  values (
    p_run_id, p_revision, p_card_id, v_q.id,
    jsonb_build_object(
      'text', v_q.question_text,
      'choices', v_q.choices,
      'imageUrl', v_q.image_url,
      'subject', coalesce(v_q.branch, v_q.subject),
      'category', coalesce(nullif(btrim(v_q.chapter), ''), nullif(btrim(v_q.category), ''))
    ),
    v_q.correct_index,
    v_q.explanation
  );
end;
$$;

-- 7) สิทธิ์ ---------------------------------------------------------------------
-- Supabase ให้ execute กับ anon/authenticated อัตโนมัติ ต้อง revoke ให้ชัด
revoke all on function public._raid_chapter_pool(text) from public, anon, authenticated;
revoke all on function public._raid_auto_chapters(uuid, text) from public, anon, authenticated;

revoke all on function public.list_raid_chapters() from public, anon;
grant execute on function public.list_raid_chapters() to authenticated, service_role;

revoke all on function public.start_raid_arena_run(uuid, uuid, text, text[]) from public, anon;
grant execute on function public.start_raid_arena_run(uuid, uuid, text, text[]) to authenticated, service_role;

revoke all on function public.pick_raid_move(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.pick_raid_move(uuid, uuid, integer, text) to service_role;
