import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHomeTrail, type HomeTrailInput } from "../../src/lib/homeTrail.ts";
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
  const direct = resolveNextAction({ hasPet: true, expToday: 180, dailyExpCap: 180, pvpTurnCount: 2, hasEverAnswered: true });
  assert.equal(trail.action.id, direct.id);
  assert.equal(trail.nowId, "pvp");
});
