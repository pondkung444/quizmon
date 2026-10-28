import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STOP_LOCK_MESSAGE, adventureLockReason, buildHomeTrail, resolveStopTap, stopTapOutcome, type HomeTrailInput, type TrailStop,
} from "../../src/lib/homeTrail.ts";
import { resolveNextAction } from "../../src/lib/nextAction.ts";

const mission = (answeredCount: number, correctCount = answeredCount) => ({
  id: "m1", answeredCount, correctCount, target: 5, category: "แรงและการเคลื่อนที่", bonusExp: 10,
});

const base: HomeTrailInput = {
  stage: 2, exp: 155, expToday: 60, dailyCap: 180, mission: mission(3),
  dungeonStatus: "invite", raidTicketCount: 0, pvpTurnCount: 0, advancedUnlocked: false, hasEverAnswered: true,
};

const STOP_FOR: Record<string, string | null> = {
  collect_evolution: "collect", daily_mission: "mission", train_to_cap: "train",
  claim_adventure: "adventure", start_adventure: "adventure", start_raid: "raid", resume_pvp: "pvp", practice: null,
};

function check(input: HomeTrailInput) {
  const trail = buildHomeTrail(input);
  const nowStops = trail.stops.filter((s) => s.status === "now");
  assert.equal(trail.nowId, STOP_FOR[trail.action.id]);
  assert.equal(nowStops.length, trail.nowId ? 1 : 0);
  if (trail.nowId) assert.equal(nowStops[0].id, trail.nowId);
  if (!input.advancedUnlocked) {
    for (const s of trail.stops.filter((x) => x.id === "adventure" || x.id === "raid")) {
      assert.equal(s.status, "locked", `${s.id} must stay locked`);
    }
  }
  return trail;
}

test("egg stage: hatch stop shown, mission is now", () => {
  const trail = check({ ...base, stage: 1, exp: 20, expToday: 20 });
  assert.equal(trail.stops[0].id, "hatch");
  assert.equal(trail.stops[0].status, "todo");
  assert.match(trail.stops[0].detail, /ตอบถูกอีก 3 ข้อ/);
  assert.equal(trail.nowId, "mission");
});

test("mission in progress is now and matches resolver id", () => {
  const trail = check(base);
  assert.equal(trail.action.id, "daily_mission");
  assert.equal(trail.action.cta, "ทำต่อ · อีก 2 ข้อ");
  assert.equal(trail.stops.find((s) => s.id === "hatch")?.status, "done");
});

test("train to cap after mission done", () => {
  const trail = check({ ...base, exp: 230, expToday: 125, mission: mission(5, 4) });
  assert.equal(trail.nowId, "train");
  assert.equal(trail.stops.find((s) => s.id === "mission")?.detail, "สำเร็จ · ถูก 4 จาก 5");
  assert.match(trail.stops.find((s) => s.id === "train")!.detail, /55 EXP/);
});

test("unlocked + claimable adventure becomes now after daily cap", () => {
  const input: HomeTrailInput = {
    ...base, stage: 3, exp: 610, expToday: 180, mission: mission(5),
    dungeonStatus: "claimable", dungeonName: "ถ้ำน้ำแข็ง", raidTicketCount: 2, pvpTurnCount: 1, advancedUnlocked: true,
  };
  const trail = check(input);
  assert.equal(trail.nowId, "adventure");
  assert.equal(trail.stops.some((s) => s.id === "hatch"), false);
  assert.equal(trail.stops.find((s) => s.id === "train")?.status, "done");
  assert.equal(trail.stops.find((s) => s.id === "raid")?.status, "todo");
});

test("stage 4 shows collect stop as now", () => {
  const trail = check({ ...base, stage: 4, exp: 905, expToday: 90, mission: mission(5), dungeonStatus: "ready", advancedUnlocked: true });
  assert.equal(trail.nowId, "collect");
  assert.equal(trail.stops[0].id, "collect");
  assert.equal(trail.action.id, "collect_evolution");
});

test("locked account never gets adventure/raid as todo even with tickets", () => {
  const trail = check({ ...base, expToday: 180, mission: mission(5), dungeonStatus: "ready", raidTicketCount: 3 });
  assert.equal(trail.nowId, null);
  assert.equal(trail.action.id, "practice");
});

test("nowId always mirrors resolver for the same state", () => {
  const input: HomeTrailInput = { ...base, expToday: 180, mission: mission(5), pvpTurnCount: 2 };
  const trail = check(input);
  const direct = resolveNextAction({ hasPet: true, expToday: 180, dailyExpCap: 180, pvpTurnCount: 2, hasEverAnswered: true, adventureOpen: false });
  assert.equal(trail.action.id, direct.id);
  assert.equal(trail.nowId, "pvp");
});

