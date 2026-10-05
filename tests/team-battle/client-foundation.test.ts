import test from "node:test";
import assert from "node:assert/strict";
import { createClockEstimator } from "../../src/lib/teamBattle/useServerClock.ts";
import { explainBattleError, explainCheck } from "../../src/lib/teamBattle/errors.ts";

test("clock: ไม่มีตัวอย่าง = offset 0, deadline ว่าง = Infinity", () => {
  const c = createClockEstimator();
  assert.equal(c.offsetMs(), 0);
  assert.equal(c.msUntil(null), Infinity);
  assert.equal(c.serverNow(1000), 1000);
});

test("clock: เลือกตัวอย่างที่ RTT ต่ำสุด", () => {
  const c = createClockEstimator();
  // เซิร์ฟเวอร์เร็วกว่าเครื่อง 5000 ms จริง
  c.recordSample({ t0: 0, t1: 2000, serverNow: 1000 + 5000 }); // rtt 2000 → offset 5000 (กลางทาง)
  c.recordSample({ t0: 10_000, t1: 10_100, serverNow: 10_050 + 5000 }); // rtt 100 → offset 5000
  c.recordSample({ t0: 20_000, t1: 20_900, serverNow: 20_000 + 5000 }); // rtt 900 offset 4550 (เอียง)
  assert.equal(c.offsetMs(), 5000);
  assert.equal(c.sampleCount(), 3);
});

test("clock: เก็บแค่ 5 ตัวอย่างล่าสุด และ msUntil ตามเวลาเซิร์ฟเวอร์", () => {
  const c = createClockEstimator(5);
  for (let i = 0; i < 8; i++) c.recordSample({ t0: i * 1000, t1: i * 1000 + 100, serverNow: i * 1000 + 50 + 2000 });
  assert.equal(c.sampleCount(), 5);
  assert.equal(c.offsetMs(), 2000);
  const deadline = new Date(12_000).toISOString();
  assert.equal(c.msUntil(deadline, 9_000), 1000); // server now = 11000
  assert.ok(c.msUntil(deadline, 11_000) < 0);
});

test("clock: ตัวอย่างเสียถูกข้าม", () => {
  const c = createClockEstimator();
  c.recordSample({ t0: 5, t1: 1, serverNow: 100 });
  c.recordSample({ t0: 0, t1: 10, serverNow: "not a date" });
  assert.equal(c.sampleCount(), 0);
});

test("errors: จัดหมวดตามรายงาน ข้อ 16", () => {
  assert.equal(explainBattleError({ message: "invalid_card" }).kind, "silent");
  assert.equal(explainBattleError({ message: "already_answered" }).kind, "silent");
  assert.equal(explainBattleError({ message: "round_closed" }).kind, "soft");
  assert.equal(explainBattleError({ message: "not_answering" }).kind, "soft");
  assert.equal(explainBattleError({ message: "not_enough_questions" }).kind, "blocking");
  assert.equal(explainBattleError({ message: "classroom_activity_busy" }).kind, "blocking");
  assert.equal(explainBattleError({ message: "invalid_config_chapters" }).kind, "blocking");
  assert.equal(explainBattleError(new Error("whatever")).kind, "soft");
  assert.equal(explainBattleError(null).kind, "soft");
});

test("errors: cannot_start ดึงข้อความของ check มาให้", () => {
  const e = explainBattleError({ message: 'cannot_start: ["team_too_small","mixed_band"]' });
  assert.equal(e.kind, "blocking");
  assert.match(e.message, /ผู้เล่นอย่างน้อย 2 คน/);
  assert.match(e.message, /ต่างช่วงชั้น/);
});

test("errors: ข้อความไม่มีคำว่าแพ้/ผิดพลาด", () => {
  const codes = ["invalid_card","already_answered","round_closed","not_answering","not_picking","battle_not_active","not_a_defender","invalid_answer","not_enough_questions","classroom_activity_busy","battle_not_in_setup","invalid_team","invalid_swap","member_not_found","not_authorized_or_not_found","not_authenticated","invalid_config_subject"];
  for (const c of codes) {
    const m = explainBattleError({ message: c }).message;
    assert.ok(!/แพ้|ผิดพลาด|ล้มเหลว/.test(m), `${c}: ${m}`);
  }
  for (const c of ["team_too_small","mixed_band","questions_block","team_size_diff","questions_low"] as const) {
    assert.ok(explainCheck(c).length > 0);
  }
});
