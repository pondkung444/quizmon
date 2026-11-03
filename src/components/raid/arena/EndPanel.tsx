"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Egg, Home, Key, Shield, Zap } from "lucide-react";
import type { ClaimRaidRewardResult } from "@/app/raid/actions";
import { acknowledgeRaidCardReward, claimRaidArenaReward } from "@/app/raid/card-actions";
import { BOSSES, questionLimit, type ChapterBattle } from "@/lib/raid/cards/engine";
import { RAID_EPIC_PITY_CAP } from "@/lib/raid/rewardConstants";
import { RAID_GEAR_QUALITY_COLOR, RAID_GEAR_SLOT_ANATOMY_TH } from "@/lib/raid/labels";
import { getPetImagePath } from "@/lib/petImage";
import { useSfx } from "@/lib/audio/useSfx";
import { track } from "@/lib/analytics";
import RaidGearIcon from "../RaidGearIcon";
import { raidAfterEndProps, raidRoundEndProps, raidRoundOutcome, type RaidAfterEndAction } from "./events";
import styles from "./arena.module.css";

const TIPS = {
  ko: "บอสจะตีแรงเมื่อไร ลองใช้ “ตั้งรับสวนกลับ” หรือ “ดูดเลือด” เติมเลือดไว้ก่อน",
  turns: "บอสชาร์จพลังเมื่อไร ลองใช้ “ขัดจังหวะ” ข้อหน้าจะไม่โดนท่าหนัก",
  content: "ลองเลือกบทอื่นรอบหน้า",
};

