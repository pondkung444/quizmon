import test from "node:test";
import assert from "node:assert/strict";
import { createBattle, resolveTurn, checkPreview, rewardScore, QUESTION_LIMITS, type Battle, type BossId, type CardId } from "../../src/lib/raid/cards/engine.ts";
import * as legacy from "../../src/lib/raid/cards/engineV2.ts";

const stats = (n: number) => ({ hp:n, atk:n, def:n, spd:n, foc:n });
test("short rounds always finish within 5/6/8 questions; every card deals damage without energy", () => {
  for (const boss of Object.keys(QUESTION_LIMITS) as BossId[]) {
    for (const stat of [0,20,40,80,150,500]) for (const correct of [false,true]) for (const card of ["strike","mend"] as CardId[]) {
      let b: Battle = createBattle(boss,stats(stat),()=>0.5);
      while (!b.outcome) {
        assert.equal(b.energy,0);
        assert.equal(checkPreview(b,card).affordable,true);
        const next=resolveTurn(b,card,()=>0.99,correct);
        assert.ok(next.bossHp<b.bossHp);
        assert.deepEqual(next.hand,["strike","mend"]);
        assert.equal(next.log.at(-1)?.success,correct);
        b=next;
        assert.ok(b.log.length<=QUESTION_LIMITS[boss]);
      }
      assert.ok(rewardScore(b)>0);
      if(correct) assert.equal(b.outcome,"win","all correct can win even at zero stats without a lucky roll");
      else { assert.equal(b.log.length,QUESTION_LIMITS[boss]); assert.equal(b.outcome,"defeat"); }
    }
  }
});
test("critical hits are a bonus, wrong answers still help, healing stays bounded", () => {
  const b=createBattle("ridge_mist",stats(40),()=>0.5);
  const critical=resolveTurn(b,"strike",()=>0,true);
  const normal=resolveTurn(b,"strike",()=>0.99,true);
  const wrong=resolveTurn(b,"strike",()=>0,false);
  assert.ok(critical.bossHp<normal.bossHp && normal.bossHp<wrong.bossHp && wrong.bossHp<b.bossHp);
  b.hp-=20;
  assert.ok(resolveTurn(b,"mend",()=>0.99,true).log[0].healed>0);
  assert.ok(resolveTurn(b,"mend",()=>0.99,true).hp<=b.hpMax);
  assert.throws(()=>resolveTurn(b,"burst",()=>0.5),/ไม่มีการ์ด/);
});
test("no hidden stat/accuracy gate after defeating the boss, and no extra answer after finish", () => {
  let b: Battle=createBattle("ridge_mist",stats(0),()=>0.5);
  b=resolveTurn(b,"strike",()=>0.99,false);
  b.bossHp=1;
  b=resolveTurn(b,"strike",()=>0.99,false);
  assert.equal(b.outcome,"win");
  assert.throws(()=>resolveTurn(b,"strike",()=>0.5),/จบแล้ว/);
});
test("existing version 2 snapshots resolve identically through the new dispatcher", () => {
  const b=legacy.createBattle("ridge_gale",stats(80),()=>0.5);
  assert.deepEqual(resolveTurn(b,"strike",()=>0.5,true),legacy.resolveTurn(b,"strike",()=>0.5,true));
  assert.deepEqual(b,JSON.parse(JSON.stringify(b)));
});
