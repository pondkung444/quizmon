"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ClaimRaidRewardResult } from "@/app/raid/actions";
import { acknowledgeRaidCardReward, claimRaidCardReward } from "@/app/raid/card-actions";
import { RAID_EPIC_PITY_CAP } from "@/lib/raid/rewardConstants";
import { RAID_GEAR_QUALITY_COLOR, RAID_GEAR_SLOT_ANATOMY_TH } from "@/lib/raid/labels";
import { useSfx } from "@/lib/audio/useSfx";
import { getPetImagePath } from "@/lib/petImage";
import RaidGearIcon from "./RaidGearIcon";
import styles from "./card-battle.module.css";

// Claim and reward dialog shared by the card battle and the arena until phase 3 replaces it.
export default function useRaidReward({ runId, bossId, outcome, lockRef, busy, setBusy, error, setError }: {
  runId: string;
  bossId: string;
  outcome: string | null;
  lockRef: RefObject<boolean>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}) {
  const router = useRouter();
  const sfx = useSfx();
  const [reward, setReward] = useState<ClaimRaidRewardResult | null>(null);
  const [showReward, setShowReward] = useState(false);
  const rewardDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (showReward) rewardDialog.current?.showModal();
  }, [showReward]);

  async function claim() {
    if (reward) { setShowReward(true); return; }
    if (lockRef.current) return;
    lockRef.current = true; setBusy(true); setError(null);
    try { const r = await claimRaidCardReward(runId); setReward(r); setShowReward(true); sfx(r.eggAwarded ? "reward_fanfare" : "reward_normal"); }
    catch (e) { setError(e instanceof Error ? e.message : "ยังเปิดหีบไม่ได้"); }
    finally { setBusy(false); lockRef.current = false; }
  }
  async function acknowledge() {
    if (lockRef.current || !reward) return;
    lockRef.current = true; setBusy(true); setError(null);
    try {
      await acknowledgeRaidCardReward(runId);
      router.push("/raid");
    } catch {
      setError("บันทึกรางวัลแล้ว แต่ยังกลับหน้าเลือกด่านไม่ได้ ลองกดยืนยันอีกครั้งนะ");
      lockRef.current = false; setBusy(false);
    }
  }

  const dialog = showReward && reward ? <dialog ref={rewardDialog} className={styles.rewardOverlay} aria-labelledby="raid-reward-title" onCancel={(event) => event.preventDefault()}>
    <div className={styles.rewardPanel}>
      <span className={styles.eyebrow}>ของจากการท้าทาย</span><h2 id="raid-reward-title">ได้อุปกรณ์กลับมาแล้ว!</h2>
      <div className={styles.rewardIcon}><RaidGearIcon slot={reward.slot} color={RAID_GEAR_QUALITY_COLOR[reward.quality]} size={90} /></div>
      <h3>{RAID_GEAR_SLOT_ANATOMY_TH[reward.slot]} · {reward.qualityLabel}</h3>
      <p>{reward.mainStat.toUpperCase()} +{reward.mainValue}{reward.subStat ? ` · ${reward.subStat.toUpperCase()} +${reward.subValue}` : ""}</p>
      {reward.eggAwarded && <div className={styles.eggReward}>
        {reward.eggSpritePrefix && <Image src={getPetImagePath(reward.eggSpritePrefix, 1, null, null)} alt={reward.eggNameTh || "ไข่ Epic"} width={96} height={96} />}
        <strong>ได้รับ {reward.eggNameTh || "ไข่ Epic"}!</strong>
        <span>เพิ่มเข้าคลังไข่แล้ว</span>
      </div>}
      {bossId === "ridge_storm" && <div className={styles.pityProgress}>
        <strong>สะสมการันตีไข่ Epic</strong>
        <p>{reward.pityMeter ?? 0} / {RAID_EPIC_PITY_CAP}</p>
        <progress aria-label="สะสมการันตีไข่ Epic" value={reward.pityMeter ?? 0} max={RAID_EPIC_PITY_CAP} />
        <p>{reward.eggAwarded ? "ได้รับไข่แล้ว · ขีดสะสมล่าสุดตามแถบนี้" : (reward.pityMeter ?? 0) >= RAID_EPIC_PITY_CAP ? "สะสมเต็มแล้ว ชนะครั้งถัดไปได้ไข่แน่นอน" : outcome === "win" ? "ชนะแล้วยังไม่ได้ไข่จะเพิ่มขีดสะสม ครบแล้วชนะครั้งถัดไปได้ไข่แน่นอน" : "รอบนี้ขีดสะสมไม่เพิ่ม ชนะด่านนี้เพื่อสะสมต่อ"}</p>
      </div>}
      <p className={styles.finePrint}>รางวัลเข้าคลังแล้ว อ่านให้ครบแล้วค่อยไปต่อได้เลย</p>
      {error && <p role="alert">{error}</p>}
      <button autoFocus className={styles.primary} disabled={busy} onClick={acknowledge}>{busy ? "กำลังกลับหน้าเลือกด่าน…" : "รับทราบ · กลับไปเลือกด่าน"}</button>
    </div>
  </dialog> : null;

  return { claim, rewardReady: !!reward, dialog };
}
