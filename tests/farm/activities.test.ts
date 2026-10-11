import { test } from "node:test";
import assert from "node:assert/strict";
import { activityTargets, thaiHour } from "../../src/lib/farm/activities.ts";
import {
  farmWalkableCells,
  farmWalkingPath,
} from "../../src/lib/farm/navigation.ts";
import type { FarmTile } from "../../src/lib/farm/world.ts";
const tiles: FarmTile[] = [
  { id: "m", kind: "meadow", x: 0, y: 0, level: 1 },
  ...(["garden", "pond", "flower", "bridge", "observatory"] as const).map(
    (kind, i) => ({ id: kind, kind, x: i + 1, y: 0, level: 1 }),
  ),
];
test("activities stay on walkable cells and observatory uses Thai nighttime", () => {
  const cells = farmWalkableCells(tiles),
    night = Date.parse("2026-10-12T12:00:00Z"),
    day = Date.parse("2026-10-12T05:00:00Z");
  assert.equal(thaiHour(night), 19);
  assert.equal(thaiHour(day), 12);
  const targets = activityTargets(tiles, cells, night);
  assert.deepEqual(
    new Set(targets.map((t) => t.activity)),
    new Set(["bench", "pond-rest", "butterflies", "bridge-cross", "stargaze"]),
  );
  for (const t of targets)
    assert.ok(farmWalkingPath(cells, { x: 1, y: 3 }, t.cell).length > 0);
  assert.equal(
    activityTargets(tiles, cells, day).some((t) => t.activity === "stargaze"),
    false,
  );
});
test("bridge activity targets follow the saved opposite ports", () => {
  const bridge = {
    id: "b",
    kind: "bridge" as const,
    x: 0,
    y: 0,
    level: 1,
    orientation: 1 as const,
  };
  const targets = activityTargets([bridge], farmWalkableCells([bridge]), 0);
  assert.deepEqual(
    targets.map((t) => t.cell),
    [
      { x: 2, y: 0 },
      { x: 2, y: 5 },
    ],
  );
});
