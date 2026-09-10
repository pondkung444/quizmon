-- Mix raid questions across the player's grade band, learning subjects and chapters.
-- Historical mistakes must not pin a raid to one category.
create or replace function public.prepare_raid_card_question(p_run_id uuid,p_user_id uuid,p_revision integer,p_card_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.raid_card_battles; r public.raid_runs; q public.questions; band text; cost integer;
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
