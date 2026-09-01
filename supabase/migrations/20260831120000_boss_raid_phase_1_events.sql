-- Migration: 20260831120000_boss_raid_phase_1_events
-- Classroom Boss Raid — Phase 1 สไลซ์ 1.1: Event "จุดอ่อนเผย" + "ฝนดาวตก"
-- อ้างอิง: classroom-boss-raid-design-2026-08-28-v2.md §4
-- Survey: realtime infra ที่มีอยู่แล้ว (useBossRaidLobby.ts subscribe UPDATE ทั้งแถวของ
--   boss_raid_sessions) พอสำหรับ broadcast event ทุกจอพร้อมกัน — แค่ UPDATE คอลัมน์ใหม่
--   ไม่ต้องเพิ่ม channel/infra ใหม่เลย
--
-- กลไก (เคาะกับปอนด์แล้ว 2026-08-31):
--   จุดอ่อนเผย = บัฟทั้งห้อง x2 damage ชั่วคราว 20 วิ (ไม่มีคำถามพิเศษ ใช้กับคำถามปกติที่กำลังตอบอยู่)
--   ฝนดาวตก   = คำถามบอนัส broadcast ทุกจอ 15 วิ ใครตอบถูกคนแรกได้ +15 dmg คงที่ (ไม่ผูก atk ตัวเอง)
--   Trigger: roll 2% ต่อครั้งทั้งคู่ (คนละ roll ไม่ชนกัน) ทุกครั้งที่มีคนตอบคำถามปกติ
--   กันสแปม: 2 event ใช้ slot เดียวกัน (active_event) — มี event ทำงานอยู่แล้วจะไม่ roll ซ้อน
--
-- Security review (Claude Code, 2026-08-31) — 3 จุดที่แก้จาก draft ของปอนด์:
--   1. 🔴 correct_index ของคำถามฝนดาวตก **ห้ามใส่ใน active_event** — boss_raid_sessions อยู่ใน
--      supabase_realtime publication ทั้งแถวถูก broadcast ให้ทุกจอ นักเรียนอ่าน frame เห็นเฉลย
--      -> เก็บแค่ question_id/text/choices; submit_boss_raid_event_answer lookup correct_index
--      จาก public.questions เองฝั่ง server
--   2. 🟠 retry guard — 4 ตัวเลือกใน 15 วิ brute-force ชนะได้จริง -> 1 คน 1 สิทธิ์ต่อ 1 meteor
--      ผ่านแถว event_type='meteor_attempt' ใน boss_raid_event_log + partial unique index
--      (ไม่สร้างตารางใหม่ ตามที่ปอนด์ขอ)
--   3. 🟡 null-safe guard: coalesce(active_event->>'type','') <> 'meteor'

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ===== 1. Schema =====

alter table public.boss_raid_sessions
  add column if not exists active_event jsonb;

comment on column public.boss_raid_sessions.active_event is
  'Event ที่กำลังทำงานอยู่ (null = ไม่มี). weak_point: {type,expires_at}. '
  'meteor: {type,question_id,question_text,choices,expires_at,winner_participant_id}. '
  '⚠️ ห้ามใส่ correct_index — column นี้ถูก broadcast ทั้งแถวผ่าน realtime. '
  'ถือว่า "inactive" เมื่อ expires_at ผ่านไปแล้ว แม้ column จะยังไม่ null จนกว่าจะมี event ใหม่ทับ';

create table if not exists public.boss_raid_event_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.boss_raid_sessions(id),
  event_type text not null check (event_type in ('weak_point', 'meteor', 'meteor_attempt')),
  triggered_at timestamptz not null default now(),
  participant_id uuid references public.boss_raid_participants(id),
  winner_participant_id uuid references public.boss_raid_participants(id),
  bonus_damage int
);

comment on table public.boss_raid_event_log is
  'Append-only log. weak_point/meteor = 1 แถวต่อการ trigger (เก็บดูความถี่จริง/tune % ทีหลัง). '
  'meteor_attempt = 1 แถวต่อ 1 การพยายามตอบฝนดาวตก (retry guard — participant_id ตอบได้ครั้งเดียว '
  'ต่อ meteor 1 ลูก) — analytics ความถี่ต้อง filter event_type in (weak_point, meteor) เท่านั้น';

-- retry guard: 1 participant ตอบ meteor 1 ลูก (แยกด้วย triggered_at ของ trigger row) ได้ครั้งเดียว
create unique index if not exists boss_raid_event_log_meteor_attempt_uniq
  on public.boss_raid_event_log (session_id, participant_id, triggered_at)
  where event_type = 'meteor_attempt';

alter table public.boss_raid_event_log enable row level security;
-- deny-all client policy (เขียนผ่าน security-definer RPC เท่านั้น เหมือน boss_raid_answers)

-- ===== 2. submit_boss_raid_answer — เพิ่ม weak_point multiplier + event roll ท้ายฟังก์ชัน =====

