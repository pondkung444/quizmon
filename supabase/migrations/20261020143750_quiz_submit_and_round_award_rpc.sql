-- Quiz perf + EXP integrity (2026-10-20)
--
-- 1) submit_quiz_answer(): รวมงานต่อ 1 คำตอบ (อ่านเฉลย + active pet + accuracy 20 ข้อล่าสุด,
--    insert quiz_attempts, อัปเดตสถิติ pets) เป็น round-trip เดียว แทน 3 read + 2 write เดิมใน
--    submitAnswer() ที่ทำให้คิวคำตอบสะสมช้าตอนเน็ตโรงเรียนช้า — สูตร EXP ต้องตรงกับ src/lib/exp.ts
--    (BASE 10, accuracy/combo multiplier, floor) และ MILESTONE_INTERVAL = 3 ใน quiz/actions.ts
-- 2) award_quiz_round_exp(): EXP ท้ายรอบคิดจากผลรวม quiz_attempts.exp_earned ของรอบนั้นเอง
--    ไม่รับตัวเลขจาก client อีก (เดิม finishQuizRound รับ roundExpEarned ปลอมได้) และ idempotent ต่อ
--    round_id ผ่าน quiz_round_awards — เรียกซ้ำ (retry/timeout) ไม่บวก EXP ซ้อน
--
-- ทั้งสองเป็น security definer + service_role เท่านั้น (เรียกผ่าน admin client หลังตรวจ user แล้ว)
-- เหมือน award_quiz_exp (20260925153832)

alter table public.quiz_attempts
  add column if not exists round_id uuid,
  add column if not exists exp_earned smallint;

create index if not exists idx_quiz_attempts_round_id
  on public.quiz_attempts (round_id) where round_id is not null;

