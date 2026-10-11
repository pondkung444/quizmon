import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePuzzle,
  publicPuzzle,
  validatePuzzle,
  puzzleHint,
  puzzleAnswer,
} from "../../src/lib/farm/puzzle-engine.ts";
test("four public views omit private solutions and seeds", () => {
  for (const kind of ["pond", "flower", "bridge", "observatory"] as const) {
    const p = generatePuzzle(kind, 17445);
    const view = publicPuzzle(p);
    const keys = JSON.stringify(view);
    for (const key of ['"seed"', '"solution"', '"solutions"', '"needs"'])
      assert.ok(!keys.includes(key));
    assert.equal(view.version, 1);
  }
});
test("malformed and oversized drafts are rejected without throwing", () => {
  for (const kind of ["pond", "flower", "bridge", "observatory"] as const) {
    const p = generatePuzzle(kind, 17445);
    for (const value of [
      null,
      42,
      [],
      {},
      { tiles: [null], slots: [null], placements: [null], order: [null] },
      { tiles: [{}], slots: [{}], placements: [{}], order: [{}] },
    ]) {
      assert.equal(puzzleAnswer(kind, value), null);
      assert.equal(validatePuzzle(p, value).ok, false);
      for (const tier of [1, 2, 3] as const)
        assert.doesNotThrow(() => puzzleHint(p, value, tier));
    }
  }
});
test("unknown persisted content versions fail closed", () => {
  const p = generatePuzzle("pond", 1);
  p.version = 999;
  assert.throws(() => publicPuzzle(p));
  assert.equal(validatePuzzle(p, { tiles: [] }).ok, false);
  assert.throws(() => puzzleHint(p, null, 1));
});
