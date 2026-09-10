import { test } from "node:test";
import assert from "node:assert/strict";
import { BOSSES, CARDS, MAX_TURNS, createBattle, checkPreview, resolveTurn, incomingDamage, rewardScore, type CardId, type BossId, type Battle } from "../../src/lib/raid/cards/engine.ts";

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const stats = { hp: 80, atk: 80, def: 80, spd: 80, foc: 80 };
function withCard(card: CardId, boss: BossId = "ridge_mist") { const b = createBattle(boss, stats, rng(7)); b.hand = [card, ...(["mend", "focus", "burst"] as CardId[]).filter((id) => id !== card).slice(0, 2)]; b.energy = 5; return b; }

test("snapshots are copied; boss power is fixed regardless of player strength", () => {
  const b = createBattle("ridge_storm", stats, rng(1));
  const weak = createBattle("ridge_storm", { hp:20,atk:20,def:20,spd:20,foc:20 }, rng(1));
  assert.equal(b.bossHp, weak.bossHp); assert.notEqual(b.stats, stats);
});
test("stat thresholds yield guaranteed, uncertain, and base-only outcomes", () => {
  const b = withCard("interrupt");
  b.stats.atk = 48; assert.equal(checkPreview(b, "interrupt").chance, 100);
  b.stats.atk = 35; assert.ok(checkPreview(b, "interrupt").chance > 0);
  b.stats.atk = 19; assert.equal(checkPreview(b, "interrupt").chance, 0);
});
test("card not in hand, insufficient energy and completed battles reject commands", () => {
  const b = withCard("counter"); b.energy = 0;
  assert.throws(() => resolveTurn(b,"counter",rng(3)));
  assert.throws(() => resolveTurn(b,"dodge",rng(3)));
  b.outcome = "win"; assert.throws(() => resolveTurn(b,"guard",rng(3)));
});
test("interrupt stops charging and leads to recovery, not lightning", () => {
  const b = withCard("interrupt","ridge_storm"); b.stats.atk = 100;
  const next = resolveTurn(b,"interrupt",rng(2));
  assert.equal(next.log[0].interrupted,true); assert.equal(next.log[0].taken,0); assert.equal(next.intent,"recover");
});
test("ignoring charge produces telegraphed lightning; dodge cannot fully avoid it", () => {
  const b = withCard("dodge","ridge_storm"); b.stats.spd = 120;
  const charged = resolveTurn(b,"guard",rng(1));
  assert.equal(charged.intent,"thunder");
  const next = resolveTurn(charged,"dodge",rng(1));
  assert.ok(next.log[1].taken > 0); assert.equal(next.intent,"recover");
});
test("phase crossing uses damage shown BEFORE the player's attack", () => {
  const b = withCard("burst","ridge_gale"); b.bossHp = 255;
  const expected = incomingDamage(b);
  const next = resolveTurn(b,"burst",rng(1));
  assert.ok(next.bossHp < BOSSES.ridge_gale.hp * .7);
  assert.equal(next.log[0].taken,expected);
});
test("killing blow stops retaliation; healing cannot exceed max HP", () => {
  const b = withCard("burst"); b.bossHp = 1; b.hp = 1;
  const next = resolveTurn(b,"burst",rng(1));
  assert.equal(next.outcome,"win"); assert.equal(next.hp,1);
  const healed = resolveTurn(withCard("mend"),"mend",rng(1));
  assert.equal(healed.log[0].healed,0);
});
test("unplayed cards stay in hand; played cards cannot immediately redraw", () => {
  const b = withCard("counter"); const before = structuredClone(b);
  const next = resolveTurn(b,"counter",rng(1));
  assert.deepEqual(b,before); assert.equal(next.hand.length,3);
  assert.ok(!next.hand.includes("counter"));
  for (const id of b.hand.filter((id)=>id!=="counter")) assert.ok(next.hand.includes(id));
});
test("guard-only strategy always terminates and never earns high gear", () => {
  let b = createBattle("ridge_mist",stats,rng(1));
  while (!b.outcome) b = resolveTurn(b,"guard",rng(2));
  assert.equal(b.outcome,"defeat"); assert.ok(b.log.length <= MAX_TURNS); assert.equal(rewardScore(b),0);
});
test("wrong answers weaken every command and cannot trigger specials",()=>{
  for(const id of Object.keys(CARDS) as CardId[]) {
    const b=withCard(id);b.hp=Math.round(b.hpMax*.5);
    const right=resolveTurn(b,id,rng(4),true),wrong=resolveTurn(b,id,rng(4),false);
    const r=right.log.at(-1)!,w=wrong.log.at(-1)!;
    assert.equal(w.answerCorrect,false);assert.equal(w.success,false);assert.equal(w.interrupted,false);
    assert.ok(w.dealt<=r.dealt,id);assert.ok(w.healed<=r.healed,id);assert.ok(w.taken>=r.taken,id);
  }
});
test("GDD stat gate applies at 45/60/75 percent, without scaling the boss",()=>{
  for(const [boss,minimum] of [["ridge_mist",45],["ridge_gale",60],["ridge_storm",75]] as const) {
    for(const atThreshold of [false,true]) {
      const b=createBattle(boss,{hp:minimum-(atThreshold?0:1),atk:minimum,def:minimum,spd:minimum,foc:minimum},rng(1));b.bossHp=1;
      const next=resolveTurn(b,"strike",rng(2),true);
      assert.equal(next.outcome,atThreshold?"win":"defeat");
      if(!atThreshold)assert.equal(next.defeatReason,"stats");
    }
  }
});
test("a killing blow still requires at least sixty percent correct answers",()=>{
  const b=withCard("burst");const sample=resolveTurn(b,"guard",rng(2)).log[0];
  b.turn=10;b.bossHp=1;b.log=Array.from({length:9},(_,i)=>({...sample,turn:i+1,answerCorrect:i<5}));
  assert.equal(resolveTurn(b,"strike",rng(2),true).outcome,"win");
  assert.equal(resolveTurn(b,"strike",rng(2),false).defeatReason,"learning");
});
test("saved JSON resumes exactly; seeded rolls produce identical outcomes", () => {
  const b = withCard("burst"); b.stats.atk = 35;
  assert.deepEqual(resolveTurn(b,"burst",rng(12)),resolveTurn(JSON.parse(JSON.stringify(b)),"burst",rng(12)));
});
test("all bosses stay within resource bounds over varied legal play", () => {
  for (const boss of Object.keys(BOSSES) as BossId[]) {
    for (let seed=1;seed<=100;seed++) {
      const random = rng(seed); let b = createBattle(boss,stats,random);
      while (!b.outcome) {
        const choices: CardId[] = ["guard","strike",...b.hand.filter((id)=>CARDS[id].cost<=b.energy)];
        b = resolveTurn(b,choices[Math.floor(random()*choices.length)],random);
        assert.ok(b.hp>=0 && b.hp<=b.hpMax && b.bossHp>=0);
        assert.ok(b.energy>=0 && b.energy<=5);
        assert.equal(new Set(b.hand).size,3);
      }
      assert.ok(b.log.length<=20); assert.ok(rewardScore(b)>=0 && rewardScore(b)<=100);
    }
  }
});

