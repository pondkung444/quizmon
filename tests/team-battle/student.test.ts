import test from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERED_POLL_BASE_MS,
  OVERLAY_INITIAL,
  RESULT_OVERLAY_MS,
  allStudentTexts,
  answerFeedback,
  answeredPollDelay,
  chooseScreen,
  deriveRole,
  filterHand,
  overlayVisible,
  reduceOverlay,
  shouldRedirectToBattle,
  type HandRow,
} from "../../src/lib/teamBattle/student.ts";
import type { MyAnswer, MyMember } from "../../src/lib/teamBattle/types.ts";

const ME = "me";
const player = (team: "a" | "b"): MyMember => ({ team, is_player: true, commander_order: 1 });

// ---- deriveRole ----

test("role: ผู้บัญชาการ = ผู้เล่นทีมโจมตีที่ id ตรง commander_user_id", () => {
  const r = deriveRole({ myId: ME, member: player("a"), attackerTeam: "a", commanderUserId: ME });
  assert.deepEqual(r, { team: "a", isPlayer: true, isCommander: true, isAttackerTeam: true, isDefender: false });
});

test("role: ทีมโจมตีที่ไม่ใช่ผู้บัญชาการ", () => {
  const r = deriveRole({ myId: ME, member: player("a"), attackerTeam: "a", commanderUserId: "other" });
  assert.equal(r.isCommander, false);
  assert.equal(r.isAttackerTeam, true);
  assert.equal(r.isDefender, false);
});

test("role: ผู้เล่นทีมรับ", () => {
  const r = deriveRole({ myId: ME, member: player("b"), attackerTeam: "a", commanderUserId: "other" });
  assert.equal(r.isDefender, true);
  assert.equal(r.isAttackerTeam, false);
});

test("role: ไม่มีแถวสมาชิก = ผู้ชม (ไม่ใช่ผู้บัญชาการ/ผู้ตอบแม้ id ตรง)", () => {
  const r = deriveRole({ myId: ME, member: null, attackerTeam: "a", commanderUserId: ME });
  assert.deepEqual(r, { team: null, isPlayer: false, isCommander: false, isAttackerTeam: false, isDefender: false });
});

test("role: is_player=false = ผู้ชม แต่ยังรู้ทีมตัวเอง", () => {
  const r = deriveRole({
    myId: ME,
    member: { team: "b", is_player: false, commander_order: null },
    attackerTeam: "a",
    commanderUserId: ME,
  });
  assert.equal(r.team, "b");
  assert.equal(r.isPlayer, false);
  assert.equal(r.isCommander, false);
  assert.equal(r.isDefender, false);
});

// ---- chooseScreen ----

const roleOf = (m: MyMember | null, att: "a" | "b" | null, cmd: string | null) =>
  deriveRole({ myId: ME, member: m, attackerTeam: att, commanderUserId: cmd });

test("screen: ตารางหน้าจอครบทุกแถว", () => {
  const pick = (status: "setup" | "active" | "finished" | "abandoned", phase: "picking" | "answering" | null, role: ReturnType<typeof roleOf>, answered = false) =>
    chooseScreen({ status, phase, role, answeredThisRound: answered });

  assert.equal(pick("setup", null, roleOf(player("a"), null, null)), "waiting_setup");
  assert.equal(pick("active", "picking", roleOf(null, "a", null)), "spectator");
  assert.equal(pick("active", "answering", roleOf({ team: "a", is_player: false, commander_order: null }, "b", null)), "spectator");
  assert.equal(pick("active", "picking", roleOf(player("a"), "a", ME)), "commander_pick");
  assert.equal(pick("active", "picking", roleOf(player("a"), "a", "x")), "wait_pick_attacker");
  assert.equal(pick("active", "picking", roleOf(player("b"), "a", "x")), "wait_pick_defender");
  assert.equal(pick("active", "answering", roleOf(player("b"), "a", "x")), "answer");
  assert.equal(pick("active", "answering", roleOf(player("b"), "a", "x"), true), "answered_wait");
  assert.equal(pick("active", "answering", roleOf(player("a"), "a", "x")), "attacker_watch");
  assert.equal(pick("active", "answering", roleOf(player("a"), "a", ME)), "attacker_watch");
  assert.equal(pick("active", null, roleOf(player("a"), "a", "x")), "preparing");
  assert.equal(pick("finished", null, roleOf(player("a"), "a", "x")), "ended");
  assert.equal(pick("abandoned", null, roleOf(null, null, null)), "ended");
});

