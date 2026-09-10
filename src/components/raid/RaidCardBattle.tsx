"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CardBattleView } from "@/lib/raid/cards/server";
import type { CardId } from "@/lib/raid/cards/engine";
import type { ClaimRaidRewardResult } from "@/app/raid/actions";
import { answerRaidCard, claimRaidCardReward, playRaidCard, reloadRaidCardBattle } from "@/app/raid/card-actions";
import { useSfx } from "@/lib/audio/useSfx";
import { getPetImagePath } from "@/lib/petImage";
import RaidGearIcon from "./RaidGearIcon";
import { RAID_GEAR_QUALITY_COLOR, RAID_GEAR_SLOT_ANATOMY_TH } from "@/lib/raid/labels";
import CardBattleArena from "./CardBattleArena";
import styles from "./card-battle.module.css";

export default function RaidCardBattle({ view }: { view: CardBattleView }) {
  const router = useRouter();
  const sfx = useSfx();
  const [current, setCurrent] = useState(view);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [animateTurn, setAnimateTurn] = useState(0);
  const [reward, setReward] = useState<ClaimRaidRewardResult | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [dismissed,setDismissed]=useState(-1);
  const rewardDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (showReward) rewardDialog.current?.showModal();
  }, [showReward]);
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
  async function claim() {
    if (reward) { setShowReward(true); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { const r = await claimRaidCardReward(current.runId); setReward(r); setShowReward(true); sfx(r.eggAwarded ? "reward_fanfare" : "reward_normal"); }
    catch (e) { setError(e instanceof Error ? e.message : "ยังเปิดหีบไม่ได้"); }
    finally { setBusy(false); lock.current = false; }
  }
  return <>
    <CardBattleArena {...current} busy={busy} error={error} animateTurn={animateTurn} onPlay={play} onReload={reload}
      feedback={!current.question && current.feedback && current.feedback.revision>dismissed?current.feedback:null} onAnswer={answer} onContinue={()=>setDismissed(current.feedback?.revision??-1)}
      onExit={() => router.push("/pet")} onReward={claim} rewardReady={!!reward} />
    {showReward && reward && <dialog ref={rewardDialog} className={styles.rewardOverlay} aria-labelledby="raid-reward-title" onCancel={() => setShowReward(false)}>
      <div className={styles.rewardPanel}>
        <span className={styles.eyebrow}>ของจากการท้าทาย</span><h2 id="raid-reward-title">ได้อุปกรณ์กลับมาแล้ว!</h2>
        <div className={styles.rewardIcon}><RaidGearIcon slot={reward.slot} color={RAID_GEAR_QUALITY_COLOR[reward.quality]} size={90} /></div>
        <h3>{RAID_GEAR_SLOT_ANATOMY_TH[reward.slot]} · {reward.qualityLabel}</h3>
        <p>{reward.mainStat.toUpperCase()} +{reward.mainValue}{reward.subStat ? ` · ${reward.subStat.toUpperCase()} +${reward.subValue}` : ""}</p>
        {reward.eggAwarded && reward.eggSpritePrefix ? <div className={styles.eggReward}>
          <Image src={getPetImagePath(reward.eggSpritePrefix, 1, null, null)} alt={reward.eggNameTh || "ไข่ศักดิ์นภา"} width={110} height={110} />
          <strong>ได้รับ {reward.eggNameTh}!</strong>
        </div> : current.battle.bossId === "ridge_storm" && current.battle.outcome === "win" ? <p>การันตีไข่ศักดิ์นภา {reward.pityMeter ?? 0} / 10</p> : null}
        <p className={styles.finePrint}>ตรวจแต้มสุทธิและของที่ต้องถอดก่อนจัดชุดรอบหน้า</p>
        <button autoFocus className={styles.primary} onClick={() => router.push(`/raid/${current.battle.bossId}`)}>จัดอุปกรณ์แล้วท้าอีกครั้ง</button>
        <button className={styles.secondary} onClick={() => router.push("/raid")}>เลือกด่าน</button>
        <button className={styles.secondary} onClick={() => setShowReward(false)}>กลับไปดูผลการต่อสู้</button>
      </div>
    </dialog>}
  </>;
}
