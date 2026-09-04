-- ============================================================
-- PvP สไลซ์ 5 (Part 1) — เฟส 'card_ready' กันนาฬิกาเดินก่อนผู้ตอบเห็นการ์ด
--   เดิม: assign_pvp_card ตั้ง round_deadline ทันทีที่ผู้ส่งกดส่ง — ถ้าผู้ตอบยังไม่เปิดแอป
--         เวลาจริงเดินไปเรื่อย ๆ โดยที่เขายังไม่เห็นโจทย์เลย ไม่ยุติธรรม
--   ใหม่: assign_pvp_card -> phase='card_ready' (round_deadline ยังเป็น null)
--         ผู้ตอบเปิดจอ เห็น preview การ์ด (chapter/subject/difficulty/effect เท่านั้น ไม่เห็นโจทย์)
--         กด "เริ่มตอบ" -> start_pvp_answer() ตั้ง round_deadline เริ่มนับจากตอนนั้นจริง ๆ
-- ============================================================

alter table public.pvp_matches drop constraint pvp_matches_phase_check;
alter table public.pvp_matches add constraint pvp_matches_phase_check
  check (phase = any (array['assigning', 'card_ready', 'answering']));

-- ============================================================
-- 1) assign_pvp_card — ไม่ตั้ง round_deadline อีกต่อไป แค่เปิดการ์ดเข้า phase 'card_ready'
-- ============================================================
create or replace function public.assign_pvp_card(p_match_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_max_hand int;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;
  if v_uid not in (v_m.player_a_id, v_m.player_b_id) then raise exception 'ไม่ใช่แมตช์ของคุณ'; end if;
  if v_m.status <> 'active' then raise exception 'แมตช์นี้จบแล้ว'; end if;
  if v_m.attacker_id <> v_uid then raise exception 'ยังไม่ถึงตาส่งการ์ดของคุณ'; end if;
  if v_m.phase <> 'assigning' then raise exception 'ส่งการ์ดไปแล้ว รออีกฝ่ายตอบ'; end if;

  select * into v_card from public.pvp_match_cards where id = p_card_id;
  if not found or v_card.match_id <> p_match_id or v_card.drawn_for_user_id <> v_uid
     or v_card.played_at is not null then
    raise exception 'การ์ดนี้ใช้ไม่ได้';
  end if;

  select max(hand_no) into v_max_hand
  from public.pvp_match_cards where match_id = p_match_id and drawn_for_user_id = v_uid;
  if v_card.hand_no <> v_max_hand then
    raise exception 'การ์ดนี้ไม่ได้อยู่ในมือปัจจุบัน';
  end if;

  delete from public.pvp_match_cards
  where match_id = p_match_id and drawn_for_user_id = v_uid
    and hand_no = v_card.hand_no and played_at is null and id <> p_card_id;

  update public.pvp_match_cards set played_at = now() where id = p_card_id;

  -- นาฬิกาตอบยังไม่เริ่ม — ตั้ง round_deadline ตอน start_pvp_answer() เท่านั้น (ผู้ตอบเปิดดูจริง)
  update public.pvp_matches
    set active_card_id = p_card_id,
        phase = 'card_ready',
        round_deadline = null,
        last_action_at = now(),
        timeout_at = now() + interval '3 days'
  where id = p_match_id;
end;
$$;

grant execute on function public.assign_pvp_card(uuid, uuid) to authenticated;

-- ============================================================
-- 2) start_pvp_answer — ผู้ตอบกด "เริ่มตอบ" หลังเห็น preview การ์ดแล้ว -> นาฬิกาเริ่มนับจริง ณ ตอนนี้
--    deadline = now() + 60วิ + round(spd_ผู้ตอบ/20) วิ  (ปกติ)
--             = now() + 30วิ                             (การ์ด effect_id = 'haste')
--    (สูตรเดียวกับที่เคยอยู่ใน assign_pvp_card ก่อนสไลซ์ 5)
-- ============================================================
create or replace function public.start_pvp_answer(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_defender uuid;
  v_spd int;
  v_deadline timestamptz;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;
  if v_uid not in (v_m.player_a_id, v_m.player_b_id) then raise exception 'ไม่ใช่แมตช์ของคุณ'; end if;
  if v_m.status <> 'active' then raise exception 'แมตช์นี้จบแล้ว'; end if;
  if v_m.phase <> 'card_ready' then raise exception 'ยังไม่มีการ์ดให้เริ่มตอบ'; end if;

  v_defender := case when v_m.attacker_id = v_m.player_a_id then v_m.player_b_id else v_m.player_a_id end;
  if v_uid <> v_defender then raise exception 'ยังไม่ถึงตาตอบของคุณ'; end if;

  select * into v_card from public.pvp_match_cards where id = v_m.active_card_id;
  if not found then raise exception 'ไม่พบการ์ดที่กำลังเล่น'; end if;

  v_spd := case when v_defender = v_m.player_a_id
                then (v_m.stat_a->>'spd')::int else (v_m.stat_b->>'spd')::int end;
  if v_card.effect_id = 'haste' then
    v_deadline := now() + interval '30 seconds';
  else
    v_deadline := now() + make_interval(secs => (60 + round(coalesce(v_spd, 0) / 20.0))::double precision);
  end if;

  update public.pvp_matches
    set phase = 'answering',
        round_deadline = v_deadline,
        last_action_at = now()
  where id = p_match_id;
end;
$$;

grant execute on function public.start_pvp_answer(uuid) to authenticated;

-- ============================================================
-- 3) submit_pvp_card — เพิ่มเช็ค phase='answering' (มีอยู่แล้ว ไม่เปลี่ยน) กัน submit ระหว่าง card_ready
--    (ทวนสอบ: เงื่อนไข v_m.phase <> 'answering' เดิมกันไว้แล้วอัตโนมัติ ไม่ต้องแก้ฟังก์ชันนี้)
-- ============================================================

-- ============================================================
-- 4) pvp_gc_round_timeouts — ไม่ต้องแก้ (where phase = 'answering' and round_deadline is not null
--    อยู่แล้ว) — แมตช์ที่ค้างใน card_ready (round_deadline null) จะไม่ถูก resolve เป็นหมดเวลา
--    ยังโดน pvp_gc() ผ่าน timeout_at 3 วันตามเดิมถ้าไม่มีใครเปิดเลย
-- ============================================================
