import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_NOTE,
  effectNote,
  endedReasonText,
  floatingNumbers,
  formatClock,
  hpPercent,
  narrateRound,
  outcomeHeadline,
  phaseHeadline,
  phaseTotalMs,
  roundBadges,
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

// ---- เฟส 5a ----------------------------------------------------------------

test("floats: ทีมรับ −damage และ +heal_defender; ทีมโจมตี −self_damage และ +heal_self", () => {
  const f = floatingNumbers(round({ attacker_team: "a", damage: 40, heal_defender: 7, self_damage: 5, heal_self: 9 }));
  const by = (team: string, text: string) => f.find((x) => x.team === team && x.text === text);
  assert.equal(by("b", "−40")?.tone, "hurt");
  assert.equal(by("b", "+7")?.tone, "heal");
  assert.equal(by("a", "−5")?.tone, "hurt");
  assert.equal(by("a", "+9")?.tone, "heal");
  assert.equal(f.length, 4);
  assert.equal(new Set(f.map((x) => x.id)).size, 4); // id ไม่ซ้ำ (ใช้เป็น React key)
});

test("floats: ค่าเป็น 0 ไม่ลอย; ฝั่งทีมสลับตามผู้โจมตี", () => {
  assert.deepEqual(floatingNumbers(round({ damage: 0, heal_defender: 0, self_damage: 0, heal_self: 0 })), []);
  const f = floatingNumbers(round({ attacker_team: "b", damage: 12, self_damage: 0, heal_self: 0 }));
  assert.equal(f.length, 1);
  assert.equal(f[0].team, "a");
  assert.equal(f[0].text, "−12");
});

test("badges: คริติคอล/เจาะเกราะบนทีมรับ ไม่ใช่เลขลอย", () => {
  assert.deepEqual(roundBadges(round({ crit: true, damage: 30, pierce: 4 })), [
    { team: "b", text: "คริติคอล!" },
    { team: "b", text: "เจาะเกราะ" },
  ]);
  assert.deepEqual(roundBadges(round({ crit: true, damage: 0 })), []);
  assert.deepEqual(roundBadges(round({ crit: false, pierce: 0 })), []);
  const f = floatingNumbers(round({ crit: true, pierce: 4, damage: 30 }));
  assert.ok(f.every((x) => /^[−+]\d+$/.test(x.text)));
});

test("ended: stale_timeout / room_ended มีข้อความ โทนไม่ลงโทษ", () => {
  assert.equal(endedReasonText("stale_timeout"), "เกมจบเพราะไม่มีความเคลื่อนไหวนาน");
  assert.equal(endedReasonText("room_ended"), "ห้องเรียนปิดแล้ว");
  assert.equal(endedReasonText(null), null);
});

import { readFileSync } from "node:fs";
import { toCentralView as toView } from "../../src/lib/teamBattle/types.ts";

const FORBIDDEN_WORDS = /แพ้|ผิดพลาด|ล้มเหลว|ตอบผิด/;

test("ข้อความใหม่ทั้งหมดของ 5a ไม่มีคำต้องห้าม", () => {
  const texts: string[] = [
    endedReasonText("stale_timeout") ?? "",
    endedReasonText("room_ended") ?? "",
    ...floatingNumbers(round({ damage: 9, heal_defender: 2, self_damage: 3, heal_self: 4 })).map((x) => x.text),
    ...roundBadges(round({ crit: true, pierce: 2 })).map((x) => x.text),
  ];
  for (const t of texts) assert.ok(!FORBIDDEN_WORDS.test(t), t);
});

test("view-model จอกลางเต็มรูปไม่มี user_id/username/display_name/commander_user_id", () => {
  const state = {
    battle: { id: "b", status: "active", phase: "answering", current_round: 2, attacker_team: "a" },
    round: { commander_user_id: "u-9", defenders_total: 5, answered: 2, card: null },
    last_round: round(),
    server_now: "2026-10-06T00:00:00Z",
  } as unknown as BattleState;
  const json = JSON.stringify(toView(state));
  for (const k of ["user_id", "username", "display_name", "commander_user_id"]) assert.ok(!json.includes(k), k);
});

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ""))
    .join(" ");
}

