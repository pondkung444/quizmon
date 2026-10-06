import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_NOTE,
  effectNote,
  endedReasonText,
  formatClock,
  hpPercent,
  narrateRound,
  outcomeHeadline,
  phaseHeadline,
  phaseTotalMs,
  timeLeftFraction,
} from "../../src/lib/teamBattle/central.ts";
import type { RoundResult } from "../../src/lib/teamBattle/types.ts";

const round = (o: Partial<RoundResult> = {}): RoundResult => ({
  round_no: 3,
  attacker_team: "a",
  card_id: "c",
  effect_id: null,
  defenders_total: 10,
  correct_count: 6,
  wrong_count: 3,
  no_answer_count: 1,
  damage: 40,
  crit: false,
  effect_triggered: false,
  self_damage: 0,
  heal_self: 0,
  heal_defender: 0,
  pierce: 0,
  hp_a_after: 100,
  hp_b_after: 60,
  timed_out: false,
  resolved_at: "2026-10-05T00:00:00Z",
  ...o,
});

test("central: hpPercent ปลอดภัยกับ null/ศูนย์/เกิน", () => {
  assert.equal(hpPercent(50, 200), 25);
  assert.equal(hpPercent(null, null), 0);
  assert.equal(hpPercent(500, 100), 100);
  assert.equal(hpPercent(-5, 100), 0);
});

test("central: formatClock", () => {
  assert.equal(formatClock(61_000), "1:01");
  assert.equal(formatClock(-3), "0:00");
  assert.equal(formatClock(Infinity), "–");
  assert.equal(formatClock(14_100), "0:15");
});

test("central: ความยาวช่วงตรงกับ DB (haste = ครึ่งหนึ่ง ขั้นต่ำ 5 วิ)", () => {
  const cfg = { pick_seconds: 15, answer_seconds: 30 };
  assert.equal(phaseTotalMs(cfg, "picking", null), 15_000);
  assert.equal(phaseTotalMs(cfg, "answering", null), 30_000);
  assert.equal(phaseTotalMs(cfg, "answering", "haste"), 15_000);
  assert.equal(phaseTotalMs({ ...cfg, answer_seconds: 10 }, "answering", "haste"), 5_000);
  assert.equal(phaseTotalMs(cfg, null, null), 0);
  assert.equal(timeLeftFraction(7_500, 15_000), 0.5);
  assert.equal(timeLeftFraction(99_999, 15_000), 1);
  assert.equal(timeLeftFraction(-1, 15_000), 0);
  assert.equal(timeLeftFraction(1000, 0), 0);
});

test("central: หัวข้อช่วงเกมระบุทีม ไม่ระบุคน", () => {
  assert.equal(phaseHeadline("a", "picking"), "ผู้บัญชาการทีม Aกำลังเลือกการ์ด");
  assert.equal(phaseHeadline("a", "answering"), "ทีม Bกำลังตอบคำถาม");
  assert.equal(phaseHeadline(null, null), "กำลังเตรียมยกต่อไป");
});

test("central: narrateRound มีเฉพาะตัวเลขรวม + แถบสัดส่วนรวม 100", () => {
  const n = narrateRound(round({ crit: true, effect_id: "lifesteal", heal_self: 12 }));
  assert.match(n.lines[0], /ทีม Bโดน 40 \(คริติคอล!\)/);
  assert.ok(n.lines.some((l) => l.includes("ทีม Aได้พลังชีวิตคืน 12")));
  assert.ok(Math.abs(n.split.correct + n.split.wrong + n.split.none - 100) < 1e-9);
});

test("central: รับมือครบ = ชื่นชม; หมดเวลาแจ้งเบา ๆ", () => {
  const n = narrateRound(round({ damage: 0, wrong_count: 0, no_answer_count: 0, correct_count: 10 }));
  assert.match(n.lines[0], /รับมือได้ครบ/);
  const t = narrateRound(round({ timed_out: true, no_answer_count: 2 }));
  assert.ok(t.lines.some((l) => l.includes("หมดเวลา")));
});

test("central: ข้อความทั้งหมดไม่มีคำว่าแพ้/ผิดพลาด/ล้มเหลว", () => {
  const texts: string[] = [
    ...Object.values(EFFECT_NOTE),
    outcomeHeadline("a_win", false),
    outcomeHeadline("b_win", false),
    outcomeHeadline("draw", false),
    outcomeHeadline(null, true),
    endedReasonText("hp_zero") ?? "",
    endedReasonText("time_up") ?? "",
    endedReasonText("host_ended") ?? "",
    ...narrateRound(round({ self_damage: 5, heal_defender: 3, timed_out: true })).lines,
  ];
  for (const t of texts) assert.ok(!/แพ้|ผิดพลาด|ล้มเหลว|ตอบผิด/.test(t), t);
  assert.equal(effectNote(null), null);
  assert.equal(effectNote("nope"), null);
});

import { toCentralView, type BattleState } from "../../src/lib/teamBattle/types.ts";

test("central: toCentralView ตัด commander_user_id ออก และไม่มี user_id ใดๆ เหลือ", () => {
  const state = {
    battle: { id: "b", status: "active", phase: "picking", current_round: 1 },
    round: { commander_user_id: "u-1", defenders_total: 4, answered: 0, card: null },
    last_round: null,
    server_now: "2026-10-05T00:00:00Z",
  } as unknown as BattleState;
  const v = toCentralView(state);
  assert.ok(!("commander_user_id" in v.round));
  assert.ok(!JSON.stringify(v).includes("user_id"));
  assert.equal(v.round.answered, 0);
  assert.ok("commander_user_id" in state.round); // ต้นฉบับไม่ถูกแก้
});
