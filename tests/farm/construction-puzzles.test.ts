import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateConstruction,
  publicConstruction,
  validateConstruction,
  constructionAnswer,
  hintConstruction,
} from "../../src/lib/farm/construction-puzzles.ts";
test("random construction boards are solvable and keep solutions private", () => {
  for (const kind of ["construction-floor", "construction-path"] as const) {
    const variants = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const puzzle = generateConstruction(kind, seed);
      assert.equal(
        validateConstruction(puzzle, { layout: puzzle.solution }).ok,
        true,
        `${kind}:${seed}`,
      );
      const view = JSON.stringify(publicConstruction(puzzle));
      variants.add(view);
      assert.ok(!view.includes('"seed"') && !view.includes('"solution"'));
    }
    assert.ok(variants.size > 10);
  }
});
test("locked starter is required and invalid drafts fail safely", () => {
  const puzzle = generateConstruction("construction-floor", 17445);
  if (puzzle.kind !== "construction-floor") throw Error("type");
  assert.equal(
    validateConstruction(puzzle, {
      layout: puzzle.solution.filter((p) => p.id !== puzzle.fixed.id),
    }).ok,
    false,
  );
  for (const value of [
    null,
    {},
    [],
    { layout: [null] },
    { layout: [{ id: "sun", x: NaN, y: 0, rotation: 0 }] },
    { layout: [{ id: "bogus", x: 0, y: 0, rotation: 0 }] },
  ]) {
    assert.equal(constructionAnswer(puzzle, value), null);
    assert.equal(validateConstruction(puzzle, value).ok, false);
    for (const tier of [1, 2, 3] as const)
      assert.doesNotThrow(() => hintConstruction(puzzle, value, tier));
  }
});
test("geometrically equivalent locked rotations and valid alternative floors are accepted", () => {
  for (let seed = 0; seed < 50; seed++) {
    const p = generateConstruction("construction-floor", seed);
    if (p.kind !== "construction-floor") throw Error("type");
    const solution = p.solution.map((tile) => ({
      ...tile,
      rotation:
        tile.id === p.fixed.id ? (tile.rotation + 2) % 4 : tile.rotation,
    }));
    assert.equal(validateConstruction(p, { layout: solution }).ok, true);
  }
});
