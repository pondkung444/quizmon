-- New ruleset is opt-in at run creation. Existing null states remain version 3.
alter table public.raid_card_battles add column requested_ruleset integer not null default 3 check (requested_ruleset in (3,4));
alter table public.raid_card_battles drop constraint raid_card_battles_state_check;
alter table public.raid_card_battles add constraint raid_card_battles_state_check check (state is null or state->>'version' in ('2','3','4'));

create table public.raid_chapter_offers (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.raid_card_battles(run_id) on delete cascade,
 revision integer not null,
 slot integer not null check(slot between 1 and 4),
 chapter_key text not null,
 chapter text not null,
 subject text not null,
 difficulty integer not null,
 card_id text not null check(card_id in ('strike','mend','counter','pierce','interrupt','focus')),
 question_id bigint not null references public.questions(id),
 question jsonb not null,
 correct_index integer not null,
 explanation text,
 selected_at timestamptz,
 unique(run_id,revision,slot),
 unique(run_id,revision,chapter_key)
);
create unique index raid_chapter_one_selection on public.raid_chapter_offers(run_id,revision) where selected_at is not null;
alter table public.raid_chapter_offers enable row level security;
revoke all on public.raid_chapter_offers from public,anon,authenticated;
grant all on public.raid_chapter_offers to service_role;

create function public.start_raid_chapter_run(p_pet_id uuid,p_raid_type_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing uuid; result uuid; band text; available integer; required_questions integer;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'เข้าสู่ระบบก่อน'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,24));
 select id into existing from public.raid_runs where user_id=uid and status='in_progress' limit 1;
 if existing is not null then return public.start_raid_card_run(p_pet_id,p_raid_type_id); end if;
 select grade_band into band from public.profiles where id=uid;
 select case slug when 'ridge_mist' then 5 when 'ridge_gale' then 6 else 8 end into required_questions from public.raid_types where id=p_raid_type_id;
 if band is null or band not in ('junior','senior') then raise exception 'เลือกช่วงชั้นก่อนท้าทาย'; end if;
 select count(*) into available from public.questions q where q.status='active' and q.grade_band=band
 and coalesce(nullif(btrim(q.chapter),''),nullif(btrim(q.category),'')) is not null
 and case when jsonb_typeof(q.choices)='array' then jsonb_array_length(q.choices)>=2 and q.correct_index between 0 and jsonb_array_length(q.choices)-1 else false end;
 if available<coalesce(required_questions,8) then raise exception 'โจทย์พร้อมใช้ยังไม่พอสำหรับรอบใหม่ ไม่ได้ใช้กุญแจ'; end if;
 result:=public.start_raid_card_run(p_pet_id,p_raid_type_id);
 update public.raid_card_battles set requested_ruleset=4 where run_id=result and state is null;
 return result;
end; $$;
revoke all on function public.start_raid_chapter_run(uuid,uuid) from public,anon;
grant execute on function public.start_raid_chapter_run(uuid,uuid) to authenticated;

