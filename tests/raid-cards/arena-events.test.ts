import test from "node:test";
import assert from "node:assert/strict";
import { createChapterBattle, resolveTurn, type ChapterBattle } from "../../src/lib/raid/cards/engine.ts";
import { raidAfterEndProps, raidAnswerProps, raidMovePickProps, raidRoundEndProps, raidRoundOutcome } from "../../src/components/raid/arena/events.ts";

const stats = { hp: 100, atk: 100, def: 100, spd: 100, foc: 100 };
const fresh = (): ChapterBattle => createChapterBattle("ridge_mist", stats, () => 0.4);

test("round outcome covers win, ko, turns and exhausted content", () => {
  assert.equal(raidRoundOutcome({ ...fresh(), outcome: "win", bossHp: 0 }), "win");
  assert.equal(raidRoundOutcome({ ...fresh(), outcome: "defeat", defeatReason: "hp", hp: 0 }), "ko");
  assert.equal(raidRoundOutcome({ ...fresh(), outcome: "defeat", defeatReason: "timeout" }), "turns");
  assert.equal(raidRoundOutcome({ ...fresh(), outcome: "defeat", defeatReason: "content" as never }), "content");
});

test("event props carry game facts only", () => {
  let b = fresh();
  assert.deepEqual(raidMovePickProps(b, "counter", "counter"), { boss: "ridge_mist", turn: 1, move: "counter", fit: true });
  assert.deepEqual(raidAnswerProps(b, "strike", false), { boss: "ridge_mist", turn: 1, move: "strike", correct: false });
  b = resolveTurn(b, "strike", () => 0.4, true) as ChapterBattle;
  b = resolveTurn(b, "mend", () => 0.4, false) as ChapterBattle;
  assert.deepEqual(raidRoundEndProps(b, null), { boss: "ridge_mist", outcome: "turns", correct: 1, answered: 2, chapterMode: "legacy" });
  assert.equal(raidRoundEndProps(b, "auto").chapterMode, "auto");
  assert.deepEqual(raidAfterEndProps(b, "replay"), { boss: "ridge_mist", action: "replay" });
  const keys = new Set([raidMovePickProps, raidAnswerProps].flatMap((f) => Object.keys(f(b, "strike", "strike" as never))));
  for (const key of keys) assert.ok(["boss", "turn", "move", "fit", "correct"].includes(key), key);
});