function onceForRun(runId: string): boolean {
  try {
    const key = `raid_round_end:${runId}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch { /* storage blocked: an extra event is better than none */ }
  return true;
}

// Claims as soon as it mounts. The claim RPC is idempotent, so a retry never adds a second item.
export default function EndPanel({ runId, battle: b, petId, petName, chapterMode, claimReward = claimRaidArenaReward }: {
  runId: string;
  battle: ChapterBattle;
  petId: string | null;
  petName: string;
  chapterMode: string | null;
  // Swappable only so a local preview can render the panel without spending a key.
  claimReward?: typeof claimRaidArenaReward;
}) {
  const router = useRouter();
  const sfx = useSfx();
  const [result, setResult] = useState<{ reward: ClaimRaidRewardResult; keys: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const boss = BOSSES[b.bossId];
  const outcome = raidRoundOutcome(b);
  const win = outcome === "win";

  async function claim() {
    setError(null);
    try {
      const next = await claimReward(runId);
      setResult(next);
      sfx(next.reward.eggAwarded ? "reward_fanfare" : "reward_normal");
      if (onceForRun(runId)) track("raid_round_end", raidRoundEndProps(b, chapterMode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ยังเปิดหีบไม่สำเร็จ");
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void claim();
    // Claim once on mount; retries come from the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function leave(action: RaidAfterEndAction, href: string) {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    track("raid_after_end", raidAfterEndProps(b, action));
    try {
      // Refresh /raid first so the level page no longer sees this run as active.
      await acknowledgeRaidCardReward(runId);
      router.push(href);
    } catch {
      setError("บันทึกรางวัลแล้ว แต่ยังไปต่อไม่ได้ ลองกดอีกครั้งนะ");
      setLeaving(false);
    }
  }

  const right = b.log.filter((entry) => entry.answerCorrect !== false).length;
  const lead = win ? `ตอบถูก ${right} จาก ${b.log.length} ข้อ`
    : outcome === "ko" ? `${petName}หมดแรงก่อน · บอสเหลือเลือด ${b.bossHp}`
      : outcome === "content" ? `โจทย์ในบทนี้หมดแล้ว · บอสเหลือเลือด ${b.bossHp}`
        : `ครบ ${questionLimit(b)} ข้อแล้ว · ตอบถูก ${right} ข้อ · บอสเหลือเลือด ${b.bossHp}`;
  const reward = result?.reward;
  const hard = b.bossId === "ridge_storm";
  const pity = reward?.pityMeter ?? 0;
  const eggCard = reward?.eggAwarded && <div className={`${styles.loot} ${styles.lootEgg}`}>
    <span className={styles.gem}>{reward.eggSpritePrefix
      ? <Image src={getPetImagePath(reward.eggSpritePrefix, 1, null, null)} alt="" width={52} height={52} />
      : <Egg size={34} />}</span>
    <span><span className={styles.k}>ของพิเศษจาก{boss.level}</span><span className={styles.v}>ได้ไข่ศักดิ์นภา!</span><span className={styles.s}>เข้าคลังไข่แล้ว ไปฟักได้ที่ฟาร์ม</span></span>
  </div>;
  const pityCard = hard && reward && !reward.eggAwarded && <div className={styles.pityCard}>
    <div className={styles.pityRow}><span><Egg size={18} /> สะสมลุ้นไข่ศักดิ์นภา</span><b>{pity} / {RAID_EPIC_PITY_CAP}</b></div>
    <span className={styles.pbar}>{Array.from({ length: RAID_EPIC_PITY_CAP }, (_, i) => <i key={i} className={i < pity ? styles.on : ""} />)}</span>
    <p>{!win ? "ชนะด่านนี้แล้วขีดจะเพิ่มขึ้น" : pity >= RAID_EPIC_PITY_CAP ? "ชนะครั้งหน้าได้ไข่แน่นอน" : `ชนะด่านนี้อีก ${RAID_EPIC_PITY_CAP - pity} ครั้ง ได้ไข่แน่นอน`}</p>
  </div>;

  return <div className={`${styles.end} ${styles.enter}`}>
    <h2>{win ? `${petName}ชนะ${boss.name}แล้ว!` : "เกือบแล้ว!"}</h2>
    <p className={styles.lead}>{lead}</p>
    {eggCard}
    {reward ? <div className={styles.loot}>
      <span className={styles.gem} style={{ background: RAID_GEAR_QUALITY_COLOR[reward.quality] }}><RaidGearIcon slot={reward.slot} color="#ffffff" size={36} /></span>
      <span>
        <span className={styles.k}>ได้อุปกรณ์กลับบ้าน</span>
        <span className={styles.v}>{RAID_GEAR_SLOT_ANATOMY_TH[reward.slot]}{reward.qualityLabel ? ` · ${reward.qualityLabel}` : ""}</span>
        <span className={styles.s}>{reward.mainStat.toUpperCase()} +{reward.mainValue}{reward.subStat ? ` · ${reward.subStat.toUpperCase()} +${reward.subValue}` : ""}</span>
      </span>
    </div> : <div className={`${styles.loot} ${styles.lootWait}`} role="status">{error ? null : "กำลังเปิดหีบ…"}</div>}
    {pityCard}
    {!win && <div className={styles.tip}>{outcome === "ko" ? <Shield size={22} /> : <Zap size={22} />}<span>{TIPS[outcome as keyof typeof TIPS]}</span></div>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.btns}>
      {!result
        ? <button type="button" className={styles.cta} disabled={!error} onClick={() => void claim()}>{error ? "ลองเปิดหีบอีกครั้ง" : "กำลังเปิดหีบ…"}</button>
        : result.keys > 0
          ? <button type="button" className={styles.cta} disabled={leaving} onClick={() => void leave("replay", `/raid/${b.bossId}${petId ? `?pet=${petId}` : ""}`)}>ท้าอีกรอบ <small>· กุญแจเหลือ {result.keys} ดอก</small></button>
          : <>
              <p className={styles.nokeyLine}><Key size={16} /> กุญแจหมดแล้ว ได้เพิ่มจากการผจญภัยถ้ำน้ำแข็ง</p>
              <button type="button" className={styles.cta} disabled={leaving} onClick={() => void leave("adventure", "/dungeon")}>ไปผจญภัยหากุญแจ</button>
            </>}
      <button type="button" className={styles.ghost} disabled={!result || leaving} onClick={() => void leave("home", "/pet")}><Home size={20} /> กลับบ้าน</button>
    </div>
  </div>;
}
