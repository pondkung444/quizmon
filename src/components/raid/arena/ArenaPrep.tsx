"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Key } from "lucide-react";
import type { EligibleRaidPet, RaidGearItemFull, RaidTypeInfo } from "@/lib/raid";
import { startRaidRun } from "@/app/raid/actions";
import { RAID_GEAR_SLOT_ANATOMY_TH, RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";
import { effectiveStat, type EquippedGearForStats } from "@/lib/raid/stats";
import { BOSSES, QUESTION_LIMITS, createChapterBattle, isBossId, type Stat, type Stats } from "@/lib/raid/cards/engine";
import { track } from "@/lib/analytics";
import { ArenaTop, TIER_TH } from "./ArenaLevelSelect";
import ArenaGear from "./ArenaGear";
import ChapterSheet, { type ChapterSelection } from "./ChapterSheet";
import { changedFromAuto, type RaidChapterList } from "./chapters";
import styles from "./select.module.css";

const SLOTS = ["head", "body", "feet"] as const;
const rawSum = (p: EligibleRaidPet) => p.rawStats.hp + p.rawStats.atk + p.rawStats.def + p.rawStats.spd + p.rawStats.foc;

// Same HP the arena starts with: the v4 battle built from effective stats with the worn gear.
function startingHp(slug: string, pet: EligibleRaidPet, items: RaidGearItemFull[]): number | null {
  if (!isBossId(slug)) return null;
  const gear = items.filter((i) => i.equippedPetId === pet.id) as EquippedGearForStats[];
  const raw = { stat_hp: pet.rawStats.hp, stat_atk: pet.rawStats.atk, stat_def: pet.rawStats.def, stat_spd: pet.rawStats.spd, stat_foc: pet.rawStats.foc };
  const stats = Object.fromEntries((Object.keys(pet.rawStats) as Stat[]).map((s) => [s, effectiveStat(raw, s, pet.caps, gear)])) as Stats;
  return createChapterBattle(slug, stats, () => 0.5).hpMax;
}

export default function ArenaPrep({ raidType, tier, pets, ticketCount, preselectedPetId, gearItems, chapters, startRun = startRaidRun }: {
  raidType: RaidTypeInfo;
  tier: number;
  pets: EligibleRaidPet[];
  ticketCount: number;
  preselectedPetId: string | null;
  gearItems: RaidGearItemFull[];
  // null: no grade band yet, or the list could not load
  chapters: RaidChapterList | null;
  // Swappable only so a local preview can show the start error without spending a key.
  startRun?: typeof startRaidRun;
}) {
  const router = useRouter();
  const slug = raidType.slug;
  const boss = isBossId(slug) ? BOSSES[slug] : null;
  const limit = isBossId(slug) ? QUESTION_LIMITS[slug] : raidType.bossQuestionCount;
  const sorted = useMemo(() => [...pets].sort((a, b) => rawSum(b) - rawSum(a)), [pets]);
  // ?pet= from the collection locks the Qmon; "เปลี่ยน" goes back to /raid like the old screen.
  const locked = preselectedPetId ? pets.find((p) => p.id === preselectedPetId) ?? null : null;
  const [petId, setPetId] = useState(preselectedPetId ?? sorted[0]?.id ?? null);
  const pet = pets.find((p) => p.id === petId) ?? null;
  const [items, setItems] = useState(gearItems);
  const [sel, setSel] = useState<ChapterSelection>({ auto: true, keys: [] });
  const [sheet, setSheet] = useState<"chapters" | "pet" | "gear" | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byKey = useMemo(() => new Map((chapters?.chapters ?? []).map((c) => [c.key, c])), [chapters]);
  const shownKeys = sel.auto ? chapters?.auto ?? [] : sel.keys;
  const canStart = !!pet && !!chapters && shownKeys.length > 0 && ticketCount > 0;
  const hp = pet ? startingHp(slug, pet, items) : null;
  const petName = pet ? pet.nickname ?? pet.speciesName : "Qmon";

  const missing = useMemo(() => {
    if (!pet) return [];
    const worn = new Set(items.filter((i) => i.equippedPetId === pet.id).map((i) => i.slot));
    return SLOTS.filter((s) => !worn.has(s) && items.some((i) => i.equippedPetId === null && i.slot === s));
  }, [items, pet]);

  const closeChapters = (next: ChapterSelection) => { setSel(next); setSheet(null); };

  function openChapters() {
    track("raid_chapter_sheet_open", { boss: slug });
    setSheet("chapters");
  }

  async function start() {
    if (!canStart || sending || !pet || !chapters) return;
    setSheet(null);
    setSending(true);
    setError(null);
    try {
      await startRun(pet.id, raidType.id, { mode: sel.auto ? "auto" : "manual", keys: shownKeys });
      track("raid_start", { boss: slug, chapterMode: sel.auto ? "auto" : "manual", chapterCount: shownKeys.length, changedFromAuto: changedFromAuto(chapters.auto, sel) }, pet.id);
      router.refresh();
    } catch (e) {
      // The RPC raises before it takes a key, so the count on screen stays right.
      setError(e instanceof Error ? e.message : "เริ่มการท้าทายไม่สำเร็จ");
      setSending(false);
    }
  }

  return <main className={styles.page} data-app-wide>
    <ArenaTop title={raidType.nameTh} sub={`${RAID_MOUNTAIN_NAME_TH} · ด่าน${TIER_TH[Math.min(tier, 2)]}`} back={`/raid${locked ? `?pet=${locked.id}` : ""}`} />
    <div className={styles.enter}>
      <div className={styles.hero}>
        <Image src={`/raid/boss_scene_${slug}.webp`} alt="" fill priority sizes="(min-width:1024px) 720px, 100vw" />
        <span className={styles.heroShade} />
        <span className={styles.heroBoss}><Image src={`/raid/boss_${slug}.png`} alt={boss?.name ?? ""} fill sizes="360px" /></span>
        {pet && <span className={styles.heroPet}><Image src={pet.imagePath} alt={petName} fill sizes="92px" /></span>}
        <div className={styles.heroT}><b>บอสของด่าน</b><strong>{boss?.name ?? raidType.bossNameTh}</strong></div>
      </div>
      <div className={styles.facts}>
        <span className={styles.chip}>{limit} ข้อ</span>
        <span className={`${styles.chip} ${ticketCount ? "" : styles.chipZero}`}><Key size={16} /> {ticketCount ? `ใช้กุญแจ 1 จาก ${ticketCount} ดอก` : "กุญแจหมดแล้ว"}</span>
      </div>

      <div>
        <p className={styles.secTitle}>Qmon ที่จะไป</p>
        {pet && (() => {
          const body = <>
            <span className={styles.rowImg}><Image src={pet.imagePath} alt="" fill sizes="44px" /></span>
            <span className={styles.grow}><span className={styles.k}>ระยะ 4{hp ? ` · เลือด ${hp}` : ""}</span><span className={styles.v}>{petName}</span></span>
            {(locked || pets.length > 1) && <span className={styles.act}>เปลี่ยน</span>}
          </>;
          if (locked) return <Link href="/raid" className={styles.rowCard}>{body}</Link>;
          return <button type="button" className={styles.rowCard} disabled={pets.length < 2} onClick={() => setSheet("pet")}>{body}</button>;
        })()}
      </div>

      <div>
        <p className={styles.secTitle}>โจทย์มาจากบทไหน</p>
        {chapters
          ? <button type="button" className={styles.rowCard} onClick={openChapters}>
              <span className={styles.grow}>
                <span className={styles.k}>{sel.auto ? "ระบบเลือกบทที่ฝึกบ่อยให้" : `เลือกเอง ${sel.keys.length} บท`}</span>
                <span className={styles.chapters}>{shownKeys.map((k) => <span key={k} className={styles.chip}>{byKey.get(k)?.chapter ?? "บททบทวน"}</span>)}</span>
              </span>
              <span className={styles.act}>เปลี่ยน</span>
            </button>
          : <Link href="/settings" className={styles.setGrade}>ตั้งช่วงชั้นในหน้าตั้งค่าก่อน แล้วระบบจะเลือกบทที่ตรงกับชั้นเรียนให้ <b>ไปตั้งค่า</b></Link>}
      </div>

      {pet && <div>
        <p className={styles.secTitle}>อุปกรณ์</p>
        <ArenaGear key={pet.id} petId={pet.id} items={items} setItems={setItems} />
      </div>}
    </div>

    <div className={styles.bottomCta}>
      {ticketCount === 0
        ? <Link href="/dungeon" className={styles.cta}>ไปผจญภัยหากุญแจ</Link>
        : <button type="button" className={styles.cta} disabled={!canStart || sending} onClick={() => (missing.length ? setSheet("gear") : void start())}>
            {sending ? "กำลังเริ่ม…" : "ใช้กุญแจ 1 ดอก · เริ่มท้าทาย"}
          </button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.note}>ตอบถูกให้{petName}ใช้ท่าเต็มแรง ตอบผิดยังตีเบาๆ ได้ จบรอบได้อุปกรณ์เสมอ</p>
    </div>

    {sheet === "chapters" && chapters && <ChapterSheet list={chapters} value={sel} onDone={closeChapters} />}

    {sheet === "pet" && <div className={styles.sheetWrap}>
      <div className={styles.scrim} onClick={() => setSheet(null)} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="เลือก Qmon">
        <div className={styles.grab} />
        <h3>เลือก Qmon ที่จะไป</h3>
        <p className={styles.lead}>Qmon ระยะ 4 ทุกตัวไปท้าทายได้</p>
        <div className={styles.sheetScroll}>
          {sorted.map((p) => <button key={p.id} type="button" className={`${styles.opt} ${p.id === petId ? styles.on : ""}`} aria-pressed={p.id === petId}
            onClick={() => { setPetId(p.id); setSheet(null); }}>
            <span className={styles.petOpt}><Image src={p.imagePath} alt="" fill sizes="48px" /></span>
            <span className={styles.grow}><span className={styles.n}>{p.nickname ?? p.speciesName}</span><span className={styles.s}>{p.speciesName}</span></span>
            {p.id === petId && <Check size={20} />}
          </button>)}
        </div>
      </div>
    </div>}

    {sheet === "gear" && <div className={styles.sheetWrap}>
      <div className={styles.scrim} onClick={() => setSheet(null)} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="มีอุปกรณ์ที่ยังไม่ได้ใส่">
        <div className={styles.grab} />
        <h3>มีอุปกรณ์ที่ยังไม่ได้ใส่</h3>
        <p className={styles.lead}>ช่อง{missing.map((s) => RAID_GEAR_SLOT_ANATOMY_TH[s]).join(" และ ")}ยังว่าง แต่มีของในคลังให้ใส่</p>
        <div className={styles.sheetFoot}>
          <button type="button" className={styles.cta} onClick={() => setSheet(null)}>กลับไปใส่อุปกรณ์</button>
          <button type="button" className={styles.ghost} onClick={() => void start()}>เริ่มเลยโดยไม่ใส่</button>
        </div>
      </div>
    </div>}
  </main>;
}
