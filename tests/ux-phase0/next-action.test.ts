import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNextAction, type NextActionState } from "../../src/lib/nextAction.ts";

const base: NextActionState = { hasPet: true, hasEverAnswered: true };

test("next-action state table follows the product priority", () => {
  assert.equal(resolveNextAction({ ...base, hasPet: false, evolutionReady: true }).id, "hatch_pet");
  assert.equal(resolveNextAction({ ...base, evolutionReady: true, mission: { id: "m", remaining: 2, bonusExp: 5 } }).id, "collect_evolution");
  assert.equal(resolveNextAction({ ...base, mission: { id: "m", remaining: 2, bonusExp: 5 }, adventureStatus: "claimable" }).id, "claim_adventure");
  assert.equal(resolveNextAction({ ...base, mission: { id: "m", remaining: 2, bonusExp: 5 }, pvpTurnCount: 2 }).id, "daily_mission");
  assert.equal(resolveNextAction({ ...base, pvpTurnCount: 2, adventureStatus: "ready" }).id, "resume_pvp");
  assert.equal(resolveNextAction({ ...base, adventureStatus: "ready", raidTicketCount: 2 }).id, "start_adventure");
  assert.equal(resolveNextAction({ ...base, raidTicketCount: 2 }).id, "start_raid");
  assert.equal(resolveNextAction(base).id, "practice");
});

test("mission recommendation carries remaining work into the CTA", () => {
  const action = resolveNextAction({ ...base, mission: { id: "mission-1", remaining: 3, bonusExp: 10 } });
  assert.equal(action.href, "/quiz?mission=mission-1");
  assert.match(action.description, /3 ข้อ/);
  assert.match(action.description, /10 EXP/);
});