// Use a consistent, non-clairvoyant policy to compare progression, not a guarantee of production balance.
function policy(b: Battle): CardId {
  const has = (id: CardId) => b.hand.includes(id) && CARDS[id].cost<=b.energy;
  if (b.hp < b.hpMax*.4 && has("mend")) return "mend";
  if ((b.intent==="charge" || b.intent==="pounce") && has("interrupt") && checkPreview(b,"interrupt").chance>=50) return "interrupt";
  if (b.intent==="pounce" || b.intent==="thunder") {
    if (has("counter")) return "counter";
    if (has("dodge")) return "dodge";
    return "guard";
  }
  if (b.intent==="brace" || b.intent==="veil") {
    if (has("pierce")) return "pierce";
    if (has("focus") && b.momentum===0) return "focus";
  }
  if (has("burst") && (b.intent==="recover" || b.exposed || b.bossHp<70)) return "burst";
  if (has("pierce")) return "pierce";
  return "strike";
}
test("training increases wins across fixed seeds", () => {
  const rates: Record<string,number[]> = {};
  for (const boss of Object.keys(BOSSES) as BossId[]) {
    rates[boss] = [35,60,85].map((value)=>{
      let wins=0;
      for(let seed=1;seed<=100;seed++) {
        const random=rng(seed); let b=createBattle(boss,{hp:value,atk:value,def:value,spd:value,foc:value},random);
        while(!b.outcome) b=resolveTurn(b,policy(b),random);
        if(b.outcome==="win") wins++;
      }
      return wins;
    });
    assert.ok(rates[boss][2]>rates[boss][0],boss+" must reward stat growth");
  }
  console.log("Wins per 100 fixed seeds at stat 35/60/85:", JSON.stringify(rates));
});
