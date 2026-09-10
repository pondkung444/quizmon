"use client";

import { useEffect, useRef, useState } from "react";
import { BOSSES, createBattle, resolveTurn, damageProgress, type Battle, type BossId, type CardId, type Stats } from "@/lib/raid/cards/engine";
import type { RaidCardQuestion, RaidCardFeedback } from "@/lib/raid/cards/server";
import CardBattleArena from "./CardBattleArena";

const PROFILES: Record<string, Stats> = {
  starter: { hp: 40, atk: 40, def: 40, spd: 40, foc: 40 },
  attack: { hp: 65, atk: 95, def: 55, spd: 75, foc: 70 },
  defense: { hp: 90, atk: 65, def: 95, spd: 55, foc: 70 },
  trained: { hp: 85, atk: 90, def: 85, spd: 90, foc: 80 },
};
const KEY = "quizmon-raid-card-preview-learning-r3";

// Alternate illustrated/plain questions so the preview exercises both layouts.
function multiplicationImage(boxes: number, perBox: number): string {
  const groups = Array.from({ length: boxes }, (_, i) => {
    const x = (i % 4) * 100 + 10, y = Math.floor(i / 4) * 70 + 10;
    const dots = Array.from({ length: perBox }, (_, j) =>
      `<circle cx="${x + 18 + (j % 3) * 25}" cy="${y + 18 + Math.floor(j / 3) * 24}" r="6" fill="#345575"/>`
    ).join("");
    return `<rect x="${x}" y="${y}" width="90" height="60" rx="6" fill="#fff" stroke="#345575"/>${dots}`;
  }).join("");
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 410 ${Math.ceil(boxes / 4) * 70 + 10}">${groups}</svg>`)}`;
}

export default function RaidCardPreview() {
  const [boss, setBoss] = useState<BossId>("ridge_mist");
  const [profile, setProfile] = useState("attack");
  const [battle, setBattle] = useState<Battle>(() => createBattle("ridge_mist", PROFILES.attack, () => 0.35));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animateTurn, setAnimateTurn] = useState(0);
  const [best, setBest] = useState(0);
  const lock = useRef(false);
  const [question,setQuestion]=useState<RaidCardQuestion|null>(null);
  const [answerKey,setAnswerKey]=useState<number|null>(null);
  const [feedback,setFeedback]=useState<RaidCardFeedback|null>(null);
  useEffect(() => {
    // Restore browser storage after hydration, outside the initial render.
    const frame = requestAnimationFrame(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved?.battle?.version === 3 && saved.battle.bossId in BOSSES && saved.profile in PROFILES) {
        setBattle(saved.battle as Battle); setBoss(saved.battle.bossId); setProfile(saved.profile); setBest(saved.best || 0); setQuestion(saved.question??null); setAnswerKey(saved.answerKey??null); setFeedback(saved.feedback??null);
      }
    } catch { /* A preview can always start fresh. */ }
    setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function save(next: Battle, nextProfile = profile, nextBest = best, pending: RaidCardQuestion|null = null, key: number|null = null, result: RaidCardFeedback|null = null) {
    try { localStorage.setItem(KEY, JSON.stringify({ battle: next, profile: nextProfile, best: nextBest, question:pending, answerKey:key, feedback:result })); } catch { /* optional in preview */ }
  }
  function restart(nextBoss = boss, nextProfile = profile) {
    const next = createBattle(nextBoss, PROFILES[nextProfile], Math.random);
    const nextBest = nextBoss === battle.bossId ? Math.max(best, damageProgress(battle)) : 0;
    setQuestion(null);setAnswerKey(null);setFeedback(null);
    setBoss(nextBoss); setProfile(nextProfile); setBattle(next); setAnimateTurn(0); setBest(nextBest);
    save(next, nextProfile, nextBest);
  }
  function play(card: CardId) {
    if(lock.current || question) return;
    const a=battle.turn+3,b=battle.turn%5+2,correct=a*b,key=battle.turn%4;
    const choices=[correct+2,correct-1,correct+b,correct-3].map(String);choices[key]=String(correct);
    const q:RaidCardQuestion={revision:battle.log.length+1,cardId:card,text: `มีของ ${a} กล่อง กล่องละ ${b} ชิ้น รวมทั้งหมดกี่ชิ้น?`,choices,imageUrl:battle.turn%2===1?multiplicationImage(a,b):null,subject:"math",category:"โจทย์ตัวอย่าง · การคูณ"};
    setQuestion(q);setAnswerKey(key);setFeedback(null);save(battle,profile,best,q,key);
  }
  async function answer(index:number) {
    if(lock.current || !question || answerKey===null) return;
    lock.current=true;setBusy(true);
    try {
      await new Promise(resolve=>setTimeout(resolve,220));
      const correct=index===answerKey;
      const next=resolveTurn(battle,question.cardId,Math.random,correct);
      const result:RaidCardFeedback={revision:question.revision,correct,correctIndex:answerKey,question,explanation: `จำนวนทั้งหมด = จำนวนกล่อง × จำนวนต่อกล่อง = ${battle.turn+3} × ${battle.turn%5+2} = ${question.choices[answerKey]}`};
      setBattle(next);setAnimateTurn(next.log.length);setQuestion(null);setAnswerKey(null);setFeedback(result);save(next,profile,best,null,null,result);
    } finally {lock.current=false;setBusy(false);}
  }
  return <>
    <CardBattleArena battle={battle} petName="เจ้าสายหมอก" petImage="/pets/egg2_stage4_math_A.png" bestProgress={best}
      question={question} feedback={feedback} onAnswer={answer} onContinue={()=>{setFeedback(null);save(battle);}}
      busy={busy || !ready} error={null} animateTurn={animateTurn} onPlay={play} onReload={() => window.location.reload()}
      onExit={() => restart()} onReward={() => restart()} demo />
    <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:80, display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap", background:"#122132f5", padding:"7px 12px", color:"#d6e5f4", fontSize:11, borderTop:"1px solid #415973" }}>
      <span>ทดลองเท่านั้น</span>
      <select aria-label="เลือกบอสทดลอง" value={boss} disabled={busy} onChange={(e) => restart(e.target.value as BossId)} style={{ background:"#20394f", maxWidth:145 }}>{Object.entries(BOSSES).map(([id,b])=><option key={id} value={id}>{b.level}</option>)}</select>
      <select aria-label="เลือกชุดทดลอง" value={profile} disabled={busy} onChange={(e)=>restart(boss,e.target.value)} style={{ background:"#20394f" }}>
        <option value="starter">ชุดเริ่มต้น</option><option value="attack">ชุดบุก</option><option value="defense">ชุดตั้งรับ</option><option value="trained">ชุดพัฒนาแล้ว</option>
      </select>
      <button disabled={busy} onClick={()=>restart()}>เริ่มใหม่</button>
    </div>
  </>;
}
