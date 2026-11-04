import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, Egg, Key, Lock } from "lucide-react";
import type { RaidZoneWithLevels } from "@/lib/raid";
import { RAID_EPIC_PITY_CAP } from "@/lib/raid/rewardConstants";
import { RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";
import { QUESTION_LIMITS, isBossId } from "@/lib/raid/cards/engine";
import styles from "./select.module.css";

export const TIER_TH = ["ง่าย", "กลาง", "ยาก"];

export function NoKeyBox() {
  return <div className={styles.nokey}>
    <span className={styles.kk}><Key size={22} /></span>
    <span className={styles.grow}><strong>กุญแจหมดแล้ว</strong><span>ส่ง Qmon ไปผจญภัยถ้ำน้ำแข็ง กลับมาจะได้กุญแจภูเหนือเมฆ</span></span>
    <Link href="/dungeon" className={styles.mini}>ไปผจญภัย</Link>
  </div>;
}

export function ArenaTop({ title, sub, back, keys }: { title: string; sub: string; back: string; keys?: number }) {
  return <header className={styles.top}>
    <Link href={back} className={styles.iconBtn} aria-label={back === "/pet" ? "กลับบ้าน" : "กลับไปเลือกด่าน"}><ChevronLeft size={22} /></Link>
    <h1>{title}<span>{sub}</span></h1>
    {keys !== undefined && <span className={`${styles.chip} ${keys ? "" : styles.chipZero}`}><Key size={16} /> กุญแจ {keys} ดอก</span>}
  </header>;
}

// Level cards for the arena (flag on). The old RaidLevelSelect stays for flag off.
export default function ArenaLevelSelect({ zone, keys, petParam }: { zone: RaidZoneWithLevels; keys: number; petParam: string | null }) {
  return <main className={styles.page} data-app-wide>
    <ArenaTop title="ท้าทาย" sub={RAID_MOUNTAIN_NAME_TH} back="/pet" keys={keys} />
    {keys === 0 && <NoKeyBox />}
    <div className={`${styles.levels} ${styles.enter}`}>
      {zone.levels.map((level, i) => {
        const tier = Math.min(i, 2);
        const limit = isBossId(level.slug) ? QUESTION_LIMITS[level.slug] : null;
        const prev = zone.levels[i - 1];
        const inner = <>
          {level.backgroundPath && <Image src={level.backgroundPath} alt="" fill sizes="(min-width:1024px) 720px, 100vw" />}
          <span className={styles.shade} />
          <span className={styles.levelIn}>
            <span className={styles.tier}>
              {[0, 1, 2].map((t) => <i key={t} className={t <= tier ? "" : styles.off} />)} {TIER_TH[tier]}{limit ? ` · ${limit} ข้อ` : ""}
            </span>
            <h2>{level.nameTh}</h2>
            {level.bossNameTh && <p>บอส {level.bossNameTh}</p>}
            <span className={styles.foot}>
              {level.unlocked
                ? <>{level.cleared ? <span className={styles.done}><Check size={16} /> ชนะแล้ว</span> : <span />}
                    <span className={`${styles.go} ${keys ? "" : styles.goOff}`}>{keys ? "ท้าเลย" : "ดูด่าน"}</span></>
                : <span className={styles.lockWhy}><Lock size={18} /> ชนะ{prev?.nameTh ?? "ด่านก่อนหน้า"}ก่อน แล้วด่านนี้จะเปิด</span>}
            </span>
            {level.epicPity !== null && <span className={styles.pity}>
              <Egg size={16} /> ชนะด่านนี้ลุ้นไข่ศักดิ์นภา
              <span className={styles.pityBar} aria-label={`${level.epicPity} จาก ${RAID_EPIC_PITY_CAP}`}>
                {Array.from({ length: RAID_EPIC_PITY_CAP }, (_, k) => <i key={k} className={k < level.epicPity! ? styles.on : ""} />)}
              </span>
            </span>}
          </span>
        </>;
        return level.unlocked
          ? <Link key={level.id} href={`/raid/${level.slug}${petParam ? `?pet=${petParam}` : ""}`} className={styles.level}>{inner}</Link>
          : <div key={level.id} className={`${styles.level} ${styles.locked}`} aria-disabled="true">{inner}</div>;
      })}
    </div>
    <p className={styles.note}>ทุกรอบได้อุปกรณ์กลับบ้าน ไม่ว่าจะชนะหรือไม่</p>
  </main>;
}