create table if not exists public.quiz_round_awards (
  round_id   uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  pet_id     uuid not null,
  amount     integer not null default 0,
  added      integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.quiz_round_awards enable row level security;
-- ไม่มี policy: อ่าน/เขียนผ่าน RPC ด้านล่างเท่านั้น
revoke all on public.quiz_round_awards from anon, authenticated;

create or replace function public.submit_quiz_answer(
  p_user_id      uuid,
  p_question_id  bigint,
  p_choice_index integer,
  p_combo_before integer,
  p_mission_id   uuid,
  p_source       text,
  p_round_id     uuid
)
returns table (
  is_correct boolean,
  exp_earned integer,
  subject    text,
  category   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correct_index integer;
  v_subject       text;
  v_category      text;
  v_pet_id        uuid;
  v_recent_total  integer;
  v_recent_right  integer;
  v_acc           numeric;
  v_combo         integer;
  v_combo_mult    numeric;
  v_is_correct    boolean;
  v_exp           integer;
begin
  if p_source is not null and p_source <> 'topic_select' then
    raise exception 'submit_quiz_answer: invalid source %', p_source;
  end if;

  select q.correct_index, q.subject, q.category
    into v_correct_index, v_subject, v_category
    from public.questions q
   where q.id = p_question_id;
  if not found then
    raise exception 'submit_quiz_answer: question % not found', p_question_id;
  end if;

  select p.id into v_pet_id
    from public.pets p
   where p.user_id = p_user_id
     and p.is_active
   limit 1;
  if v_pet_id is null then
    raise exception 'submit_quiz_answer: no active pet for user %', p_user_id;
  end if;

  -- accuracy multiplier: 20 ข้อล่าสุดของ user (ก่อน insert ข้อนี้) — ตรงกับ getAccuracyMultiplier
  select count(*), count(*) filter (where r.is_correct)
    into v_recent_total, v_recent_right
    from (
      select a.is_correct
        from public.quiz_attempts a
       where a.user_id = p_user_id
       order by a.created_at desc
       limit 20
    ) r;

  v_acc := case
    when v_recent_total < 20 then 1.0
    when v_recent_right::numeric / v_recent_total >= 0.9 then 1.5
    when v_recent_right::numeric / v_recent_total >= 0.7 then 1.2
    when v_recent_right::numeric / v_recent_total >= 0.5 then 1.0
    else 0.8
  end;

  v_is_correct := p_choice_index = v_correct_index;
  v_combo := case when v_is_correct then least(greatest(coalesce(p_combo_before, 0), 0), 10000) + 1 else 0 end;
  v_combo_mult := case
    when v_combo >= 10 then 1.5
    when v_combo >= 8 then 1.3
    when v_combo >= 3 then 1.1
    else 1.0
  end;
  v_exp := case when v_is_correct then floor(10 * v_acc * v_combo_mult)::integer else 0 end;

  insert into public.quiz_attempts
    (user_id, question_id, is_correct, pet_id, mission_id, source, choice_index, round_id, exp_earned)
  values
    (p_user_id, p_question_id, v_is_correct, v_pet_id, p_mission_id, p_source, p_choice_index, p_round_id, v_exp);

  -- เทียบเท่า apply_quiz_answer_pet_update (020) — atomic UPDATE เดียว
  update public.pets p
     set best_combo       = greatest(p.best_combo, v_combo::smallint),
         combo_milestones = p.combo_milestones + case when v_is_correct and v_combo % 3 = 0 then 1 else 0 end,
         math_correct     = p.math_correct + case when v_is_correct and v_subject = 'math' then 1 else 0 end,
         science_correct  = p.science_correct + case when v_is_correct and v_subject = 'science' then 1 else 0 end
   where p.id = v_pet_id;

  is_correct := v_is_correct;
  exp_earned := v_exp;
  subject    := v_subject;
  category   := v_category;
  return next;
end;
$$;

revoke all on function public.submit_quiz_answer(uuid, bigint, integer, integer, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_quiz_answer(uuid, bigint, integer, integer, uuid, text, uuid)
  to service_role;

create or replace function public.award_quiz_round_exp(
  p_user_id  uuid,
  p_pet_id   uuid,
  p_round_id uuid
)
returns table (
  added           integer,
  total_exp       integer,
  today_exp       integer,
  daily_cap       integer,
  was_capped      boolean,
  already_awarded boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.quiz_round_awards%rowtype;
  v_amount   integer;
  v_award    record;
begin
  insert into public.quiz_round_awards (round_id, user_id, pet_id)
  values (p_round_id, p_user_id, p_pet_id)
  on conflict (round_id) do nothing;

  if not found then
    -- รอบนี้ให้ EXP ไปแล้ว (retry หลัง timeout) — คืนค่าเดิม ไม่บวกซ้ำ
    select * into v_existing from public.quiz_round_awards w where w.round_id = p_round_id;
    if v_existing.user_id <> p_user_id then
      raise exception 'award_quiz_round_exp: round % belongs to another user', p_round_id;
    end if;
    select p.exp, case when p.exp_today_date = (now() at time zone 'Asia/Bangkok')::date then p.exp_today else 0 end
      into total_exp, today_exp
      from public.pets p
     where p.id = v_existing.pet_id;
    added           := v_existing.added;
    daily_cap       := public.get_daily_exp_cap(p_user_id);
    was_capped      := v_existing.amount > v_existing.added;
    already_awarded := true;
    return next;
    return;
  end if;

  select least(1000, coalesce(sum(a.exp_earned), 0))::integer
    into v_amount
    from public.quiz_attempts a
   where a.round_id = p_round_id
     and a.user_id = p_user_id;

  select * into v_award from public.award_quiz_exp(p_user_id, p_pet_id, v_amount);

  update public.quiz_round_awards w
     set amount = v_amount,
         added  = v_award.added
   where w.round_id = p_round_id;

  added           := v_award.added;
  total_exp       := v_award.total_exp;
  today_exp       := v_award.today_exp;
  daily_cap       := v_award.daily_cap;
  was_capped      := v_award.was_capped;
  already_awarded := false;
  return next;
end;
$$;

revoke all on function public.award_quiz_round_exp(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_quiz_round_exp(uuid, uuid, uuid) to service_role;