// ---- มือการ์ด ----

const row = (id: string, round_no: number, played_at: string | null): HandRow => ({
  id,
  round_no,
  played_at,
  chapter: "บท",
  subject: "math",
  difficulty: 2,
  effect_id: null,
});

test("hand: ตัดการ์ดยกเก่าและใบที่ played_at ไม่ว่างออก", () => {
  const out = filterHand(
    [row("old", 1, null), row("played", 2, "2026-10-05T00:00:00Z"), row("ok1", 2, null), row("ok2", 2, null), row("future", 3, null)],
    2
  );
  assert.deepEqual(out.map((c) => c.id), ["ok1", "ok2"]);
  assert.ok(!("round_no" in out[0]) && !("played_at" in out[0]));
});

// ---- redirect lobby ----

test("lobby: setup/active = พาเข้า; finished/abandoned/ไม่พบ = ไม่พา (กันลูป)", () => {
  assert.equal(shouldRedirectToBattle("setup"), true);
  assert.equal(shouldRedirectToBattle("active"), true);
  assert.equal(shouldRedirectToBattle("finished"), false);
  assert.equal(shouldRedirectToBattle("abandoned"), false);
  assert.equal(shouldRedirectToBattle(null), false);
  assert.equal(shouldRedirectToBattle(undefined), false);
});

// ---- overlay ----

test("overlay: โหลดครั้งแรกไม่โชว์ (แม้มี last_round อยู่แล้ว)", () => {
  const s = reduceOverlay(OVERLAY_INITIAL, 7, 1000);
  assert.equal(s.seen, 7);
  assert.equal(overlayVisible(s, 1000), false);
  assert.equal(reduceOverlay(s, 7, 2000), s); // ไม่เปลี่ยน = state เดิม
});

test("overlay: round_no เปลี่ยน = โชว์ แล้วหมดใน ~3.5 วิ", () => {
  let s = reduceOverlay(OVERLAY_INITIAL, 7, 1000);
  s = reduceOverlay(s, 8, 5000);
  assert.equal(overlayVisible(s, 5000), true);
  assert.equal(overlayVisible(s, 5000 + RESULT_OVERLAY_MS - 1), true);
  assert.equal(overlayVisible(s, 5000 + RESULT_OVERLAY_MS), false);
});

test("overlay: เกมแรกที่ยังไม่มีผลยก แล้วมีผลยกแรก = โชว์", () => {
  let s = reduceOverlay(OVERLAY_INITIAL, null, 0);
  s = reduceOverlay(s, 1, 3000);
  assert.equal(overlayVisible(s, 3001), true);
});

test("feedback: เฉพาะของตัวเอง ไม่มีเฉลย", () => {
  const a = (o: Partial<MyAnswer>): MyAnswer => ({ round_no: 1, answer_index: 0, is_correct: true, timed_out: false, ...o });
  assert.equal(answerFeedback(null), null);
  assert.equal(answerFeedback(a({})), "ข้อนี้คุณตอบถูก");
  assert.equal(answerFeedback(a({ is_correct: false })), "ข้อนี้ยังไม่ถูก ลุยข้อต่อไป!");
  assert.match(answerFeedback(a({ is_correct: false, timed_out: true, answer_index: null })) ?? "", /หมดเวลา/);
});

test("poll: ~4 วิ ± 1 วิ", () => {
  assert.equal(answeredPollDelay(0.5), ANSWERED_POLL_BASE_MS);
  assert.equal(answeredPollDelay(0), 3000);
  assert.ok(answeredPollDelay(0.999999) < 5000);
});

// ---- ข้อความ ----

test("ข้อความฝั่งนักเรียนไม่มีคำว่าแพ้/ผิดพลาด/ล้มเหลว/ตอบผิด", () => {
  for (const t of allStudentTexts()) assert.ok(!/แพ้|ผิดพลาด|ล้มเหลว|ตอบผิด/.test(t), t);
});