test("ไฟล์จอกลาง/TV ไม่มีของต้องห้าม (เฉลย/คำถามตรง/ชื่อรายคน) และข้อความที่ผู้ใช้เห็นไม่มีคำต้องห้าม", () => {
  const files = [
    "src/app/teacher/[sessionId]/battle/BattleCentral.tsx",
    "src/app/teacher/[sessionId]/battle/tv/BattleTvClient.tsx",
    "src/app/teacher/[sessionId]/battle/tv/page.tsx",
    "src/lib/teamBattle/central.ts",
  ];
  for (const f of files) {
    const code = stripComments(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
    for (const bad of ["correct_index", "hintTh", '.from("questions")', "rosterDisplayName", "commander_user_id", "username"]) {
      assert.ok(!code.includes(bad), `${f}: ${bad}`);
    }
    assert.ok(!FORBIDDEN_WORDS.test(code), `${f}: คำต้องห้าม`);
  }
});

test("โหมด TV: ไม่เรียก ticker และไม่มีปุ่มจบเกม/ชื่อรายคน", () => {
  const code = stripComments(
    readFileSync(new URL("../../src/app/teacher/[sessionId]/battle/tv/BattleTvClient.tsx", import.meta.url), "utf8")
  );
  assert.ok(!code.includes("useTeamBattleTicker"));
  assert.ok(!code.includes("teacherRpc"));
  assert.ok(!code.includes("TeamSplitPanel"));
  assert.ok(code.includes("readOnly"));
});

// ---- preview dev-only (เฟส 5a) ---------------------------------------------

import {
  PREVIEW_EFFECTS,
  PREVIEW_OUTCOMES,
  PREVIEW_REASONS,
  PREVIEW_SCENARIOS,
  buildPreviewView,
  isBattlePreviewEnabled,
  parsePreviewParams,
} from "../../src/lib/teamBattle/previewFixtures.ts";

test("preview: เปิดได้เฉพาะ non-production + RAID_CARD_PREVIEW=true", () => {
  assert.equal(isBattlePreviewEnabled("development", "true"), true);
  assert.equal(isBattlePreviewEnabled(undefined, "true"), true);
  assert.equal(isBattlePreviewEnabled("production", "true"), false);
  assert.equal(isBattlePreviewEnabled("development", undefined), false);
  assert.equal(isBattlePreviewEnabled("development", "1"), false);
});

test("preview: parse พารามิเตอร์ปลอดภัย (ค่าแปลก = ค่าเริ่มต้น, effect=none = null)", () => {
  assert.equal(parsePreviewParams({ scenario: "result" }).scenario, "result");
  assert.equal(parsePreviewParams({ scenario: "evil" }).scenario, "answering");
  assert.equal(parsePreviewParams({ effect: "none" }).effect, null);
  assert.equal(parsePreviewParams({ effect: "haste" }).effect, "haste");
  assert.equal(parsePreviewParams({ reason: "room_ended" }).reason, "room_ended");
  assert.equal(parsePreviewParams({ outcome: ["draw", "a_win"] }).outcome, "draw");
});

test("preview: fixture ทุกสถานะไม่มี user_id/username/display_name/commander_user_id", () => {
  for (const scenario of PREVIEW_SCENARIOS.map((s) => s.id))
    for (const effect of [null, ...PREVIEW_EFFECTS])
      for (const outcome of PREVIEW_OUTCOMES)
        for (const reason of PREVIEW_REASONS) {
          const json = JSON.stringify(buildPreviewView({ scenario, effect, outcome, reason }));
          for (const k of ["user_id", "username", "display_name", "commander_user_id"]) assert.ok(!json.includes(k), k);
        }
});

test("preview: ผลยกจำลองให้เลขลอยครบ 4 แบบ + ป้ายคริ/เจาะเกราะ", () => {
  const v = buildPreviewView({ scenario: "result", effect: null, outcome: "a_win", reason: "hp_zero" });
  assert.ok(v.last_round);
  assert.equal(floatingNumbers(v.last_round).length, 4);
  assert.equal(roundBadges(v.last_round).length, 2);
  const early = buildPreviewView({ scenario: "result", effect: null, outcome: "a_win", reason: "hp_zero" }, { lastRoundNo: 3 });
  assert.equal(early.last_round?.round_no, 3); // ไว้เล่นซ้ำ: round_no เปลี่ยน → แอนิเมชันเล่น
});

test("preview: route เรียก notFound ตาม flag, ไม่เรียก RPC/Supabase/ticker, ไม่มีคำต้องห้าม", () => {
  const read = (f: string) => stripComments(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
  const page = read("src/app/teacher/preview/battle/page.tsx");
  assert.ok(page.includes("isBattlePreviewEnabled(process.env.NODE_ENV, process.env.RAID_CARD_PREVIEW)"));
  assert.ok(/!isBattlePreviewEnabled\([^)]*\)\)\s*notFound\(\)/.test(page));
  for (const f of [
    "src/app/teacher/preview/battle/page.tsx",
    "src/app/teacher/preview/battle/BattlePreviewClient.tsx",
    "src/lib/teamBattle/previewFixtures.ts",
  ]) {
    const code = read(f);
    for (const bad of ["supabase", "teacherRpc", "viewerRpc", "useTeamBattleTicker", "useTeamBattleState", "rosterDisplayName", "correct_index"]) {
      assert.ok(!code.includes(bad), `${f}: ${bad}`);
    }
    assert.ok(!FORBIDDEN_WORDS.test(code), `${f}: คำต้องห้าม`);
  }
  const mw = read("src/lib/supabase/middleware.ts");
  assert.ok(mw.includes('NODE_ENV !== "production" && process.env.RAID_CARD_PREVIEW === "true"'));
  assert.ok(mw.includes('"/teacher/preview/battle"'));
});