create or replace function public.submit_boss_raid_answer(
  p_participant_id uuid, p_question_id bigint,
  p_question_started_at timestamptz, p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.boss_raid_participants;
  v_s public.boss_raid_sessions;
  v_config jsonb;
  v_timer int;
  v_existing public.boss_raid_answers;
  v_q public.questions;
  v_is_correct boolean;
  v_is_crit boolean := false;
  v_damage int := 0;
  v_atk numeric; v_foc numeric; v_crit_chance int;
  v_inserted public.boss_raid_answers;
  v_boss_hp int;
  v_crystal_hp int;
  v_cur_tier text;
  v_ans text := btrim(coalesce(p_answer, ''));
  v_t1 int; v_t2 int;
  v_base_t1 int; v_base_t2 int;
  v_n int;
  v_wrong_new int;
  v_avg_def numeric;
  v_target_rank int;
  v_new_rank int;
  v_new_tier text;
  v_crystal_damage int;
  v_status text;
  v_result text;
  -- ✅ ใหม่ (1.1): event
  v_weak_point_active boolean := false;
  v_roll numeric;
  v_band text;
  v_diff int;
  v_bonus_q public.questions;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_existing from public.boss_raid_answers
  where participant_id = p_participant_id and question_id = p_question_id
    and question_started_at = p_question_started_at;
  if found then
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  if v_p.current_question_id is distinct from p_question_id
     or v_p.question_started_at is distinct from p_question_started_at then
    raise exception 'ข้อนี้หมดอายุแล้ว ขอข้อใหม่';
  end if;

  v_config := coalesce(v_s.config, '{}'::jsonb);
  v_timer  := coalesce((v_config->>'timer_seconds')::int, 30)
              + round(coalesce((v_p.stat_snapshot->>'spd')::numeric,0)/20)::int;

  select * into v_q from public.questions where id = p_question_id;

  if now() > p_question_started_at + make_interval(secs => v_timer) then
    v_is_correct := false;
  else
    v_is_correct := (v_ans = v_q.correct_index::text)
                    or (v_ans <> '' and v_ans = (v_q.choices ->> v_q.correct_index));
  end if;

  -- ✅ ใหม่ (1.1): จุดอ่อนเผยยัง active อยู่ไหม (เช็คก่อนคำนวณดาเมจ)
  v_weak_point_active := (
    v_s.active_event ->> 'type' = 'weak_point'
    and (v_s.active_event ->> 'expires_at')::timestamptz > now()
  );

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
    if v_weak_point_active then v_damage := v_damage * 2; end if;
  end if;

  insert into public.boss_raid_answers
    (session_id, participant_id, question_id, question_started_at, is_correct, is_crit, damage_dealt)
  values (v_p.session_id, p_participant_id, p_question_id, p_question_started_at, v_is_correct,
          case when v_is_correct then v_is_crit end,
          case when v_is_correct then v_damage end)
  on conflict (participant_id, question_id, question_started_at) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing from public.boss_raid_answers
    where participant_id = p_participant_id and question_id = p_question_id
      and question_started_at = p_question_started_at;
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  if v_is_correct and v_damage > 0 then
    update public.boss_raid_sessions set boss_hp = greatest(0, coalesce(boss_hp,0) - v_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier;

  elsif not v_is_correct then
    case v_config->>'difficulty'
      when 'easy' then v_base_t1 := 10; v_base_t2 := 20;
      when 'hard' then v_base_t1 := 5;  v_base_t2 := 10;
      else             v_base_t1 := 7;  v_base_t2 := 14;
    end case;

    v_n  := greatest(coalesce(v_s.participant_count_at_start, 15), 1);
    v_t1 := greatest(1, round(v_base_t1 * v_n / 15.0)::int);
    v_t2 := greatest(v_t1 + 1, round(v_base_t2 * v_n / 15.0)::int);

    update public.boss_raid_sessions
      set wrong_count_total = wrong_count_total + 1
      where id = v_p.session_id
      returning wrong_count_total, current_tier,
               coalesce((avg_stat_snapshot->>'def')::numeric, 0)
      into v_wrong_new, v_cur_tier, v_avg_def;

    v_target_rank := case when v_wrong_new >= v_t2 then 3
                          when v_wrong_new >= v_t1 then 2
                          else 1 end;
    v_new_rank := greatest(
      v_target_rank,
      case v_cur_tier when 'heavy' then 3 when 'medium' then 2 else 1 end
    );
    v_new_tier := case v_new_rank when 3 then 'heavy' when 2 then 'medium' else 'light' end;

    v_crystal_damage := round(
      v_new_rank * (100.0 / coalesce(nullif(v_avg_def, 0), 100))
    )::int;

    if v_new_tier <> v_cur_tier then
      insert into public.boss_raid_tier_log (session_id, tier) values (v_p.session_id, v_new_tier);
    end if;

    update public.boss_raid_sessions
      set current_tier = v_new_tier,
          crystal_hp   = greatest(0, coalesce(crystal_hp, 0) - v_crystal_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier
      into v_boss_hp, v_crystal_hp, v_cur_tier;

  else
    select boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier
      from public.boss_raid_sessions where id = v_p.session_id;
  end if;

  v_status := v_s.status;
  if v_is_correct and v_damage > 0 and v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  elsif (not v_is_correct) and v_crystal_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'lose'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null
    where id = p_participant_id;

  -- ✅ ใหม่ (1.1): roll event ใหม่ — เฉพาะตอนเกมยังไม่จบ + ไม่มี event ทำงานอยู่ (กันสแปม)
  --   atomic guard ผ่าน WHERE ป้องกัน 2 คนตอบพร้อมกันแล้ว trigger ซ้อนกัน
  if v_status = 'in_progress' and (
    v_s.active_event is null
    or (v_s.active_event ->> 'expires_at')::timestamptz <= now()
  ) then
    v_roll := random();
    if v_roll < 0.02 then
      -- จุดอ่อนเผย
      update public.boss_raid_sessions
        set active_event = jsonb_build_object(
          'type', 'weak_point', 'expires_at', (now() + interval '20 seconds')::text
        )
        where id = v_p.session_id
          and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
      if found then
        insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'weak_point');
      end if;

    elsif v_roll < 0.04 then
      -- ฝนดาวตก — ดึงคำถามบอนัส (อิง grade_band ของคนที่ trigger เป็นตัวแทนห้อง)
      v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
      select grade_band into v_band from public.profiles where id = v_uid;
      v_band := coalesce(v_band, 'junior');

      select q.* into v_bonus_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;

      if found then
        -- ⚠️ ไม่เก็บ correct_index — column ถูก broadcast ทั้งแถวผ่าน realtime
        update public.boss_raid_sessions
          set active_event = jsonb_build_object(
            'type', 'meteor',
            'question_id', v_bonus_q.id,
            'question_text', v_bonus_q.question_text,
            'choices', v_bonus_q.choices,
            'expires_at', (now() + interval '15 seconds')::text,
            'winner_participant_id', null
          )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
        if found then
          insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'meteor');
        end if;
      end if;
      -- ไม่เจอคำถามบอนัส (chapter หมด) -> ข้ามเงียบๆ ไม่ raise ไม่กระทบเกมหลัก
    end if;
  end if;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

-- ===== 3. submit_boss_raid_event_answer — ตอบคำถามฝนดาวตก (race, แยกจาก flow ปกติ) =====

create or replace function public.submit_boss_raid_event_answer(
  p_participant_id uuid, p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  c_bonus_damage constant int := 15;
  v_boss_hp int;
  v_status text;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  -- 🟡 null-safe: active_event = null -> coalesce(...,'') <> 'meteor' เป็น true ชัดเจน
  if coalesce(v_s.active_event ->> 'type', '') <> 'meteor'
     or (v_s.active_event ->> 'expires_at')::timestamptz <= now() then
    return jsonb_build_object('event_active', false);
  end if;

  -- 🟠 retry guard — 1 participant / 1 meteor / 1 สิทธิ์ (นับทั้งตอบผิด). แยก meteor แต่ละลูกด้วย
  --   triggered_at ของ trigger row (fallback = expires_at - 15s เผื่อ log row หาย)
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

  -- 🔴 lookup เฉลยฝั่ง server — ไม่เคยอยู่ใน active_event
  v_question_id := (v_s.active_event ->> 'question_id')::bigint;
  select correct_index into v_correct_index from public.questions where id = v_question_id;
  v_is_correct := (v_ans <> '' and v_ans = v_correct_index::text);

  if not v_is_correct then
    return jsonb_build_object('event_active', true, 'is_correct', false, 'won', false);
  end if;

  -- claim แบบ atomic — คนแรกที่ตอบถูกเท่านั้นที่ได้ (WHERE กัน race)
  update public.boss_raid_sessions
    set active_event = active_event || jsonb_build_object('winner_participant_id', p_participant_id::text),
        boss_hp = greatest(0, coalesce(boss_hp, 0) - c_bonus_damage)
    where id = v_p.session_id
      and active_event ->> 'type' = 'meteor'
      and active_event ->> 'winner_participant_id' is null
      and (active_event ->> 'expires_at')::timestamptz > now()
    returning boss_hp, status, result into v_boss_hp, v_status, v_result;

  if not found then
    -- มีคนตอบถูกไปแล้วก่อนหน้า (แพ้ race) หรือ event หมดอายุพอดี
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('event_active', true, 'is_correct', true, 'won', false, 'boss_hp', v_boss_hp);
  end if;

  update public.boss_raid_event_log
    set winner_participant_id = p_participant_id, bonus_damage = c_bonus_damage
    where session_id = v_p.session_id and event_type = 'meteor'
      and triggered_at = v_trig_at;

  if v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  return jsonb_build_object('event_active', true, 'is_correct', true, 'won', true,
    'bonus_damage', c_bonus_damage, 'boss_hp', v_boss_hp,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_event_answer(uuid, text) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   DROP FUNCTION submit_boss_raid_event_answer(uuid, text);
--   re-apply 20260830160100_boss_raid_phase_1_tier_threshold_scale_n.sql's submit_boss_raid_answer
--     (ไม่มี weak_point/event roll);
--   DROP INDEX boss_raid_event_log_meteor_attempt_uniq;
--   DROP TABLE boss_raid_event_log;
--   ALTER TABLE boss_raid_sessions DROP COLUMN active_event;
-- ============================================================
