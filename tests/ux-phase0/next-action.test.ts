import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNextAction, type NextActionState } from "../../src/lib/nextAction.ts";

const base: NextActionState = {
  hasPet: true,
  hasEverAnswered: true,
  expToday: 180,
  dailyExpCap: 180,
  advancedActivitiesUnlocked: true,
};

test("next-action state table follows the product priority", () => {
  assert.equal(resolveNextAction({ ...base, hasPet: false, evolutionReady: true }).id, "hatch_pet");
  assert.equal(resolveNextAction({ ...base, evolutionReady: true, mission: { id: "m", remaining: 2, bonusExp: 5 } }).id, "collect_evolution");
  assert.equal(resolveNextAction({ ...base, mission: { id: "m", remaining: 2, bonusExp: 5 }, adventureStatus: "claimable" }).id, "daily_mission");
  assert.equal(resolveNextAction({ ...base, mission: { id: "m", remaining: 2, bonusExp: 5 }, pvpTurnCount: 2 }).id, "daily_mission");
  assert.equal(resolveNextAction({ ...base, pvpTurnCount: 2, adventureStatus: "ready" }).id, "start_adventure");
  assert.equal(resolveNextAction({ ...base, adventureStatus: "ready", raidTicketCount: 2 }).id, "start_adventure");
  assert.equal(resolveNextAction({ ...base, raidTicketCount: 2, pvpTurnCount: 2 }).id, "start_raid");
  assert.equal(resolveNextAction({ ...base, raidTicketCount: 2 }).id, "start_raid");
  assert.equal(resolveNextAction({ ...base, pvpTurnCount: 2 }).id, "resume_pvp");
  assert.equal(resolveNextAction(base).id, "practice");
});

test("training Qmon to the daily cap comes before adventures and challenges", () => {
  const action = resolveNextAction({
    ...base,
    expToday: 125,
    adventureStatus: "claimable",
    raidTicketCount: 2,
    pvpTurnCount: 1,
  });

  assert.equal(action.id, "train_to_cap");
  assert.equal(action.href, "/quiz");
  assert.match(action.description, /125\/180 EXP/);
  assert.match(action.description, /55 EXP/);
  assert.match(action.meta, /55 EXP/);
});

test("daily mission stays ahead of training Qmon", () => {
  const action = resolveNextAction({
    ...base,
    expToday: 0,
    mission: { id: "mission-1", remaining: 3, bonusExp: 10 },
  });

  assert.equal(action.id, "daily_mission");
});

test("locked accounts are never sent to adventure or raid", () => {
  const action = resolveNextAction({
    ...base,
    advancedActivitiesUnlocked: false,
    adventureStatus: "ready",
    raidTicketCount: 2,
  });

  assert.equal(action.id, "practice");
});

test("mission recommendation carries remaining work into the CTA", () => {
  const action = resolveNextAction({ ...base, mission: { id: "mission-1", remaining: 3, bonusExp: 10 } });
  assert.equal(action.href, "/quiz?mission=mission-1");
  assert.match(action.description, /3 ข้อ/);
  assert.match(action.description, /10 EXP/);
});

test("premium daily cap (300) drives train-to-cap and capped copy", () => {
  const premium = { ...base, dailyExpCap: 300 };

  const training = resolveNextAction({ ...premium, expToday: 200 });
  assert.equal(training.id, "train_to_cap");
  assert.match(training.description, /200\/300 EXP/);
  assert.match(training.meta, /100 EXP/);

  const capped = resolveNextAction({ ...premium, expToday: 300 });
  assert.equal(capped.id, "practice");
  assert.match(capped.description, /300\/300 EXP/);
});

test("missing dailyExpCap falls back to the free cap", () => {
  const action = resolveNextAction({ ...base, dailyExpCap: undefined, expToday: 125 });
  assert.equal(action.id, "train_to_cap");
  assert.match(action.description, /125\/180 EXP/);
});
