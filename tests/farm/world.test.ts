import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_FARM, attachFarmTile, availableFarmPlots } from "../../src/lib/farm/world.ts";
import { farmWalkableCells, farmWalkingPath, cellKey } from "../../src/lib/farm/navigation.ts";
import { farmGeometry, projectFarmPoint } from "../../src/lib/farm/isometric.ts";
import { sampleFarmResidents } from "../../src/lib/farm/residents.ts";

const MEADOW = INITIAL_FARM.filter(tile => tile.kind === "meadow");

test("new area must connect, be empty, and keep one main school", () => {
  assert.equal(availableFarmPlots(MEADOW).length, 4);
  const school = {id:"school",kind:"school" as const,x:1,y:0,level:1};
  const tiles = attachFarmTile(MEADOW,school);
  assert.equal(tiles.length,2);
  assert.throws(()=>attachFarmTile(tiles,{...school,id:"duplicate",x:0,y:0}));
  assert.throws(()=>attachFarmTile(tiles,{...school,id:"remote",x:5,y:5}));
  assert.throws(()=>attachFarmTile(tiles,{...school,id:"second-school",x:2,y:0}));
});

test("a resident can cross into school grounds while routing around the building", () => {
  const tiles=attachFarmTile(MEADOW,{id:"school",kind:"school",x:1,y:0,level:1});
  const cells=farmWalkableCells(tiles);
  const path=farmWalkingPath(cells,{x:2,y:3},{x:11,y:5});
  assert.ok(path.length>0);
  let previous={x:2,y:3};
  for(const cell of path) {
    assert.ok(cells.has(cellKey(cell)));
    assert.equal(Math.abs(cell.x-previous.x)+Math.abs(cell.y-previous.y),1);
    assert.ok(!(cell.x>=7&&cell.x<=10&&cell.y>=1&&cell.y<=4));
    previous=cell;
  }
  assert.equal(farmWalkingPath(cells,{x:2,y:3},{x:11,y:5},new Set(['11,5'])).length,0);
});

test("map extends in negative directions and projections join at a shared edge", () => {
  const tiles=attachFarmTile(MEADOW,{id:"left",kind:"meadow",x:-1,y:0,level:1});
  const geometry=farmGeometry(tiles,360);
  const leftEdge=projectFarmPoint(0,.5,geometry);
  const rightEdge=projectFarmPoint(-1+1,.5,geometry);
  assert.deepEqual(leftEdge,rightEdge);
  const cells=farmWalkableCells(tiles);
  assert.ok(farmWalkingPath(cells,{x:1,y:3},{x:-5,y:3}).length>0);
});

test("starter destinations have blocked footprints and connected front paths", () => {
  const cells = farmWalkableCells(INITIAL_FARM);
  for (const tile of INITIAL_FARM.filter(tile => tile.kind !== "meadow")) {
    assert.equal(cells.has(cellKey({ x: tile.x * 6 + 2, y: tile.y * 6 + 2 })), false);
    assert.ok(farmWalkingPath(cells, {x:2,y:3}, {x:tile.x*6+5,y:tile.y*6+5}).length > 0);
  }
});

test("automatic residents can include any owned pet, capped without duplicates or mutation", () => {
  const owned = ["a", "b", "c", "d", "e"];
  const sampled = sampleFarmResidents(owned, 3, () => .99);
  assert.equal(sampled.length, 3);
  assert.equal(new Set(sampled).size, 3);
  assert.ok(sampled.includes("e"));
  assert.deepEqual(owned, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(sampleFarmResidents([], 3), []);
  assert.deepEqual(sampleFarmResidents(["a"], 3), ["a"]);
});