// ── กดจุดบนทาง (resolveStopTap) ──
const member = { missionId: "m1", isGuest: false };
const guest = { missionId: "m1", isGuest: true };
const stopOf = (input: HomeTrailInput, id: TrailStop["id"]) => {
  const s = buildHomeTrail(input).stops.find((x) => x.id === id);
  assert.ok(s, `${id} stop missing`);
  return s;
};
const unlockedReady: HomeTrailInput = {
  ...base, stage: 3, exp: 610, expToday: 180, mission: mission(5), advancedUnlocked: true, adventureOpen: true,
  dungeonStatus: "ready", raidTicketCount: 2,
};

test("tap: hatch opens growth sheet in todo and done", () => {
  for (const stage of [1, 2]) {
    const s = stopOf({ ...base, stage, exp: stage === 1 ? 20 : 155 }, "hatch");
    assert.deepEqual(resolveStopTap(s, member), { kind: "sheet", sheet: "growth" });
    assert.equal(stopTapOutcome(resolveStopTap(s, member)), "sheet");
  }
});

test("tap: collect uses the collect flow", () => {
  const s = stopOf({ ...base, stage: 4, exp: 905 }, "collect");
  assert.equal(s.status, "now");
  assert.deepEqual(resolveStopTap(s, member), { kind: "collect" });
});

test("tap: mission now/todo hard-navigates with id, done goes to /quiz", () => {
  const now = stopOf(base, "mission");
  assert.equal(now.status, "now");
  assert.deepEqual(resolveStopTap(now, member), { kind: "navigate", href: "/quiz?mission=m1", hard: true });
  const todo: TrailStop = { ...now, status: "todo" };
  assert.deepEqual(resolveStopTap(todo, member), { kind: "navigate", href: "/quiz?mission=m1", hard: true });
  const done = stopOf({ ...base, mission: mission(5) }, "mission");
  assert.equal(done.status, "done");
  assert.deepEqual(resolveStopTap(done, member), { kind: "navigate", href: "/quiz", hard: false });
});

test("tap: train always goes to /quiz", () => {
  for (const input of [{ ...base, mission: mission(5) }, base, unlockedReady]) {
    assert.deepEqual(resolveStopTap(stopOf(input, "train"), member), { kind: "navigate", href: "/quiz", hard: false });
  }
});

test("tap: adventure todo/wait/now goes to /adventure", () => {
  const todo = stopOf({ ...unlockedReady, raidTicketCount: 0, pvpTurnCount: 1 }, "adventure");
  const wait = stopOf({ ...unlockedReady, dungeonStatus: "traveling" }, "adventure");
  const now = stopOf({ ...unlockedReady, raidTicketCount: 0 }, "adventure");
  assert.equal(wait.status, "wait");
  assert.equal(now.status, "now");
  for (const s of [todo, wait, now]) assert.deepEqual(resolveStopTap(s, member), { kind: "navigate", href: "/adventure", hard: false });
});

test("tap: adventure/raid locked below stage 4 with no farm Qmon shows stage message", () => {
  for (const id of ["adventure", "raid"] as const) {
    const s = stopOf(base, id);
    assert.equal(s.status, "locked");
    assert.equal(s.detail, "เปิดเมื่อน้องถึงระยะ 4");
    const tap = resolveStopTap(s, member);
    assert.deepEqual(tap, { kind: "locked", message: STOP_LOCK_MESSAGE.stage, reason: "stage" });
    assert.equal(stopTapOutcome(tap), "locked_message");
  }
});

test("tap: stage 4 with no eligible farm Qmon counts as locked (adventureOpen=false)", () => {
  const input = { ...base, stage: 4, exp: 905, advancedUnlocked: true, adventureOpen: false, raidTicketCount: 3 };
  for (const id of ["adventure", "raid"] as const) {
    const s = stopOf(input, id);
    assert.equal(s.status, "locked");
    assert.equal(s.detail, "เก็บเข้าฟาร์มก่อนนะ");
    assert.deepEqual(resolveStopTap(s, member), { kind: "locked", message: STOP_LOCK_MESSAGE.collect, reason: "collect" });
  }
});

