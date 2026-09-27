import test from "node:test";
import assert from "node:assert/strict";
import {
  createChapterBattle,
  resolveTurn,
  incomingDamage,
  CHAPTER_CARDS,
} from "../../src/lib/raid/cards/engineV4.ts";
import type { CardId, BossId } from "../../src/lib/raid/cards/engine.ts";
const stats = { hp: 80, atk: 80, def: 80, spd: 80, foc: 80 };
test("v4: armor, interrupts and counters have contextual advantages", () => {
  const base = createChapterBattle("ridge_storm", stats, () => 0.4);
  const armored = { ...base, intent: "brace" as const };
  assert.ok(
    resolveTurn(armored, "pierce", () => 0.4).log[0].dealt >
      resolveTurn(armored, "strike", () => 0.4).log[0].dealt,
  );
  const stopped = resolveTurn(base, "interrupt", () => 0.4);
  assert.equal(stopped.log[0].interrupted, true);
  assert.equal(stopped.intent, "recover");
  assert.equal(stopped.log[0].taken, 0);
  const charged = resolveTurn(base, "strike", () => 0.4);
  assert.equal(charged.intent, "thunder");
  const counter = resolveTurn(
    { ...base, intent: "thunder" },
    "counter",
    () => 0.4,
  );
  assert.ok(
    counter.log[0].taken < incomingDamage({ ...base, intent: "thunder" }),
  );
  assert.ok(counter.log[0].reflected! > 0);
  assert.equal(resolveTurn(base, "counter", () => 0.4).log[0].reflected, 0);
});
test("v4: wrong answers cannot heal, interrupt, counter or open a weakness", () => {
  for (const id of Object.keys(CHAPTER_CARDS) as CardId[]) {
    const b = {
      ...createChapterBattle("ridge_storm", stats, () => 0.4),
      hp: 90,
    };
    const n = resolveTurn(b, id, () => 0.4, false);
    assert.equal(n.log[0].healed, 0);
    assert.equal(n.log[0].reflected, 0);
    assert.equal(n.log[0].interrupted, false);
    assert.equal(n.momentum, 0);
    assert.equal(n.log[0].dealt, Math.round((430 / 8) * 1.37 * 0.25));
  }
});
test("v4: lifesteal uses actual damage, killing blow suppresses boss and weakness lasts one attack", () => {
  const b = {
    ...createChapterBattle("ridge_mist", stats, () => 0.4),
    hp: 100,
    bossHp: 2,
  };
  const n = resolveTurn(b, "mend", () => 0.4);
  assert.equal(n.log[0].dealt, 2);
  assert.equal(n.log[0].healed, 1);
  assert.equal(n.log[0].taken, 0);
  assert.equal(n.outcome, "win");
  const marked = resolveTurn(
    createChapterBattle("ridge_storm", stats, () => 0.4),
    "focus",
    () => 0.4,
  );
  assert.ok(marked.momentum > 0);
  assert.equal(resolveTurn(marked, "strike", () => 0.4).momentum, 0);
  assert.throws(() => resolveTurn(n, "strike", () => 0.4));
});
test("v4: all bosses finish, preserve bounds and resume identically", () => {
  for (const boss of ["ridge_mist", "ridge_gale", "ridge_storm"] as BossId[])
    for (const level of [0, 40, 80, 150, 500]) {
      let b = createChapterBattle(
        boss,
        { hp: level, atk: level, def: level, spd: level, foc: level },
        () => 0.2,
      );
      let turns = 0;
      while (!b.outcome) {
        const id = (Object.keys(CHAPTER_CARDS) as CardId[])[turns % 6];
        const next = resolveTurn(b, id, () => 0.2, turns % 3 !== 0);
        assert.deepEqual(
          next,
          resolveTurn(
            JSON.parse(JSON.stringify(b)),
            id,
            () => 0.2,
            turns % 3 !== 0,
          ),
        );
        assert.ok(next.hp >= 0 && next.hp <= next.hpMax && next.bossHp >= 0);
        b = next as typeof b;
        turns++;
        assert.ok(turns <= 8);
      }
    }
});
