import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FARM, type FarmTile } from "../../src/lib/farm/world.ts";
import {
  validateFarmLayout,
  previewFarmMove,
} from "../../src/lib/farm/layout.ts";
import {
  farmWalkableCells,
  farmWalkingPath,
} from "../../src/lib/farm/navigation.ts";
const bridge: FarmTile = {
  id: "bridge",
  kind: "bridge",
  x: 2,
  y: 0,
  level: 1,
  orientation: 0,
};
const far: FarmTile = { id: "far", kind: "pond", x: 3, y: 0, level: 1 };
test("bridge joins only its opposite ports and permits expansion at the free end", () => {
  assert.equal(validateFarmLayout([...INITIAL_FARM, bridge]).valid, true);
  assert.equal(validateFarmLayout([...INITIAL_FARM, bridge, far]).valid, true);
  assert.equal(
    validateFarmLayout([...INITIAL_FARM, { ...bridge, orientation: 1 }, far])
      .valid,
    false,
  );
  assert.equal(
    validateFarmLayout([...INITIAL_FARM, { ...bridge, y: 1 }, far]).valid,
    false,
  );
});
test("movement rejects overlaps and disconnected areas without mutating the saved layout", () => {
  const tiles = [...INITIAL_FARM, bridge, far],
    original = JSON.stringify(tiles);
  assert.equal(previewFarmMove(tiles, "far", 2, 0).valid, false);
  assert.equal(previewFarmMove(tiles, "bridge", 2, 1).valid, false);
  assert.equal(previewFarmMove(INITIAL_FARM, "egg-storage", 0, -1).valid, true);
  assert.equal(JSON.stringify(tiles), original);
});
test("Qmon cross the real bridge corridor and cannot exit through its sides", () => {
  const cells = farmWalkableCells([...INITIAL_FARM, bridge, far]);
  const path = farmWalkingPath(cells, { x: 11, y: 2 }, { x: 18, y: 2 });
  assert.ok(path.length > 0);
  for (const cell of path.filter((c) => c.x >= 12 && c.x < 18))
    assert.ok(cell.y === 2 || cell.y === 3);
  assert.equal(cells.has("14,0"), false);
  assert.equal(cells.has("14,5"), false);
  const vertical = farmWalkableCells([
    ...INITIAL_FARM,
    { ...bridge, orientation: 1 },
  ]);
  assert.equal(
    farmWalkingPath(vertical, { x: 11, y: 2 }, { x: 14, y: 2 }).length,
    0,
  );
});

 test("layout translation does not inflate the camera canvas",async()=>{const {farmGeometry}=await import("../../src/lib/farm/isometric.ts");const original=farmGeometry(INITIAL_FARM,360),moved=farmGeometry(INITIAL_FARM.map(t=>({...t,x:t.x+1000,y:t.y+1000})),360);assert.equal(moved.width,original.width);assert.equal(moved.height,original.height);});