create or replace function public.commit_raid_card_state(p_run_id uuid, p_user_id uuid, p_revision integer, p_state jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.raid_card_battles;
  v_run public.raid_runs;
  v_turn integer;
  v_hp integer;
  v_boss_hp integer;
  v_boss_max integer;
  v_progress integer;
  v_score integer;
  v_outcome text;
  v_limit integer;
  v_hand_size integer;
  v_version text;
begin
  select * into v_run from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบรอบท้าทาย'; end if;
  select * into v_b from public.raid_card_battles where run_id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบสนาม'; end if;
  if p_revision is null then raise exception 'Missing revision'; end if;
  if v_b.revision <> p_revision or v_b.finished_at is not null then
    return jsonb_build_object('revision',v_b.revision,'state',v_b.state);
  end if;
  if v_run.status <> 'in_progress' or v_run.phase <> 'card_battle' then raise exception 'รอบนี้จบแล้ว'; end if;
  if p_state is null or (p_state->>'version') is null or p_state->>'version' not in ('2','3','4') then raise exception 'Invalid ruleset'; end if;
  v_version := p_state->>'version';
  if v_b.state is not null and v_b.state->>'version' is distinct from v_version then raise exception 'Ruleset mismatch'; end if;
  v_limit := case when v_version='2' then 20 when p_state->>'bossId'='ridge_mist' then 5 when p_state->>'bossId'='ridge_gale' then 6 else 8 end;
  v_hand_size := case when v_version='4' then 0 when v_version='3' then 2 else 3 end;
  if p_state->'stats' is distinct from v_run.stat_snapshot then raise exception 'Snapshot mismatch'; end if;
  if not exists(select 1 from public.raid_types where id=v_run.raid_type_id and slug=p_state->>'bossId') then
    raise exception 'Boss mismatch';
  end if;
  v_boss_max := case p_state->>'bossId' when 'ridge_mist' then 200 when 'ridge_gale' then 270 when 'ridge_storm' then 430 else null end;
  v_turn := (p_state->>'turn')::integer;
  v_hp := (p_state->>'hp')::integer;
  v_boss_hp := (p_state->>'bossHp')::integer;
  v_outcome := p_state->>'outcome';
  if not (p_state ?& array['hpMax','hand','energy','log','outcome'])
    or jsonb_typeof(p_state->'hand') is distinct from 'array'
    or jsonb_typeof(p_state->'log') is distinct from 'array'
    or jsonb_typeof(p_state->'hpMax') is distinct from 'number'
    or jsonb_typeof(p_state->'energy') is distinct from 'number' then raise exception 'Incomplete combat state'; end if;
  if v_turn is null or v_turn not between 1 and v_limit or v_hp is null or v_hp < 0
    or v_hp > (p_state->>'hpMax')::integer or v_boss_hp is null or v_boss_hp not between 0 and v_boss_max
    or (p_state->>'hpMax')::integer <> 80 + round((v_run.stat_snapshot->>'hp')::numeric * 1.5)::integer
    or jsonb_array_length(p_state->'hand') <> v_hand_size or (p_state->>'energy')::integer not between 0 and 5 then
    raise exception 'Invalid combat state';
  end if;
  if v_version='3' and (p_state->'hand' is distinct from '["strike","mend"]'::jsonb or (p_state->>'energy')::int<>0) then raise exception 'Invalid quick cards'; end if;
  if v_b.state is null then
    if v_turn <> 1 or v_outcome is not null or jsonb_array_length(p_state->'log') <> 0
      or v_hp <> (p_state->>'hpMax')::integer or v_boss_hp <> v_boss_max then raise exception 'Invalid initial state'; end if;
  else
    if jsonb_array_length(p_state->'log') <> jsonb_array_length(v_b.state->'log') + 1
      or v_turn <> (v_b.state->>'turn')::integer + (case when v_outcome is null then 1 else 0 end) then
      raise exception 'Invalid turn sequence';
    end if;
  end if;
  if v_outcome is not null and v_outcome not in ('win','defeat') then raise exception 'Invalid outcome'; end if;
  if (v_outcome = 'win' and v_boss_hp <> 0)
    or (v_outcome = 'defeat' and v_boss_hp > 0 and v_hp > 0 and v_turn < v_limit)
    or (v_outcome is null and (v_hp = 0 or v_boss_hp = 0))
    or (v_version in ('3','4') and v_outcome='defeat' and v_boss_hp=0)
    or (v_version in ('3','4') and jsonb_array_length(p_state->'log')>v_limit)
    or (v_version in ('3','4') and v_outcome is null and jsonb_array_length(p_state->'log')>=v_limit) then raise exception 'Invalid end condition'; end if;
  v_progress := round((1 - v_boss_hp::numeric / v_boss_max) * 100)::integer;
  if v_outcome is not null then
    v_score := case when v_outcome='win' then least(100,80+round(20*v_hp::numeric/(p_state->>'hpMax')::integer)::integer)
      else least(79,v_progress) end;
    -- Existing reward RPC consumes score and outcome; no quiz/stat gate and no EXP awarded.
    update public.raid_runs set phase='card_reward', outcome=case when v_outcome='win' then 'win' when p_state->>'defeatReason'='stats' then 'lose_stat' when p_state->>'defeatReason'='learning' then 'lose_quiz' else 'lose_battle' end,
      gauge_earned=v_score, gauge_max=100, fail_count=0 where id=p_run_id;
  end if;
  update public.raid_card_battles set state=p_state, revision=revision+1, progress=v_progress,
    finished_at=case when v_outcome is not null then now() else null end where run_id=p_run_id
    returning * into v_b;
  return jsonb_build_object('revision',v_b.revision,'state',v_b.state);
end;
$$;
revoke all on function public.commit_raid_card_state(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.commit_raid_card_state(uuid,uuid,integer,jsonb) to service_role;


-- The old selection route must not be used to bypass offers.
create or replace function public.prepare_raid_card_question(p_run_id uuid,p_user_id uuid,p_revision integer,p_card_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; r public.raid_runs; q public.questions; band text; cost integer;
begin
  select * into r from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบรอบ'; end if;
  select * into b from public.raid_card_battles where run_id=p_run_id for update;
  if b.revision<>p_revision or b.finished_at is not null then return; end if;
  if exists(select 1 from public.raid_card_questions where run_id=p_run_id and revision=p_revision) then return; end if;
  if b.state->>'version'='4' then raise exception 'Select a chapter offer'; end if;
  if b.state->>'version'='3' then
    if p_card_id is null or p_card_id not in ('strike','mend') or not (b.state->'hand' ? p_card_id) then raise exception 'Card not in hand'; end if;
  else
  if p_card_id not in ('strike','guard','counter','dodge','interrupt','pierce','mend','focus','burst') then raise exception 'Invalid card'; end if;
  if p_card_id not in ('strike','guard') and not (b.state->'hand' ? p_card_id) then raise exception 'Card not in hand'; end if;
  cost:=case p_card_id when 'counter' then 1 when 'dodge' then 1 when 'pierce' then 1 when 'interrupt' then 2 when 'mend' then 2 when 'burst' then 3 else 0 end;
  if cost>(b.state->>'energy')::int then raise exception 'Not enough energy'; end if;
  end if;
  select grade_band into band from public.profiles where id=p_user_id;
  if band is null or band not in ('junior','senior') then
    raise exception 'เลือกช่วงชั้นในโปรไฟล์ก่อนท้าทาย';
  end if;

  -- Senior physics is stored under subject=math; chemistry/biology under science.
  -- Balance by branch for senior, subject for junior, then category within that group.
  -- Rank groups before picking a question so large chapters do not dominate.
  with used as materialized (
    select qu.id,
      case when band='senior' then coalesce(qu.branch,qu.subject) else qu.subject end as learning_subject,
      qu.category
    from public.raid_card_questions picked
    join public.questions qu on qu.id=picked.question_id
    where picked.run_id=p_run_id and qu.grade_band=band
  ), eligible as materialized (
    select qu.id,
      case when band='senior' then coalesce(qu.branch,qu.subject) else qu.subject end as learning_subject,
      qu.category
    from public.questions qu
    where qu.status='active' and qu.grade_band=band
      and case when jsonb_typeof(qu.choices)='array'
        then jsonb_array_length(qu.choices)>=2 and qu.correct_index between 0 and jsonb_array_length(qu.choices)-1
        else false end
      and not exists(select 1 from public.raid_card_questions picked where picked.run_id=p_run_id and picked.question_id=qu.id)
  ), subject_usage as (
    select learning_subject,count(*) as drawn from used group by learning_subject
  ), category_usage as (
    select learning_subject,category,count(*) as drawn from used group by learning_subject,category
  ), chosen_subject as (
    select available.learning_subject
    from (select distinct learning_subject from eligible) available
    left join subject_usage counts on counts.learning_subject is not distinct from available.learning_subject
    order by coalesce(counts.drawn,0),random() limit 1
  ), chosen_category as (
    select available.learning_subject,available.category
    from (select distinct learning_subject,category from eligible) available
    join chosen_subject chosen on chosen.learning_subject is not distinct from available.learning_subject
    left join category_usage counts on counts.learning_subject is not distinct from available.learning_subject
      and counts.category is not distinct from available.category
    order by coalesce(counts.drawn,0),random() limit 1
  ), chosen_question as (
    select candidate.id from eligible candidate
    join chosen_category chosen on chosen.learning_subject is not distinct from candidate.learning_subject
      and chosen.category is not distinct from candidate.category
    order by random() limit 1
  )
  select qu.* into q from public.questions qu join chosen_question chosen on chosen.id=qu.id;

  if q.id is null then raise exception 'ยังไม่มีโจทย์ใหม่ในระดับชั้นนี้ ลองใหม่เมื่อมีโจทย์เพิ่ม'; end if;
  insert into public.raid_card_questions(run_id,revision,card_id,question_id,question,correct_index,explanation)
    values(p_run_id,p_revision,p_card_id,q.id,jsonb_build_object('text',q.question_text,'choices',q.choices,'imageUrl',q.image_url,'subject',q.subject,'category',q.category),q.correct_index,q.explanation);
end; $$;
revoke all on function public.prepare_raid_card_question(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.prepare_raid_card_question(uuid,uuid,integer,text) to service_role;




create function public.draw_raid_chapter_hand(p_run_id uuid,p_user_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; band text; q record; n integer:=0; skill text; skill_pool text[]; used_skills text[]:='{}'; limit_questions integer;
begin
 perform 1 from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
 if not found then raise exception 'ไม่พบรอบ'; end if;
 select * into b from public.raid_card_battles where run_id=p_run_id and user_id=p_user_id for update;
 if not found then raise exception 'ไม่พบสนาม'; end if;
 if b.revision is distinct from p_revision or b.finished_at is not null then return '[]'::jsonb; end if;
 if b.state->>'version' is distinct from '4' then raise exception 'Invalid ruleset'; end if;
 if not exists(select 1 from public.raid_chapter_offers where run_id=p_run_id and revision=p_revision) then
  select grade_band into band from public.profiles where id=p_user_id;
  limit_questions:=case b.state->>'bossId' when 'ridge_mist' then 5 when 'ridge_gale' then 6 else 8 end;
  -- Two universal options plus at most one context-specific option.
  skill_pool:=array['counter'];
  if (b.state->>'turn')::int<limit_questions then skill_pool:=array_append(skill_pool,'focus'); end if;
  if b.state->>'intent'='brace' then skill_pool:=array_append(skill_pool,'pierce'); end if;
  if b.state->>'intent' in ('charge','thunder') then skill_pool:=array_append(skill_pool,'interrupt'); end if;
  for q in
   with eligible as (
    select qu.*, coalesce(nullif(btrim(qu.chapter),''),nullif(btrim(qu.category),'')) as label,
     coalesce(qu.branch,qu.subject) as learning_subject
    from public.questions qu where qu.status='active' and qu.grade_band=band
    and coalesce(nullif(btrim(qu.chapter),''),nullif(btrim(qu.category),'')) is not null
    and case when jsonb_typeof(qu.choices)='array' then jsonb_array_length(qu.choices)>=2 and qu.correct_index between 0 and jsonb_array_length(qu.choices)-1 else false end
    and not exists(select 1 from public.raid_card_questions used where used.run_id=p_run_id and used.question_id=qu.id)
   ), chapters as (
    select distinct learning_subject,label from eligible
   ), picked as (
    select * from chapters order by random() limit 4
   )
   select chosen.* from picked p cross join lateral (
    select e.* from eligible e where e.learning_subject=p.learning_subject and e.label=p.label order by random() limit 1
   ) chosen
  loop
   n:=n+1;
   if n=1 then skill:='strike';
   elsif n=2 then skill:='mend';
   else
    select s into skill from unnest(skill_pool) s where not(s=any(used_skills)) order by random() limit 1;
    skill:=coalesce(skill,'pierce');
   end if;
   used_skills:=array_append(used_skills,skill);
   insert into public.raid_chapter_offers(run_id,revision,slot,chapter_key,chapter,subject,difficulty,card_id,question_id,question,correct_index,explanation)
   values(p_run_id,p_revision,n,jsonb_build_array(q.learning_subject,q.label)::text,q.label,q.learning_subject,coalesce(q.difficulty,1),skill,q.id,
    jsonb_build_object('text',q.question_text,'choices',q.choices,'imageUrl',q.image_url,'subject',q.learning_subject,'category',q.label),q.correct_index,q.explanation);
  end loop;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'chapter',chapter,'subject',subject,'difficulty',difficulty,'cardId',card_id) order by slot)
 from public.raid_chapter_offers where run_id=p_run_id and revision=p_revision),'[]'::jsonb);
end; $$;
revoke all on function public.draw_raid_chapter_hand(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.draw_raid_chapter_hand(uuid,uuid,integer) to service_role;

create function public.select_raid_chapter_offer(p_run_id uuid,p_user_id uuid,p_revision integer,p_offer_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; offer public.raid_chapter_offers;
begin
 perform 1 from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
 if not found then raise exception 'ไม่พบรอบ'; end if;
 select * into b from public.raid_card_battles where run_id=p_run_id and user_id=p_user_id for update;
 if not found then raise exception 'ไม่พบสนาม'; end if;
 if b.revision is distinct from p_revision or b.finished_at is not null then return; end if;
 if b.state->>'version' is distinct from '4' then raise exception 'Invalid ruleset'; end if;
 if exists(select 1 from public.raid_card_questions where run_id=p_run_id and revision=p_revision) then return; end if;
 select * into offer from public.raid_chapter_offers where id=p_offer_id and run_id=p_run_id and revision=p_revision;
 if not found then raise exception 'ไม่มีการ์ดนี้ในมือ'; end if;
 insert into public.raid_card_questions(run_id,revision,card_id,question_id,question,correct_index,explanation)
 values(p_run_id,p_revision,offer.card_id,offer.question_id,offer.question,offer.correct_index,offer.explanation);
 update public.raid_chapter_offers set selected_at=now() where id=offer.id;
end; $$;
revoke all on function public.select_raid_chapter_offer(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.select_raid_chapter_offer(uuid,uuid,integer,uuid) to service_role;

-- Only a truly exhausted, unanswered hand may end early; score is computed here.
create function public.finish_exhausted_raid_chapters(p_run_id uuid,p_user_id uuid,p_revision integer)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; offers jsonb;
begin
 offers:=public.draw_raid_chapter_hand(p_run_id,p_user_id,p_revision);
 select * into b from public.raid_card_battles where run_id=p_run_id and user_id=p_user_id for update;
 if b.revision is distinct from p_revision or b.finished_at is not null then return; end if;
 if jsonb_array_length(offers)>0 or exists(select 1 from public.raid_card_questions where run_id=p_run_id and revision=p_revision) then raise exception 'ยังมีโจทย์พร้อมเล่น'; end if;
 update public.raid_card_battles set state=state || '{"outcome":"defeat","defeatReason":"content"}'::jsonb,revision=revision+1,finished_at=now() where run_id=p_run_id;
 update public.raid_runs set phase='card_reward',outcome='lose_battle',gauge_earned=least(79,b.progress),gauge_max=100,fail_count=0 where id=p_run_id;
end; $$;
revoke all on function public.finish_exhausted_raid_chapters(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.finish_exhausted_raid_chapters(uuid,uuid,integer) to service_role;
