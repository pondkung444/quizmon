-- Item 2: meteor bonus damage — flat 15 -> percentage of boss_hp_max.
-- greatest(15, round(boss_hp_max * 0.035)) so it stays meaningful at any class
-- size/difficulty (boss_hp_max already scales ~linearly with participant count),
-- never weaker than the old flat value, and lands near combo_burst weight.
-- create or replace only; base = live body. Also writes the resolved bonus into
-- active_event so the TV spotlight can show the real number.
create or replace function public.submit_boss_raid_event_answer(p_participant_id uuid, p_answer text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_p public.boss_raid_participants;
  v_s public.boss_raid_sessions;
  v_ans text := btrim(coalesce(p_answer, ''));
  v_is_correct boolean;
  v_correct_index int;
  v_question_id bigint;
  v_trig_at timestamptz;
  v_attempt_id uuid;
  v_bonus_damage int;
  v_boss_hp int;
  v_status text;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  -- โบนัสฝนดาวตก = 3.5% ของ boss_hp_max, ขั้นต่ำ 15 (ไม่เคยอ่อนกว่าค่าคงที่เดิม)
  v_bonus_damage := greatest(15, round(coalesce(nullif(v_s.boss_hp_max, 0), v_s.boss_hp, 0) * 0.035)::int);

  if coalesce(v_s.active_event ->> 'type', '') <> 'meteor'
     or (v_s.active_event ->> 'expires_at')::timestamptz <= now() then
    return jsonb_build_object('event_active', false);
  end if;

  select max(triggered_at) into v_trig_at
    from public.boss_raid_event_log
    where session_id = v_p.session_id and event_type = 'meteor';
  v_trig_at := coalesce(v_trig_at,
                        (v_s.active_event ->> 'expires_at')::timestamptz - interval '15 seconds');

  insert into public.boss_raid_event_log (session_id, event_type, participant_id, triggered_at)
  values (v_p.session_id, 'meteor_attempt', p_participant_id, v_trig_at)
  on conflict do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    return jsonb_build_object('event_active', true, 'already_answered', true,
      'is_correct', null, 'won', false);
  end if;

  v_question_id := (v_s.active_event ->> 'question_id')::bigint;
  select correct_index into v_correct_index from public.questions where id = v_question_id;
  v_is_correct := (v_ans <> '' and v_ans = v_correct_index::text);

  if not v_is_correct then
    return jsonb_build_object('event_active', true, 'is_correct', false, 'won', false);
  end if;

  update public.boss_raid_sessions
    set active_event = active_event || jsonb_build_object(
          'winner_participant_id', p_participant_id::text,
          'bonus_damage', v_bonus_damage),
        boss_hp = greatest(0, coalesce(boss_hp, 0) - v_bonus_damage)
    where id = v_p.session_id
      and active_event ->> 'type' = 'meteor'
      and active_event ->> 'winner_participant_id' is null
      and (active_event ->> 'expires_at')::timestamptz > now()
    returning boss_hp, status, result into v_boss_hp, v_status, v_result;

  if not found then
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('event_active', true, 'is_correct', true, 'won', false, 'boss_hp', v_boss_hp);
  end if;

  update public.boss_raid_event_log
    set winner_participant_id = p_participant_id, bonus_damage = v_bonus_damage
    where session_id = v_p.session_id and event_type = 'meteor'
      and triggered_at = v_trig_at;

  if v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object('event_active', true, 'is_correct', true, 'won', true,
    'bonus_damage', v_bonus_damage, 'boss_hp', v_boss_hp,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$function$;
