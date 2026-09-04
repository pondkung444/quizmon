-- Migration: 20260904140000_pvp_damage_tuning_1
-- ระบบ "ประลอง" (PvP) — จูนดาเมจรอบ 1: base_mult 0.10 -> 0.55
--
-- feedback หลัง playtest จริง: แมตช์ทน (tanky) เกินไป — ฝ่ายแพ้ควรตายภายใน ~3-5 ข้อที่ตอบผิด
-- sim กับ stat จริงของ Qmon stage 4 40 ตัว (stat_hp/atk/def/foc/spd จริงบน prod):
--   base_mult 0.10 -> median wrong-answers-to-kill = 20  (ตรงกับคำบ่น "อ่อนไป")
--   base_mult 0.55 -> median = 4 (25-75th = 2-7)  ← เลือกอันนี้
--
-- เปลี่ยนค่าคงที่บรรทัดเดียวใน _pvp_resolve_round: v_base := round(10*v_atk/100.0) -> round(v_atk*0.55)
-- ที่เหลือไม่แตะ — DEF reduction (1-DEF/200), crit x1.5, high_stake/lifesteal/pierce/reprisal
-- อ้าง v_base จึงสเกลตามสัดส่วนเองอัตโนมัติ
--
-- ผลข้างเคียงที่เจ้าของโปรดักต์เซ็นอนุมัติแล้ว (ไม่ใช่การเปลี่ยนแบบเงียบ):
--   heal (v_heal_def := v_base) สเกลขึ้น ~5.5x ตามดาเมจ — ตั้งใจ ให้ swing แรงตอนติด
--
-- ยังเป็น TEMP — ถ้าหลัง playtest รอบนี้ยังรู้สึกไม่พอดี แก้ที่ค่าคงที่ตัวเดียวนี้ ไม่ต้องรื้อโครงสร้าง

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public._pvp_resolve_round(
  p_match_id uuid, p_answer_index int, p_timed_out boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_attacker uuid;
  v_defender uuid;
  v_def_pet uuid;
  v_correct int;
  v_is_correct boolean;
  v_effect text;

  v_atk int; v_foc int; v_atk_def int; v_def_def int;
  v_atk_hp_max int; v_def_hp_max int;
  v_atk_hp_now int; v_def_hp_now int;
  v_atk_hp_new int; v_def_hp_new int;

  v_base int;
  v_dmg int := 0;
  v_pierce int := 0;
  v_crit boolean := false;
  v_self_dmg int := 0;
  v_heal_self int := 0;
  v_heal_def int := 0;
  v_heal_self_applied int := 0;
  v_heal_def_applied int := 0;
  v_eff_triggered boolean := false;

  v_new_status text;
  v_new_outcome text;
  v_new_winner uuid;
begin
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;

  if v_m.status <> 'active' or v_m.phase <> 'answering' or v_m.active_card_id is null then
    return jsonb_build_object(
      'is_correct', null, 'damage', 0, 'crit', false,
      'hp_a', v_m.hp_a, 'hp_b', v_m.hp_b,
      'status', v_m.status, 'outcome', v_m.outcome, 'winner_id', v_m.winner_id,
      'current_round', v_m.current_round, 'attacker_id', v_m.attacker_id, 'phase', v_m.phase,
      'effect_id', null, 'effect_triggered', false,
      'self_damage', 0, 'heal_self', 0, 'heal_defender', 0, 'pierce', 0,
      'timed_out', p_timed_out, 'noop', true
    );
  end if;

  select * into v_card from public.pvp_match_cards where id = v_m.active_card_id;
  v_effect := v_card.effect_id;

  v_attacker := v_m.attacker_id;
  v_defender := case when v_attacker = v_m.player_a_id then v_m.player_b_id else v_m.player_a_id end;
  v_def_pet := case when v_defender = v_m.player_a_id then v_m.pet_a_id else v_m.pet_b_id end;

  select correct_index into v_correct from public.questions where id = v_card.question_id;
  if v_correct is null then raise exception 'ไม่พบคำถามนี้'; end if;

  v_is_correct := (not p_timed_out) and (p_answer_index = v_correct);

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, pvp_match_id)
  values (v_defender, v_card.question_id, v_is_correct, v_def_pet, 'pvp', p_match_id);

  if v_attacker = v_m.player_a_id then
    v_atk := (v_m.stat_a->>'atk')::int; v_foc := (v_m.stat_a->>'foc')::int;
    v_atk_def := (v_m.stat_a->>'def')::int; v_def_def := (v_m.stat_b->>'def')::int;
    v_atk_hp_max := (v_m.stat_a->>'hp')::int; v_def_hp_max := (v_m.stat_b->>'hp')::int;
  else
    v_atk := (v_m.stat_b->>'atk')::int; v_foc := (v_m.stat_b->>'foc')::int;
    v_atk_def := (v_m.stat_b->>'def')::int; v_def_def := (v_m.stat_a->>'def')::int;
    v_atk_hp_max := (v_m.stat_b->>'hp')::int; v_def_hp_max := (v_m.stat_a->>'hp')::int;
  end if;
  v_atk_hp_max := greatest(coalesce(v_atk_hp_max, 1), 1);
  v_def_hp_max := greatest(coalesce(v_def_hp_max, 1), 1);
  v_atk := coalesce(v_atk, 0); v_foc := coalesce(v_foc, 0);
  v_atk_def := coalesce(v_atk_def, 0); v_def_def := coalesce(v_def_def, 0);

  -- จูนรอบ 1 (2026-09-04): 0.10 -> 0.55 (median wrong-answers-to-kill 20 -> 4). ยัง TEMP
  v_base := round(v_atk * 0.55)::int;

  if v_is_correct then
    if v_effect = 'reprisal' then
      v_self_dmg := greatest(0, round(v_base * (1 - v_atk_def / 200.0))::int);
      v_eff_triggered := v_self_dmg > 0;
    elsif v_effect = 'pierce' then
      v_pierce := greatest(1, round(v_base * 0.3)::int);
      v_eff_triggered := true;
    elsif v_effect = 'heal' then
      v_heal_def := greatest(0, v_base);
      v_eff_triggered := v_heal_def > 0;
    end if;
  else
    v_dmg := greatest(1, round(v_base * (1 - v_def_def / 200.0))::int);
    if random() * 100 < v_foc then
      v_crit := true;
      v_dmg := round(v_dmg * 1.5)::int;
    end if;

    if v_effect = 'high_stake' then
      v_dmg := v_dmg * 2;
      v_eff_triggered := true;
    elsif v_effect = 'lifesteal' then
      v_heal_self := v_dmg;
      v_eff_triggered := true;
    end if;
  end if;

  v_def_hp_now := case when v_defender = v_m.player_a_id then v_m.hp_a else v_m.hp_b end;
  v_atk_hp_now := case when v_attacker = v_m.player_a_id then v_m.hp_a else v_m.hp_b end;

  v_heal_def_applied := least(v_heal_def, greatest(0, v_def_hp_max - v_def_hp_now));
  v_heal_self_applied := least(v_heal_self, greatest(0, v_atk_hp_max - v_atk_hp_now));

  v_def_hp_new := v_def_hp_now - v_dmg - v_pierce + v_heal_def_applied;
  v_atk_hp_new := v_atk_hp_now - v_self_dmg + v_heal_self_applied;

  if v_defender = v_m.player_a_id then
    update public.pvp_matches set hp_a = v_def_hp_new, hp_b = v_atk_hp_new where id = p_match_id;
  else
    update public.pvp_matches set hp_b = v_def_hp_new, hp_a = v_atk_hp_new where id = p_match_id;
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  if v_m.hp_a <= 0 or v_m.hp_b <= 0 then
    v_new_status := 'finished';
    if v_m.hp_a <= 0 and v_m.hp_b <= 0 then
      if v_m.hp_a > v_m.hp_b then
        v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
      elsif v_m.hp_b > v_m.hp_a then
        v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
      else
        v_new_outcome := 'draw'; v_new_winner := null;
      end if;
    elsif v_m.hp_a <= 0 then
      v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
    else
      v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
    end if;
  elsif v_m.current_round >= 30 then
    v_new_status := 'finished';
    if v_m.hp_a > v_m.hp_b then
      v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
    elsif v_m.hp_b > v_m.hp_a then
      v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
    else
      v_new_outcome := 'draw'; v_new_winner := null;
    end if;
  else
    v_new_status := 'active';
  end if;

  if v_new_status = 'finished' then
    update public.pvp_matches
      set status = 'finished', outcome = v_new_outcome, winner_id = v_new_winner,
          phase = 'assigning', active_card_id = null, round_deadline = null, last_action_at = now()
    where id = p_match_id;
  else
    update public.pvp_matches
      set attacker_id = v_defender,
          phase = 'assigning',
          active_card_id = null,
          round_deadline = null,
          current_round = current_round + 1,
          last_action_at = now(),
          timeout_at = now() + interval '3 days'
    where id = p_match_id;
    perform public._draw_pvp_hand(p_match_id, v_defender);
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'damage', v_dmg + v_pierce,
    'crit', v_crit,
    'hp_a', v_m.hp_a,
    'hp_b', v_m.hp_b,
    'status', v_m.status,
    'outcome', v_m.outcome,
    'winner_id', v_m.winner_id,
    'current_round', v_m.current_round,
    'attacker_id', v_m.attacker_id,
    'phase', v_m.phase,
    'effect_id', v_effect,
    'effect_triggered', v_eff_triggered,
    'self_damage', v_self_dmg,
    'heal_self', v_heal_self_applied,
    'heal_defender', v_heal_def_applied,
    'pierce', v_pierce,
    'defender_side', case when v_defender = v_m.player_a_id then 'a' else 'b' end,
    'attacker_side', case when v_attacker = v_m.player_a_id then 'a' else 'b' end,
    'timed_out', p_timed_out
  );
end;
$$;

revoke execute on function public._pvp_resolve_round(uuid, int, boolean) from anon, authenticated, public;

commit;

-- Rollback: create or replace ... กลับเป็น  v_base := round(10 * v_atk / 100.0)::int;
