import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {BOSSES,CARDS,STAT_REQUIREMENTS,createBattle,resolveTurn,checkPreview,incomingDamage,statPercent,type Battle,type CardId,type BossId,type Stats} from "../../src/lib/raid/cards/engine.ts";
const data=JSON.parse(readFileSync(new URL("./real-stats.json",import.meta.url),"utf8"));
function rng(seed:number) {let n=seed;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function policy(b:Battle):CardId {
  const has=(id:CardId)=>b.hand.includes(id)&&CARDS[id].cost<=b.energy;
  if(b.hp<b.hpMax*.5&&has("mend"))return "mend";
  if((b.intent==="charge"||b.intent==="pounce")&&has("interrupt")&&checkPreview(b,"interrupt").chance>=60)return "interrupt";
  if(incomingDamage(b)>0&&has("counter")&&checkPreview(b,"counter").chance>=50)return "counter";
  if(b.intent==="pounce"||b.intent==="thunder") {
    if(has("dodge")&&checkPreview(b,"dodge").chance>=50)return "dodge";
    if(has("counter"))return "counter";
    return "guard";
  }
  if(has("burst")&&(b.intent==="recover"||b.exposed||b.momentum>0))return "burst";
  if(has("pierce")&&(b.intent==="brace"||b.intent==="veil"||checkPreview(b,"pierce").chance>=50))return "pierce";
  if(has("focus")&&b.momentum===0&&(b.energy<=2||b.intent==="brace"||b.intent==="charge"))return "focus";
  return "strike";
}
const keys=["hp","atk","def","spd","foc"] as const;
const valid=data.pets.filter((p:Stats)=>keys.every(k=>typeof p[k]==="number"));
const rows:Record<string,{n:number;wins:number;turns:number;reasons:Record<string,number>}>= {};
const SEEDS=Number(process.env.RAID_SIM_SEEDS || 30);
for(const p of valid) for(const quality of ["none","q1","q3","q4"]) {
  const caps=data.eggs.find((e:{id:string})=>e.id===p.egg).profile.caps;
  const [main,sub]=quality==="q4"?[18,7]:quality==="q3"?[14,6]:quality==="q1"?[8,0]:[0,0];
  // Legal head ATK/HP, body DEF/ATK, feet SPD/DEF. Unique main stats, no FOC gear.
  const bonus={atk:main+sub,hp:sub,def:main+sub,spd:main,foc:0};
  const stats=Object.fromEntries(keys.map(k=>[k,Math.min(caps[k],p[k]+bonus[k])])) as Stats;
  for(const boss of Object.keys(BOSSES) as BossId[]) for(const accuracy of [.4,.6,.8,1]) {
    const delta=statPercent(stats)-STAT_REQUIREMENTS[boss];
    const band=delta<0?"below":delta<5?"at+0..5":delta<15?"above+5..15":"above+15";
    for(let seed=1;seed<=SEEDS;seed++) {
      const random=rng(seed*7919);const answers=rng(seed*107+7);let b=createBattle(boss,stats,random);
      while(!b.outcome)b=resolveTurn(b,policy(b),random,answers()<accuracy);
      const key=[boss,quality,band,accuracy].join("|");
      const r=rows[key]??={n:0,wins:0,turns:0,reasons:{}};
      r.n++;r.wins+=Number(b.outcome==="win");r.turns+=b.log.length;
      const reason=b.outcome==="win"?"win":b.defeatReason??"unknown";r.reasons[reason]=(r.reasons[reason]??0)+1;
    }
  }
}
const summary=Object.entries(rows).map(([key,r])=>({key,n:r.n,winPct:Math.round(1000*r.wins/r.n)/10,turns:Math.round(10*r.turns/r.n)/10,reasons:r.reasons}));
mkdirSync(".cache",{recursive:true});writeFileSync(".cache/raid-simulation.json",JSON.stringify({validPets:valid.length,excluded:data.pets.length-valid.length,seeds:SEEDS,summary},null,2));
console.log(JSON.stringify({validPets:valid.length,excluded:data.pets.length-valid.length,battles:summary.reduce((s,r)=>s+r.n,0),nearThreshold:summary.filter(r=>r.key.includes("at+0..5")&&r.key.includes("|none|"))},null,2));