test("tap: raid todo/now goes to /raid, wait (no keys) shows keys message", () => {
  const now = stopOf({ ...unlockedReady, dungeonStatus: "traveling" }, "raid");
  assert.equal(now.status, "now");
  assert.deepEqual(resolveStopTap(now, member), { kind: "navigate", href: "/raid", hard: false });
  const todo = stopOf(unlockedReady, "raid");
  assert.equal(todo.status, "todo");
  assert.deepEqual(resolveStopTap(todo, member), { kind: "navigate", href: "/raid", hard: false });
  const wait = stopOf({ ...unlockedReady, raidTicketCount: 0 }, "raid");
  assert.equal(wait.status, "wait");
  assert.deepEqual(resolveStopTap(wait, member), { kind: "locked", message: STOP_LOCK_MESSAGE.keys, reason: "keys" });
});

test("tap: pvp always goes to /pvp, also for guest", () => {
  for (const ctx of [member, guest]) {
    for (const input of [base, { ...base, pvpTurnCount: 2 }]) {
      assert.deepEqual(resolveStopTap(stopOf(input, "pvp"), ctx), { kind: "navigate", href: "/pvp", hard: false });
    }
  }
});

test("tap: guest gets login message on adventure/raid in every status", () => {
  for (const input of [base, unlockedReady, { ...unlockedReady, raidTicketCount: 0 }]) {
    for (const id of ["adventure", "raid"] as const) {
      assert.deepEqual(resolveStopTap(stopOf(input, id), guest), { kind: "locked", message: STOP_LOCK_MESSAGE.guest, reason: "guest" });
    }
  }
});

test("lock messages stay on house wording", () => {
  for (const m of Object.values(STOP_LOCK_MESSAGE)) {
    assert.doesNotMatch(m, /คุณ|(?<!เ)ข้า|เจ้า|เธอ/); // "เข้า" ไม่นับ
    assert.doesNotMatch(m, /\p{Extended_Pictographic}/u);
  }
});

test("busy farm (dungeon ready but no eligible Qmon): now card and trail skip adventure together", () => {
  const input: HomeTrailInput = { ...base, stage: 3, exp: 610, expToday: 180, mission: mission(5), advancedUnlocked: true, adventureOpen: false, dungeonStatus: "ready" };
  const trail = check(input);
  assert.notEqual(trail.action.id, "start_adventure");
  assert.equal(trail.stops.find((s) => s.id === "adventure")?.status, "locked");
  assert.equal(check({ ...input, adventureOpen: true }).action.id, "start_adventure");
});

// ── สาเหตุที่ผจญภัย/ท้าทายล็อก (adventureLockReason → จุดบนทาง) ──
test("lock reason: derived from active run / eligible pets / stage / farm", () => {
  const r = (o: Partial<Parameters<typeof adventureLockReason>[0]>) =>
    adventureLockReason({ hasActiveRun: false, eligiblePetCount: 0, activeStage: 2, farmHasStage4: false, ...o });
  assert.equal(r({}), "stage"); // ระยะ 2 ไม่มี Qmon ในฟาร์ม
  assert.equal(r({ activeStage: 4 }), "collect"); // ระยะ 4 ยังไม่เก็บ
  assert.equal(r({ farmHasStage4: true }), "busy"); // ระยะ 2 มี Qmon ในฟาร์มแต่ไม่ว่าง / ข้อมูลไม่ครบ
  assert.equal(r({ activeStage: 4, farmHasStage4: true }), "collect"); // collect มาก่อน busy
  assert.equal(r({ eligiblePetCount: null }), "busy"); // ดึงข้อมูลไม่สำเร็จ
  assert.equal(r({ eligiblePetCount: 1 }), null);
  assert.equal(r({ hasActiveRun: true, activeStage: 4 }), null);
});

test("lock reason: trail detail, tap message and now card follow the reason", () => {
  const cases = [
    { reason: "stage", stage: 2, detail: "เปิดเมื่อน้องถึงระยะ 4" },
    { reason: "collect", stage: 4, detail: "เก็บเข้าฟาร์มก่อนนะ" },
    { reason: "busy", stage: 2, detail: "Qmon ในฟาร์มยังไม่ว่าง" },
  ] as const;
  for (const c of cases) {
    const input: HomeTrailInput = {
      ...base, stage: c.stage, exp: c.stage === 4 ? 905 : 155, expToday: 180, mission: mission(5),
      advancedUnlocked: c.reason !== "stage", dungeonStatus: c.reason === "busy" ? "ready" : "invite",
      adventureLockReason: c.reason, raidTicketCount: 0,
    };
    const trail = check(input);
    assert.notEqual(trail.action.href, "/adventure"); // ปุ่มหลักไม่พาไปหน้าที่เด้งกลับ
    for (const id of ["adventure", "raid"] as const) {
      const s = stopOf(input, id);
      assert.equal(s.status, "locked");
      assert.equal(s.lockReason, c.reason);
      assert.equal(s.detail, c.detail);
      assert.deepEqual(resolveStopTap(s, member), { kind: "locked", message: STOP_LOCK_MESSAGE[c.reason], reason: c.reason });
      assert.deepEqual(resolveStopTap(s, guest), { kind: "locked", message: STOP_LOCK_MESSAGE.guest, reason: "guest" });
    }
  }
  // null = เปิด แม้ advancedUnlocked จะบอกอย่างอื่น
  const open = stopOf({ ...base, stage: 3, advancedUnlocked: true, dungeonStatus: "ready", adventureLockReason: null }, "adventure");
  assert.notEqual(open.status, "locked");
  assert.equal(open.lockReason, undefined);
});

