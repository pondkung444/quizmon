import test from "node:test";
import assert from "node:assert/strict";
import { createChapterBattle, fitMove, moveHand, type CardId, type ChapterBattle, type IntentId } from "../../src/lib/raid/cards/engine.ts";

const stats = { hp: 100, atk: 100, def: 100, spd: 100, foc: 100 };
const at = (intent: IntentId, turn = 1): ChapterBattle => ({ ...createChapterBattle("ridge_mist", stats, () => 0.4), intent, turn });

test("fit move follows the boss intent", () => {
  const cases: [IntentId, CardId][] = [["claw", "counter"], ["thunder", "counter"], ["brace", "pierce"], ["charge", "interrupt"], ["recover", "focus"], ["veil", "counter"], ["pounce", "counter"]];
  for (const [intent, card] of cases) {
    assert.equal(fitMove(at(intent)), card, intent);
    assert.deepEqual(moveHand(at(intent)), ["strike", "mend", card], intent);
  }
});

test("last question: recover suggests strike and leaves two moves", () => {
  assert.equal(fitMove(at("recover", 4)), "focus");
  assert.equal(fitMove(at("recover", 5)), "strike");
  assert.deepEqual(moveHand(at("recover", 5)), ["strike", "mend"]);
  assert.deepEqual(moveHand(at("claw", 5)), ["strike", "mend", "counter"]);
});

test("question limit comes from the boss", () => {
  const storm = { ...createChapterBattle("ridge_storm", stats, () => 0.4), intent: "recover" as const, turn: 5 };
  assert.equal(fitMove(storm), "focus");
  assert.equal(fitMove({ ...storm, turn: 8 }), "strike");
});
