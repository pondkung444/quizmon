import Image from "next/image";
import Link from "next/link";
import { Egg, Gift, Swords } from "lucide-react";
import type { RaidNoPetInfo } from "@/lib/raid/arena";
import { RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";
import { ArenaTop } from "./ArenaLevelSelect";
import styles from "./select.module.css";

// No stage-4 Qmon yet: invite them to keep training, never "not eligible".
export default function ArenaNoPet({ pet }: { pet: RaidNoPetInfo }) {
  return <main className={styles.page} data-app-wide>
    <ArenaTop title="ท้าทาย" sub={RAID_MOUNTAIN_NAME_TH} back="/pet" />
    <div className={`${styles.nopet} ${styles.enter}`}>
      <div className={styles.npScene}>
        <Image src="/raid/ridge_mist.webp" alt="" fill sizes="(min-width:1024px) 720px, 100vw" />
        <span className={styles.npShade} />
        {pet && <span className={styles.npPet}><Image src={pet.imagePath} alt={pet.name} fill sizes="120px" /></span>}
      </div>
      <div>
        <h2>ภูเหนือเมฆรอ Qmon ที่โตเต็มที่</h2>
        <p className={styles.lead}>{pet ? `พา${pet.name}ไปถึงระยะ 4 แล้วมาท้าบอสสามตัวบนภูเขากัน` : "ฝึก Qmon ให้ถึงระยะ 4 แล้วมาท้าบอสสามตัวบนภูเขากัน"}</p>
      </div>
      {pet && <div className={styles.npProg}>
        <div className={styles.npRow}><span>{pet.name} · ระยะ {pet.stage}</span><span>อีก {pet.expLeft} EXP</span></div>
        <div className={styles.expBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pet.progress * 100)}>
          <div style={{ width: `${Math.round(pet.progress * 100)}%` }} />
        </div>
      </div>}
      <div>
        <ul className={styles.npList}>
          <li><Swords size={22} /><span>สู้บอสด้วยการตอบโจทย์จากบทที่เลือกเอง</span></li>
          <li><Gift size={22} /><span>ทุกรอบได้อุปกรณ์ไว้แต่งตัว Qmon</span></li>
          <li><Egg size={22} /><span>ชนะด่านยากลุ้นไข่ศักดิ์นภา</span></li>
        </ul>
        <Link href="/quiz" className={styles.cta}>{pet ? `ไปฝึกกับ${pet.name}` : "ไปฝึกกับ Qmon"}</Link>
      </div>
    </div>
  </main>;
}
