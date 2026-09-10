-- Learning is required for every card, including strike/guard. No client reads answer keys.
create table public.raid_card_questions (
  run_id uuid not null references public.raid_card_battles(run_id) on delete cascade,
  revision integer not null, card_id text not null,
  question_id bigint not null references public.questions(id),
  question jsonb not null, correct_index integer not null, explanation text,
  answer_index integer, answered_at timestamptz,
  primary key(run_id,revision)
);
alter table public.raid_card_questions enable row level security;
revoke all on public.raid_card_questions from public,anon,authenticated;
grant all on public.raid_card_questions to service_role;

create function public.prepare_raid_card_question(p_run_id uuid,p_user_id uuid,p_revision integer,p_card_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; r public.raid_runs; q public.questions; band text; weak text; cost integer;
begin
  select * into r from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบรอบ'; end if;
  select * into b from public.raid_card_battles where run_id=p_run_id for update;
  if b.revision<>p_revision or b.finished_at is not null then return; end if;
  if exists(select 1 from public.raid_card_questions where run_id=p_run_id and revision=p_revision) then return; end if;
  if p_card_id not in ('strike','guard','counter','dodge','interrupt','pierce','mend','focus','burst') then raise exception 'Invalid card'; end if;
  if p_card_id not in ('strike','guard') and not (b.state->'hand' ? p_card_id) then raise exception 'Card not in hand'; end if;
  cost:=case p_card_id when 'counter' then 1 when 'dodge' then 1 when 'pierce' then 1 when 'interrupt' then 2 when 'mend' then 2 when 'burst' then 3 else 0 end;
  if cost>(b.state->>'energy')::int then raise exception 'Not enough energy'; end if;
  select coalesce(grade_band,'junior') into band from public.profiles where id=p_user_id;
  band:=coalesce(band,'junior');
  -- Revisit a recently missed category with a different question, then the established weak-category rule.
  select qu.category into weak from public.quiz_attempts a join public.questions qu on qu.id=a.question_id
    where a.user_id=p_user_id and a.source='raid_boss' and not a.is_correct and qu.grade_band=band
    order by a.created_at desc limit 1;
  if weak is null then
    select qu.category into weak from public.quiz_attempts a join public.questions qu on qu.id=a.question_id
      where a.user_id=p_user_id and qu.grade_band=band and a.source is null
      group by qu.category having count(*)>=10 order by avg(a.is_correct::int) limit 1;
  end if;
  select qu.* into q from public.questions qu where qu.status='active' and qu.grade_band=band
    and jsonb_typeof(qu.choices)='array' and jsonb_array_length(qu.choices)>=2
    and qu.correct_index between 0 and jsonb_array_length(qu.choices)-1
    and not exists(select 1 from public.raid_card_questions used where used.run_id=p_run_id and used.question_id=qu.id)
    order by (qu.category is not distinct from weak) desc,
      exists(select 1 from public.quiz_attempts a where a.user_id=p_user_id and a.question_id=qu.id and not a.is_correct) asc,
      random() limit 1;
  if q.id is null then raise exception 'ยังไม่มีโจทย์ใหม่ในระดับชั้นนี้ ลองใหม่เมื่อมีโจทย์เพิ่ม'; end if;
  insert into public.raid_card_questions(run_id,revision,card_id,question_id,question,correct_index,explanation)
    values(p_run_id,p_revision,p_card_id,q.id,jsonb_build_object('text',q.question_text,'choices',q.choices,'imageUrl',q.image_url,'subject',q.subject,'category',q.category),q.correct_index,q.explanation);
end; $$;
revoke all on function public.prepare_raid_card_question(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.prepare_raid_card_question(uuid,uuid,integer,text) to service_role;

-- Keep the existing CAS implementation private to the trusted service. Public entry now initializes only.
alter function public.commit_raid_card_turn(uuid,uuid,integer,jsonb) rename to commit_raid_card_state;
create function public.commit_raid_card_turn(p_run_id uuid,p_user_id uuid,p_revision integer,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_revision<>0 then raise exception 'Answer a question before playing'; end if;
  return public.commit_raid_card_state(p_run_id,p_user_id,p_revision,p_state);
end; $$;
revoke all on function public.commit_raid_card_turn(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_raid_card_turn(uuid,uuid,integer,jsonb) to service_role;

create function public.answer_raid_card_question(p_run_id uuid,p_user_id uuid,p_revision integer,p_answer integer,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; r public.raid_runs; q public.raid_card_questions; correct boolean; result jsonb; total_pct numeric; required_pct numeric; correct_count integer;
begin
  select * into r from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบรอบ'; end if;
  select * into b from public.raid_card_battles where run_id=p_run_id for update;
  if b.revision<>p_revision or b.finished_at is not null then return jsonb_build_object('revision',b.revision,'state',b.state); end if;
  select * into q from public.raid_card_questions where run_id=p_run_id and revision=p_revision for update;
  if not found or q.answered_at is not null then raise exception 'ไม่มีคำถามที่รอตอบ'; end if;
  if p_answer is null or p_answer not between 0 and jsonb_array_length(q.question->'choices')-1 then raise exception 'Invalid answer'; end if;
  correct:=p_answer=q.correct_index;
  if (p_state->'log'->-1->>'answerCorrect')::boolean is distinct from correct
    or (p_state->'log'->-1->>'card') is distinct from q.card_id then raise exception 'Question resolution mismatch'; end if;
  select sum(value::numeric)/5 into total_pct from jsonb_each_text(r.stat_snapshot);
  select boss_threshold_pct into required_pct from public.raid_types where id=r.raid_type_id;
  select count(*) into correct_count from public.raid_card_questions where run_id=p_run_id and answer_index=correct_index;
  if p_state->>'outcome'='win' and (total_pct<required_pct or (correct_count+correct::int)::numeric/jsonb_array_length(p_state->'log')<0.6) then raise exception 'Win requirements not met'; end if;
  result:=public.commit_raid_card_state(p_run_id,p_user_id,p_revision,p_state);
  update public.raid_card_questions set answer_index=p_answer,answered_at=now() where run_id=p_run_id and revision=p_revision;
  insert into public.quiz_attempts(user_id,pet_id,question_id,is_correct,source,raid_run_id)
    values(p_user_id,r.pet_id,q.question_id,correct,'raid_boss',p_run_id);
  return result;
end; $$;
revoke all on function public.answer_raid_card_question(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.answer_raid_card_question(uuid,uuid,integer,integer,jsonb) to service_role;

-- Validate the question pool before charging a key. Retry/resume still returns the active run.
alter function public.start_raid_card_run(uuid,uuid) rename to start_raid_card_run_unchecked;
revoke all on function public.start_raid_card_run_unchecked(uuid,uuid) from public,anon,authenticated;
create function public.start_raid_card_run(p_pet_id uuid,p_raid_type_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); band text; active_id uuid;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'เข้าสู่ระบบก่อน'; end if;
  select id into active_id from public.raid_runs where user_id=v_user and status='in_progress' and phase in ('card_battle','card_reward') limit 1;
  if active_id is not null then return active_id; end if;
  select grade_band into band from public.profiles where id=v_user;
  if band is null then raise exception 'เลือกช่วงชั้นในโปรไฟล์ก่อนท้าทาย'; end if;
  if (select count(*) from public.questions where status='active' and grade_band=band and jsonb_typeof(choices)='array' and jsonb_array_length(choices)>=2 and correct_index between 0 and jsonb_array_length(choices)-1)<20 then
    raise exception 'โจทย์ระดับชั้นนี้ยังไม่พอสำหรับรอบท้าทาย ยังไม่ใช้กุญแจ';
  end if;
  return public.start_raid_card_run_unchecked(p_pet_id,p_raid_type_id);
end; $$;
revoke all on function public.start_raid_card_run(uuid,uuid) from public,anon;
grant execute on function public.start_raid_card_run(uuid,uuid) to authenticated;
