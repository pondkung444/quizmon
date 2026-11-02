"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardBattleView } from "@/lib/raid/cards/server";
import type { CardId } from "@/lib/raid/cards/engine";
import { answerRaidCard, playRaidCard, reloadRaidCardBattle } from "@/app/raid/card-actions";
import { useSfx } from "@/lib/audio/useSfx";
import CardBattleArena from "./CardBattleArena";
import { selectRaidChapter, finishExhaustedRaid } from "@/app/raid/card-actions";
import useRaidReward from "./useRaidReward";

export default function RaidCardBattle({ view }: { view: CardBattleView }) {
  const router = useRouter();
  const sfx = useSfx();
  const [current, setCurrent] = useState(view);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [animateTurn, setAnimateTurn] = useState(0);
  const [dismissed,setDismissed]=useState(-1);
  const { claim, rewardReady, dialog } = useRaidReward({ runId: current.runId, bossId: current.battle.bossId, outcome: current.battle.outcome, lockRef: lock, busy, setBusy, error, setError });
  if (view.revision > current.revision) setCurrent(view);
  async function play(card: CardId) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const next = await playRaidCard(current.runId, current.revision, card);
      setCurrent(next);
      if (next.revision > current.revision) {
        setAnimateTurn(next.revision); sfx(next.battle.outcome === "win" ? "pvp_win" : "pvp_card");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ ลองโหลดสถานะล่าสุด"); }
    finally { setBusy(false); lock.current = false; }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { setCurrent(await reloadRaidCardBattle(current.runId)); setAnimateTurn(0); }
    catch (e) { setError(e instanceof Error ? e.message : "ยังโหลดไม่ได้"); }
    finally { setBusy(false); lock.current = false; }
  }
  async function selectOffer(id?:string) {
    if (lock.current) return;
    lock.current=true; setBusy(true); setError(null);
    try {
      setCurrent(id ? await selectRaidChapter(current.runId,current.revision,id) : await finishExhaustedRaid(current.runId,current.revision));
    } catch(e) { setError(e instanceof Error ? e.message : "ยังเลือกบทไม่ได้"); }
    finally {lock.current=false;setBusy(false);}
  }
  async function answer(index:number) {
    if(lock.current) return;
    lock.current=true;setBusy(true);setError(null);
    try {
      const next=await answerRaidCard(current.runId,current.revision,index);
      setCurrent(next);
      if(next.revision>current.revision) {setAnimateTurn(next.revision);sfx(next.feedback?.correct?"answer_correct":"answer_wrong");}
    } catch(e) {setError(e instanceof Error?e.message:"ยังตรวจคำตอบไม่ได้");}
    finally {lock.current=false;setBusy(false);}
  }
  return <>
    <CardBattleArena {...current} busy={busy} error={error} animateTurn={animateTurn} onPlay={play} onReload={reload}
      onSelectOffer={(id)=>void selectOffer(id)} onFinishExhausted={()=>void selectOffer()}
      feedback={!current.question && current.feedback && current.feedback.revision>dismissed?current.feedback:null} onAnswer={answer} onContinue={()=>setDismissed(current.feedback?.revision??-1)}
      onExit={() => router.push("/pet")} onReward={claim} rewardReady={rewardReady} />
    {dialog}
  </>;
}
