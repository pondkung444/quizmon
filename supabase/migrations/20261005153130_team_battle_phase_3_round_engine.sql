-- Team Battle เฟส 3: เครื่องยนต์ยก (apply แล้วบน prod ผ่าน apply_migration)
-- version 20261005153130 · name team_battle_phase_3_round_engine
-- ไฟล์คู่ของ migration ใน schema_migrations; ฟังก์ชันใหม่ล้วน + แทนที่ tb_start (เพิ่มเริ่มยกแรก)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- ภายใน: ล็อกแถว battle (ไม่ตรวจสิทธิ์ — ผู้เรียกต้องตรวจเอง)
-- ----------------------------------------------------------------------------
create or replace function public._tb_lock_battle_any(p_battle_id uuid)
returns public.pvp_team_battles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id for update;
  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
  return v_b;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ภายใน: จั่วการ์ด 5 ใบให้ผู้บัญชาการ (ขอบเขตโจทย์ตาม config; ไม่ซ้ำกับโจทย์ที่ "เล่นแล้ว")
--   ถ้าโจทย์เหลือไม่พอ 5 ข้อ → เติมจากโจทย์ในขอบเขตที่เคยเล่นแล้ว (ซ้ำได้)
-- ----------------------------------------------------------------------------
create or replace function public._tb_draw_hand(
  p_battle_id uuid,
  p_round integer,
  p_team text,
  p_commander uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg  jsonb;
  v_used bigint[];
  v_n    int;
  v_m    int;
begin
  select config into v_cfg from public.pvp_team_battles where id = p_battle_id;

  select coalesce(array_agg(question_id), '{}'::bigint[]) into v_used
  from public.pvp_team_cards
  where battle_id = p_battle_id and played_at is not null;

  insert into public.pvp_team_cards
    (battle_id, round_no, team, drawn_for_user_id, chapter, subject, difficulty, question_id, effect_id)
  select p_battle_id, p_round, p_team, p_commander, q.chapter, q.subject,
         coalesce(q.difficulty, 1), q.id,
         case when random() < 0.40 then null
              else (array['reprisal','pierce','heal','high_stake','lifesteal','haste'])[1 + floor(random() * 6)::int]
         end
  from public.questions q
  where q.status = 'active'
    and q.subject = v_cfg ->> 'subject'
    and q.branch is not distinct from nullif(v_cfg ->> 'branch', '')
    and q.grade_band = v_cfg ->> 'grade_band'
    and q.chapter in (select jsonb_array_elements_text(v_cfg -> 'chapters'))
    and q.id <> all (v_used)
  order by random()
  limit 5;
  get diagnostics v_n = row_count;

  if v_n < 5 then
    insert into public.pvp_team_cards
      (battle_id, round_no, team, drawn_for_user_id, chapter, subject, difficulty, question_id, effect_id)
    select p_battle_id, p_round, p_team, p_commander, q.chapter, q.subject,
           coalesce(q.difficulty, 1), q.id,
           case when random() < 0.40 then null
                else (array['reprisal','pierce','heal','high_stake','lifesteal','haste'])[1 + floor(random() * 6)::int]
           end
    from public.questions q
    where q.status = 'active'
      and q.subject = v_cfg ->> 'subject'
      and q.branch is not distinct from nullif(v_cfg ->> 'branch', '')
      and q.grade_band = v_cfg ->> 'grade_band'
      and q.chapter in (select jsonb_array_elements_text(v_cfg -> 'chapters'))
      and q.id not in (
        select c.question_id from public.pvp_team_cards c
        where c.battle_id = p_battle_id and c.round_no = p_round and c.team = p_team
      )
    order by random()
    limit (5 - v_n);
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
  end if;

  return v_n;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ภายใน: จบเกม (ผลตัดสินตาม HP: มากกว่า = ชนะ เท่ากัน = เสมอ)
--   เฟส 6 จะเพิ่มการแจกรางวัลที่นี่ (ตอนนี้ยังไม่แจก)
-- ----------------------------------------------------------------------------
create or replace function public._tb_finish(p_battle_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_outcome text;
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id;
  if v_b.status <> 'active' then return; end if;

  v_outcome := case when coalesce(v_b.hp_a, 0) > coalesce(v_b.hp_b, 0) then 'a_win'
                    when coalesce(v_b.hp_b, 0) > coalesce(v_b.hp_a, 0) then 'b_win'
                    else 'draw' end;

  update public.pvp_team_battles
  set status = 'finished',
      outcome = v_outcome,
      ended_reason = p_reason,
      ended_at = now(),
      phase = null,
      active_card_id = null,
      round_deadline = null,
      last_action_at = now()
  where id = p_battle_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ภายใน: เริ่มยกใหม่ (ต้องล็อก battle แล้ว)
--   ทีมโจมตี: ยกแรกสุ่ม แล้วสลับทุกยก · ผู้บัญชาการ: หมุนตาม commander_order ของทีมนั้น
-- ----------------------------------------------------------------------------
create or replace function public._tb_begin_round(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b      public.pvp_team_battles;
  v_round  int;
  v_att    text;
  v_k      int;
  v_n      int;
  v_cmd    uuid;
  v_cards  int;
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id;

  v_round := v_b.current_round + 1;
  if v_b.current_round = 0 or v_b.attacker_team is null then
    v_att := (array['a', 'b'])[1 + floor(random() * 2)::int];
  else
    v_att := case when v_b.attacker_team = 'a' then 'b' else 'a' end;
  end if;

  select count(*) into v_k
  from public.pvp_team_rounds where battle_id = p_battle_id and attacker_team = v_att;

  select count(*) into v_n
  from public.pvp_team_members
  where battle_id = p_battle_id and team = v_att and is_player;

  select user_id into v_cmd
  from public.pvp_team_members
  where battle_id = p_battle_id and team = v_att and is_player
    and commander_order = (v_k % greatest(v_n, 1)) + 1;

  v_cards := public._tb_draw_hand(p_battle_id, v_round, v_att, v_cmd);
  if v_cards = 0 then
    -- ไม่มีโจทย์ให้จั่วเลย (ไม่ควรเกิดเพราะตรวจตอนสร้าง/เริ่มแล้ว) → จบเกมอย่างปลอดภัย
    perform public._tb_finish(p_battle_id, 'stale_timeout');
    return;
  end if;

  update public.pvp_team_battles
  set current_round = v_round,
      attacker_team = v_att,
      phase = 'picking',
      active_card_id = null,
      round_deadline = now() + make_interval(secs => (config ->> 'pick_seconds')::int),
      last_action_at = now()
  where id = p_battle_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ภายใน: ลงการ์ด (เลือกเอง หรือสุ่มเมื่อหมดเวลา) → เริ่มช่วงตอบ
--   เวลาตอบ = answer_seconds; เอฟเฟกต์ haste = ครึ่งหนึ่ง (ขั้นต่ำ 5 วิ)
-- ----------------------------------------------------------------------------
create or replace function public._tb_play_card(p_battle_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b    public.pvp_team_battles;
  v_card public.pvp_team_cards;
  v_secs int;
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id;
  select * into v_card from public.pvp_team_cards where id = p_card_id;

  v_secs := (v_b.config ->> 'answer_seconds')::int;
  if v_card.effect_id = 'haste' then
    v_secs := greatest(5, v_secs / 2);
  end if;

  update public.pvp_team_cards set played_at = now() where id = p_card_id;

  update public.pvp_team_battles
  set phase = 'answering',
      active_card_id = p_card_id,
      round_deadline = now() + make_interval(secs => v_secs),
      last_action_at = now()
  where id = p_battle_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ภายใน: คิดผลยก (ต้องล็อก battle แล้ว; phase = answering)
--   ดาเมจ TEMP: base = round(ATK×0.55); full = max(1, round(base×(1−DEF/200)))
--   dmg = max(1, round(full × สัดส่วนผิด × (คริ 1.5)))  (เมื่อมีคนผิด ≥1)
--   high_stake ×2 · lifesteal ฟื้นทีมโจมตีเท่าดาเมจ
--   pierce = round(max(1, round(base×0.3)) × สัดส่วนถูก) · reprisal = round(base×(1−DEF_atk/200) × สัดส่วนถูก)
--   heal = round(base × สัดส่วนถูก) ให้ทีมรับ (ไม่เกิน HP สูงสุด)
-- ----------------------------------------------------------------------------
create or replace function public._tb_resolve_round(p_battle_id uuid, p_timed_out boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_card public.pvp_team_cards;
  v_att text;
  v_def text;
  v_effect text;
  v_total int;
  v_correct int;
  v_wrong int;
  v_noans int;
  v_wrong_total int;
  v_c numeric;
  v_w numeric;
  v_stat_att jsonb;
  v_stat_def jsonb;
  v_atk int; v_foc int; v_atk_def int; v_def_def int;
  v_atk_hp_max int; v_def_hp_max int;
  v_atk_hp int; v_def_hp int;
  v_base int;
  v_full int;
  v_dmg int := 0;
  v_pierce int := 0;
  v_self int := 0;
  v_heal_self int := 0;
  v_heal_def int := 0;
  v_heal_self_ap int := 0;
  v_heal_def_ap int := 0;
  v_crit boolean := false;
  v_trig boolean := false;
  v_def_hp_new int;
  v_atk_hp_new int;
  v_hp_a int;
  v_hp_b int;
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id;
  if v_b.status <> 'active' or v_b.phase <> 'answering' or v_b.active_card_id is null then
    return jsonb_build_object('noop', true);
  end if;

  select * into v_card from public.pvp_team_cards where id = v_b.active_card_id;
  v_effect := v_card.effect_id;
  v_att := v_b.attacker_team;
  v_def := case when v_att = 'a' then 'b' else 'a' end;
  v_total := greatest(case when v_def = 'a' then v_b.player_count_a else v_b.player_count_b end, 1);

  -- ใครยังไม่ตอบ = ไม่ตอบ (นับเป็นผิด)
  insert into public.pvp_team_answers
    (battle_id, round_no, user_id, card_id, answer_index, is_correct, timed_out)
  select p_battle_id, v_b.current_round, m.user_id, v_card.id, null, false, true
  from public.pvp_team_members m
  where m.battle_id = p_battle_id and m.team = v_def and m.is_player
    and not exists (
      select 1 from public.pvp_team_answers a
      where a.battle_id = p_battle_id and a.round_no = v_b.current_round and a.user_id = m.user_id
    );

  select count(*) filter (where is_correct),
         count(*) filter (where not is_correct and not timed_out),
         count(*) filter (where timed_out)
  into v_correct, v_wrong, v_noans
  from public.pvp_team_answers
  where battle_id = p_battle_id and round_no = v_b.current_round;

  v_wrong_total := v_wrong + v_noans;
  v_c := v_correct::numeric / v_total;
  v_w := v_wrong_total::numeric / v_total;

  v_stat_att := case when v_att = 'a' then v_b.stat_a else v_b.stat_b end;
  v_stat_def := case when v_att = 'a' then v_b.stat_b else v_b.stat_a end;
  v_atk := coalesce((v_stat_att ->> 'atk')::int, 0);
  v_foc := coalesce((v_stat_att ->> 'foc')::int, 0);
  v_atk_def := coalesce((v_stat_att ->> 'def')::int, 0);
  v_def_def := coalesce((v_stat_def ->> 'def')::int, 0);
  v_atk_hp_max := greatest(coalesce((v_stat_att ->> 'hp')::int, 1), 1);
  v_def_hp_max := greatest(coalesce((v_stat_def ->> 'hp')::int, 1), 1);
  v_atk_hp := case when v_att = 'a' then v_b.hp_a else v_b.hp_b end;
  v_def_hp := case when v_att = 'a' then v_b.hp_b else v_b.hp_a end;

  v_base := round(v_atk * 0.55)::int;

  if v_wrong_total > 0 then
    v_full := greatest(1, round(v_base * (1 - v_def_def / 200.0))::int);
    if random() * 100 < v_foc then v_crit := true; end if;
    v_dmg := greatest(1, round(v_full * v_w * (case when v_crit then 1.5 else 1.0 end))::int);
    if v_effect = 'high_stake' then
      v_dmg := v_dmg * 2;
      v_trig := true;
    elsif v_effect = 'lifesteal' then
      v_heal_self := v_dmg;
      v_trig := true;
    end if;
  end if;

  if v_correct > 0 then
    if v_effect = 'reprisal' then
      v_self := greatest(0, round(greatest(0, v_base * (1 - v_atk_def / 200.0)) * v_c)::int);
      v_trig := v_trig or v_self > 0;
    elsif v_effect = 'pierce' then
      v_pierce := greatest(0, round(greatest(1, round(v_base * 0.3)) * v_c)::int);
      v_trig := v_trig or v_pierce > 0;
    elsif v_effect = 'heal' then
      v_heal_def := greatest(0, round(v_base * v_c)::int);
      v_trig := v_trig or v_heal_def > 0;
    end if;
  end if;

  v_heal_def_ap := least(v_heal_def, greatest(0, v_def_hp_max - v_def_hp));
  v_heal_self_ap := least(v_heal_self, greatest(0, v_atk_hp_max - v_atk_hp));
  v_def_hp_new := v_def_hp - v_dmg - v_pierce + v_heal_def_ap;
  v_atk_hp_new := v_atk_hp - v_self + v_heal_self_ap;

  v_hp_a := greatest(0, case when v_att = 'a' then v_atk_hp_new else v_def_hp_new end);
  v_hp_b := greatest(0, case when v_att = 'a' then v_def_hp_new else v_atk_hp_new end);

  update public.pvp_team_battles
  set hp_a = v_hp_a, hp_b = v_hp_b, last_action_at = now()
  where id = p_battle_id;

  insert into public.pvp_team_rounds
    (battle_id, round_no, attacker_team, card_id, effect_id, defenders_total,
     correct_count, wrong_count, no_answer_count, damage, crit, effect_triggered,
     self_damage, heal_self, heal_defender, pierce, hp_a_after, hp_b_after, timed_out)
  values
    (p_battle_id, v_b.current_round, v_att, v_card.id, v_effect, v_total,
     v_correct, v_wrong, v_noans, v_dmg + v_pierce, v_crit, v_trig,
     v_self, v_heal_self_ap, v_heal_def_ap, v_pierce, v_hp_a, v_hp_b, p_timed_out);

  -- จบเกมหรือเริ่มยกต่อไป (เวลาเกมหมดกลางยก = ยกนี้จบก่อนแล้วค่อยจบ)
  if v_hp_a <= 0 or v_hp_b <= 0 then
    perform public._tb_finish(p_battle_id, 'hp_zero');
  elsif v_b.ends_at is not null and now() >= v_b.ends_at then
    perform public._tb_finish(p_battle_id, 'time_up');
  else
    perform public._tb_begin_round(p_battle_id);
  end if;

  return jsonb_build_object(
    'round_no', v_b.current_round, 'defenders_total', v_total,
    'correct', v_correct, 'wrong', v_wrong, 'no_answer', v_noans,
    'damage', v_dmg + v_pierce, 'crit', v_crit, 'effect_id', v_effect, 'effect_triggered', v_trig,
    'self_damage', v_self, 'heal_self', v_heal_self_ap, 'heal_defender', v_heal_def_ap,
    'hp_a', v_hp_a, 'hp_b', v_hp_b);
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: ผู้บัญชาการเลือกการ์ด
-- ----------------------------------------------------------------------------
create or replace function public.tb_pick_card(p_battle_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b   public.pvp_team_battles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_b := public._tb_lock_battle_any(p_battle_id);
  if v_b.status <> 'active' or v_b.phase <> 'picking' then
    raise exception 'not_picking';
  end if;
  if v_b.round_deadline is not null and now() >= v_b.round_deadline then
    raise exception 'round_closed';
  end if;

  if not exists (
    select 1 from public.pvp_team_cards c
    where c.id = p_card_id and c.battle_id = p_battle_id
      and c.round_no = v_b.current_round and c.team = v_b.attacker_team
      and c.drawn_for_user_id = v_uid and c.played_at is null
  ) then
    raise exception 'invalid_card';
  end if;

  perform public._tb_play_card(p_battle_id, p_card_id);
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: ผู้เล่นทีมรับส่งคำตอบ (ตอบครบทุกคน = ปิดยกทันที)
-- ----------------------------------------------------------------------------
create or replace function public.tb_submit_answer(p_battle_id uuid, p_answer_index integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b   public.pvp_team_battles;
  v_def text;
  v_card public.pvp_team_cards;
  v_correct int;
  v_choices int;
  v_total int;
  v_done int;
  v_secs int;
  v_ms int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_b := public._tb_lock_battle_any(p_battle_id);
  if v_b.status <> 'active' or v_b.phase <> 'answering' then
    raise exception 'not_answering';
  end if;
  if now() >= v_b.round_deadline then
    raise exception 'round_closed';
  end if;

  v_def := case when v_b.attacker_team = 'a' then 'b' else 'a' end;
  if not exists (
    select 1 from public.pvp_team_members m
    where m.battle_id = p_battle_id and m.user_id = v_uid and m.team = v_def and m.is_player
  ) then
    raise exception 'not_a_defender';
  end if;

  if exists (
    select 1 from public.pvp_team_answers a
    where a.battle_id = p_battle_id and a.round_no = v_b.current_round and a.user_id = v_uid
  ) then
    raise exception 'already_answered';
  end if;

  select * into v_card from public.pvp_team_cards where id = v_b.active_card_id;
  select q.correct_index, jsonb_array_length(q.choices) into v_correct, v_choices
  from public.questions q where q.id = v_card.question_id;

  if p_answer_index is null or p_answer_index < 0 or p_answer_index >= coalesce(v_choices, 0) then
    raise exception 'invalid_answer';
  end if;

  v_secs := (v_b.config ->> 'answer_seconds')::int;
  if v_card.effect_id = 'haste' then v_secs := greatest(5, v_secs / 2); end if;
  v_ms := greatest(0, least(v_secs * 1000,
            (v_secs * 1000) - (extract(epoch from (v_b.round_deadline - now())) * 1000)::int));

  insert into public.pvp_team_answers
    (battle_id, round_no, user_id, card_id, answer_index, is_correct, timed_out, answered_ms)
  values
    (p_battle_id, v_b.current_round, v_uid, v_card.id, p_answer_index,
     (p_answer_index = v_correct), false, v_ms);

  v_total := case when v_def = 'a' then v_b.player_count_a else v_b.player_count_b end;
  select count(*) into v_done
  from public.pvp_team_answers
  where battle_id = p_battle_id and round_no = v_b.current_round;

  if v_done >= v_total then
    perform public._tb_resolve_round(p_battle_id, false);
  else
    update public.pvp_team_battles set last_action_at = now() where id = p_battle_id;
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: คำถามของยกที่กำลังตอบ (เฉพาะผู้เล่นทีมรับ; ไม่ส่ง correct_index)
-- ----------------------------------------------------------------------------
create or replace function public.tb_get_active_question(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b   public.pvp_team_battles;
  v_def text;
  v_card public.pvp_team_cards;
  v_q   record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_b from public.pvp_team_battles where id = p_battle_id;
  if not found or v_b.status <> 'active' or v_b.phase <> 'answering' then
    return null;
  end if;

  v_def := case when v_b.attacker_team = 'a' then 'b' else 'a' end;
  if not exists (
    select 1 from public.pvp_team_members m
    where m.battle_id = p_battle_id and m.user_id = v_uid and m.team = v_def and m.is_player
  ) then
    raise exception 'not_a_defender';
  end if;

  select * into v_card from public.pvp_team_cards where id = v_b.active_card_id;
  select q.id, q.question_text, q.choices, q.image_url into v_q
  from public.questions q where q.id = v_card.question_id;

  return jsonb_build_object(
    'round_no', v_b.current_round,
    'question_id', v_q.id,
    'question_text', v_q.question_text,
    'choices', v_q.choices,
    'image_url', v_q.image_url,
    'effect_id', v_card.effect_id,
    'round_deadline', v_b.round_deadline,
    'server_now', now());
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: tick — ปิดยกที่หมดเวลา (idempotent; DB now() ตัดสิน ไม่เชื่อนาฬิกา client)
--   หมดเวลาเลือกการ์ด → สุ่มให้ · หมดเวลาตอบ → คิดผล (ที่ไม่ตอบ = ผิด)
-- ----------------------------------------------------------------------------
create or replace function public.tb_tick(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_card uuid;
  v_res jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_pvp_team_battle_viewer(p_battle_id) then
    raise exception 'not_authorized_or_not_found';
  end if;

  v_b := public._tb_lock_battle_any(p_battle_id);
  if v_b.status <> 'active' then
    return jsonb_build_object('action', 'none', 'status', v_b.status);
  end if;
  if v_b.round_deadline is null or now() < v_b.round_deadline then
    return jsonb_build_object('action', 'wait', 'status', v_b.status);
  end if;

  if v_b.phase = 'picking' then
    select c.id into v_card
    from public.pvp_team_cards c
    where c.battle_id = p_battle_id and c.round_no = v_b.current_round
      and c.team = v_b.attacker_team and c.played_at is null
    order by random() limit 1;

    if v_card is null then
      perform public._tb_finish(p_battle_id, 'stale_timeout');
      return jsonb_build_object('action', 'finished_no_cards');
    end if;
    perform public._tb_play_card(p_battle_id, v_card);
    return jsonb_build_object('action', 'auto_pick');
  elsif v_b.phase = 'answering' then
    v_res := public._tb_resolve_round(p_battle_id, true);
    return jsonb_build_object('action', 'resolved', 'result', v_res);
  end if;

  return jsonb_build_object('action', 'none');
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: ครูจบเกมที่เริ่มแล้ว (ผลตัดสินตาม HP ปัจจุบัน)
-- ----------------------------------------------------------------------------
create or replace function public.tb_end_battle(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'active' then raise exception 'battle_not_active'; end if;
  perform public._tb_finish(p_battle_id, 'host_ended');
end;
$function$;

-- ----------------------------------------------------------------------------
-- สาธารณะ: สถานะรวม (ผู้ชม = ครู/สมาชิกห้อง) — ไม่มี user_id ของผู้ตอบ ไม่มี correct_index
--   การ์ดที่ยังไม่ลงสนามไม่ถูกเปิดเผย; server_now ไว้คำนวณ offset นาฬิกา
-- ----------------------------------------------------------------------------
create or replace function public.get_team_battle_state(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_card public.pvp_team_cards;
  v_def text;
  v_total int;
  v_answered int;
  v_cmd uuid;
  v_last jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_pvp_team_battle_viewer(p_battle_id) then
    raise exception 'not_authorized_or_not_found';
  end if;

  select * into v_b from public.pvp_team_battles where id = p_battle_id;

  if v_b.active_card_id is not null then
    select * into v_card from public.pvp_team_cards where id = v_b.active_card_id;
  end if;

  v_def := case when v_b.attacker_team = 'a' then 'b' when v_b.attacker_team = 'b' then 'a' else null end;
  v_total := case when v_def = 'a' then v_b.player_count_a when v_def = 'b' then v_b.player_count_b else null end;

  select count(*) into v_answered
  from public.pvp_team_answers
  where battle_id = p_battle_id and round_no = v_b.current_round;

  select c.drawn_for_user_id into v_cmd
  from public.pvp_team_cards c
  where c.battle_id = p_battle_id and c.round_no = v_b.current_round and c.team = v_b.attacker_team
  limit 1;

  select to_jsonb(r) - 'battle_id' into v_last
  from public.pvp_team_rounds r
  where r.battle_id = p_battle_id
  order by r.round_no desc limit 1;

  return jsonb_build_object(
    'battle', jsonb_build_object(
      'id', v_b.id, 'status', v_b.status, 'phase', v_b.phase,
      'current_round', v_b.current_round, 'attacker_team', v_b.attacker_team,
      'hp_a', v_b.hp_a, 'hp_b', v_b.hp_b, 'hp_max_a', v_b.hp_max_a, 'hp_max_b', v_b.hp_max_b,
      'stat_a', v_b.stat_a, 'stat_b', v_b.stat_b,
      'player_count_a', v_b.player_count_a, 'player_count_b', v_b.player_count_b,
      'round_deadline', v_b.round_deadline, 'ends_at', v_b.ends_at,
      'outcome', v_b.outcome, 'ended_reason', v_b.ended_reason,
      'config', v_b.config - 'chapters'),
    'round', jsonb_build_object(
      'commander_user_id', v_cmd,
      'defenders_total', v_total,
      'answered', v_answered,
      'card', case when v_card.id is not null and v_card.played_at is not null
                   then jsonb_build_object('id', v_card.id, 'chapter', v_card.chapter,
                          'subject', v_card.subject, 'difficulty', v_card.difficulty,
                          'effect_id', v_card.effect_id)
                   else null end),
    'last_round', v_last,
    'server_now', now());
end;
$function$;

-- ----------------------------------------------------------------------------
-- cron: ปิดเกมค้าง (เรียกทุก 5 นาที — ตั้งเวลาเป็นขั้นแยกหลังอนุมัติ)
--   active ไม่มีความเคลื่อนไหว > 10 นาที → abandoned/stale_timeout
--   setup ค้าง > 6 ชั่วโมง → abandoned/stale_timeout
-- ----------------------------------------------------------------------------
create or replace function public.close_stale_team_battles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  update public.pvp_team_battles
  set status = 'abandoned',
      ended_at = now(),
      ended_reason = 'stale_timeout',
      phase = null,
      active_card_id = null,
      round_deadline = null,
      last_action_at = now()
  where (status = 'active' and last_action_at < now() - interval '10 minutes')
     or (status = 'setup'  and last_action_at < now() - interval '6 hours');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ----------------------------------------------------------------------------
-- แทนที่ tb_start ของเฟส 2: เพิ่มการเริ่มยกแรกท้ายฟังก์ชัน (ส่วนที่เหลือเหมือนเดิมทุกบรรทัด)
-- ----------------------------------------------------------------------------
create or replace function public.tb_start(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_checks jsonb;
  v_stat_a jsonb;
  v_stat_b jsonb;
  v_na int;
  v_nb int;
  v_limit int;
  r record;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'setup' then raise exception 'battle_not_in_setup'; end if;

  for r in
    select m.user_id, cp.pet_id as room_pet_id
    from public.pvp_team_members m
    left join public.classroom_participants cp
      on cp.session_id = v_b.classroom_session_id and cp.user_id = m.user_id
    where m.battle_id = p_battle_id
  loop
    update public.pvp_team_members m
    set pet_id = public._tb_member_pet(r.user_id, r.room_pet_id),
        stat_snapshot = public._tb_member_snapshot(public._tb_member_pet(r.user_id, r.room_pet_id))
    where m.battle_id = p_battle_id and m.user_id = r.user_id;
  end loop;

  v_checks := public._tb_checks(p_battle_id);
  if not (v_checks ->> 'can_start')::boolean then
    raise exception 'cannot_start: %', v_checks ->> 'block';
  end if;

  select jsonb_build_object(
           'hp',  round(avg((stat_snapshot ->> 'hp')::numeric)),
           'atk', round(avg((stat_snapshot ->> 'atk')::numeric)),
           'def', round(avg((stat_snapshot ->> 'def')::numeric)),
           'spd', round(avg((stat_snapshot ->> 'spd')::numeric)),
           'foc', round(avg((stat_snapshot ->> 'foc')::numeric))),
         count(*)
  into v_stat_a, v_na
  from public.pvp_team_members
  where battle_id = p_battle_id and is_player and team = 'a';

  select jsonb_build_object(
           'hp',  round(avg((stat_snapshot ->> 'hp')::numeric)),
           'atk', round(avg((stat_snapshot ->> 'atk')::numeric)),
           'def', round(avg((stat_snapshot ->> 'def')::numeric)),
           'spd', round(avg((stat_snapshot ->> 'spd')::numeric)),
           'foc', round(avg((stat_snapshot ->> 'foc')::numeric))),
         count(*)
  into v_stat_b, v_nb
  from public.pvp_team_members
  where battle_id = p_battle_id and is_player and team = 'b';

  update public.pvp_team_members m
  set commander_order = o.rn
  from (
    select user_id, row_number() over (partition by team order by random()) as rn
    from public.pvp_team_members
    where battle_id = p_battle_id and is_player
  ) o
  where m.battle_id = p_battle_id and m.user_id = o.user_id;

  update public.pvp_team_members set commander_order = null
  where battle_id = p_battle_id and not is_player;

  v_limit := (v_b.config ->> 'time_limit_minutes')::int;

  update public.pvp_team_battles
  set status = 'active',
      stat_a = v_stat_a, stat_b = v_stat_b,
      hp_max_a = greatest((v_stat_a ->> 'hp')::int, 1),
      hp_max_b = greatest((v_stat_b ->> 'hp')::int, 1),
      hp_a = greatest((v_stat_a ->> 'hp')::int, 1),
      hp_b = greatest((v_stat_b ->> 'hp')::int, 1),
      player_count_a = v_na, player_count_b = v_nb,
      started_at = now(),
      ends_at = now() + make_interval(mins => v_limit),
      last_action_at = now()
  where id = p_battle_id;

  -- เฟส 3: เริ่มยกแรกทันที
  perform public._tb_begin_round(p_battle_id);
end;
$function$;

-- ----------------------------------------------------------------------------
-- สิทธิ์
-- ----------------------------------------------------------------------------
revoke all on function public._tb_lock_battle_any(uuid) from public, anon, authenticated;
revoke all on function public._tb_draw_hand(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public._tb_finish(uuid, text) from public, anon, authenticated;
revoke all on function public._tb_begin_round(uuid) from public, anon, authenticated;
revoke all on function public._tb_play_card(uuid, uuid) from public, anon, authenticated;
revoke all on function public._tb_resolve_round(uuid, boolean) from public, anon, authenticated;
revoke all on function public.close_stale_team_battles() from public, anon, authenticated;

revoke all on function public.tb_pick_card(uuid, uuid) from public, anon;
revoke all on function public.tb_submit_answer(uuid, integer) from public, anon;
revoke all on function public.tb_get_active_question(uuid) from public, anon;
revoke all on function public.tb_tick(uuid) from public, anon;
revoke all on function public.tb_end_battle(uuid) from public, anon;
revoke all on function public.get_team_battle_state(uuid) from public, anon;
revoke all on function public.tb_start(uuid) from public, anon;

grant execute on function public.tb_pick_card(uuid, uuid) to authenticated;
grant execute on function public.tb_submit_answer(uuid, integer) to authenticated;
grant execute on function public.tb_get_active_question(uuid) to authenticated;
grant execute on function public.tb_tick(uuid) to authenticated;
grant execute on function public.tb_end_battle(uuid) to authenticated;
grant execute on function public.get_team_battle_state(uuid) to authenticated;
grant execute on function public.tb_start(uuid) to authenticated;

commit;