test("lock reason: raid picked as now by the main button shows keys, not the lock text", () => {
  const input: HomeTrailInput = {
    ...base, stage: 2, expToday: 180, mission: mission(5), advancedUnlocked: true, dungeonStatus: "ready",
    adventureLockReason: "busy", raidTicketCount: 1,
  };
  const trail = check(input);
  assert.equal(trail.action.id, "start_raid");
  const raid = stopOf(input, "raid");
  assert.equal(raid.status, "now");
  assert.equal(raid.detail, "มีกุญแจ 1 ดอก");
  assert.deepEqual(resolveStopTap(raid, member), { kind: "navigate", href: "/raid", hard: false });
  assert.equal(stopOf(input, "adventure").lockReason, "busy");
});

// ── จุดท้าทายใช้สาเหตุของตัวเอง (raidLockReason จาก getEligibleRaidPets) ──
test("raid lock: farm-busy Qmon can still raid, so raid stop opens while adventure stays busy", () => {
  const input: HomeTrailInput = {
    ...base, stage: 2, expToday: 180, mission: mission(5), advancedUnlocked: true, dungeonStatus: "ready",
    adventureLockReason: "busy", raidLockReason: null, raidTicketCount: 2,
  };
  const trail = check(input);
  assert.equal(trail.action.id, "start_raid"); // ปุ่มหลักไม่เปลี่ยน
  const adv = stopOf(input, "adventure");
  assert.equal(adv.status, "locked");
  assert.equal(adv.lockReason, "busy");
  const raid = stopOf(input, "raid");
  assert.equal(raid.status, "now");
  assert.equal(raid.lockReason, undefined);
  assert.deepEqual(resolveStopTap(raid, member), { kind: "navigate", href: "/raid", hard: false });
  // ไม่ใช่ now (มีอย่างอื่นมาก่อน) ก็ยังเปิด
  const todo = stopOf({ ...input, expToday: 60 }, "raid");
  assert.equal(todo.status, "todo");
  assert.equal(todo.detail, "มีกุญแจ 2 ดอก");
});

test("raid lock: open but no keys keeps the keys message", () => {
  const input: HomeTrailInput = { ...base, advancedUnlocked: true, adventureLockReason: "busy", raidLockReason: null, raidTicketCount: 0 };
  const raid = stopOf(input, "raid");
  assert.equal(raid.status, "wait");
  assert.deepEqual(resolveStopTap(raid, member), { kind: "locked", message: STOP_LOCK_MESSAGE.keys, reason: "keys" });
});

test("raid lock: own reason drives raid detail/message independently of adventure", () => {
  for (const reason of ["stage", "collect", "busy"] as const) {
    const input: HomeTrailInput = {
      ...base, stage: reason === "collect" ? 4 : 2, exp: reason === "collect" ? 905 : 155, advancedUnlocked: true,
      dungeonStatus: "ready", adventureLockReason: null, raidLockReason: reason, raidTicketCount: 0,
    };
    assert.notEqual(stopOf(input, "adventure").status, "locked");
    const raid = stopOf(input, "raid");
    assert.equal(raid.status, "locked");
    assert.equal(raid.lockReason, reason);
    assert.deepEqual(resolveStopTap(raid, member), { kind: "locked", message: STOP_LOCK_MESSAGE[reason], reason });
    assert.deepEqual(resolveStopTap(raid, guest), { kind: "locked", message: STOP_LOCK_MESSAGE.guest, reason: "guest" });
  }
});

test("raid lock: not passed = follows adventure lock (old behaviour)", () => {
  const input: HomeTrailInput = { ...base, adventureLockReason: "stage" };
  assert.equal(stopOf(input, "raid").lockReason, "stage");
});
