import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectDisplayState,
  projectOccupiesSlot,
  projectTeamAvailability,
  schoolLevel,
  queueCapacity,
} from "../../src/lib/farm/project-overview.ts";
import type { FarmProject } from "../../src/lib/farm/projects-server";
const job = (
  id: string,
  status: FarmProject["status"],
  place = "school",
  targetLevel = 2,
) =>
  ({
    id,
    status,
    ready_at: "2026-10-11T00:00:00Z",
    rules_snapshot: { place, targetLevel },
  }) as FarmProject;
test("offline finishing releases team while confirmation still occupies queue", () => {
  const p = job("one", "finishing");
  const now = Date.parse("2026-10-11T00:00:01Z");
  assert.equal(projectDisplayState(p, now).status, "ready");
  assert.equal(projectOccupiesSlot(p), true);
  assert.deepEqual(
    projectTeamAvailability(
      [p],
      [{ project_id: "one", pet_id: "pet", role: "leader" }],
      now,
    ),
    {},
  );
  assert.deepEqual(
    projectTeamAvailability(
      [p],
      [{ project_id: "one", pet_id: "pet", role: "helper" }],
      now - 2000,
    ),
    { pet: "one" },
  );
});
test("paused, puzzle and ready projects occupy queues, only active work uses pets", () => {
  for (const status of [
    "paused",
    "puzzle",
    "ready",
    "building",
    "finishing",
  ] as const)
    assert.equal(projectOccupiesSlot(job("a", status)), true);
  assert.equal(projectOccupiesSlot(job("a", "placed")), false);
  assert.deepEqual(
    projectTeamAvailability(
      [job("a", "paused"), job("b", "puzzle")],
      [
        { project_id: "a", pet_id: "first", role: "leader" },
        { project_id: "b", pet_id: "second", role: "helper" },
      ],
    ),
    { second: "b" },
  );
});
test("only confirmed school upgrades raise capacity", () => {
  const pending = job("a", "ready", "school", 4),
    placed = job("b", "placed", "school", 3);
  assert.equal(schoolLevel(true, [pending]), 1);
  assert.equal(schoolLevel(true, [placed, pending]), 3);
  assert.deepEqual(queueCapacity(1), { jobs: 1, helpers: 0 });
  assert.deepEqual(queueCapacity(4), { jobs: 3, helpers: 3 });
});
