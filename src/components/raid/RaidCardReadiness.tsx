import type { EligibleRaidPet, RaidGearItemFull } from "@/lib/raid";
import { effectiveStat, type EquippedGearForStats } from "@/lib/raid/stats";
import { BOSSES, CARDS, createBattle, checkPreview, isBossId, STAT_REQUIREMENTS, statPercent, type CardId, type Stats, type Stat } from "@/lib/raid/cards/engine";

const EXAMPLES: CardId[] = ["burst", "counter", "dodge", "pierce", "mend"];
const formatChance = (chance: number) => chance === 100 ? "แน่นอน" : chance === 0 ? "พื้นฐาน" : `${chance}%`;

export default function RaidCardReadiness({ slug, pet, items }: { slug: string; pet: EligibleRaidPet; items: RaidGearItemFull[] }) {
  if (!isBossId(slug)) return null;
  const gear = items.filter(item => item.equippedPetId === pet.id) as EquippedGearForStats[];
  const raw = { stat_hp: pet.rawStats.hp, stat_atk: pet.rawStats.atk, stat_def: pet.rawStats.def, stat_spd: pet.rawStats.spd, stat_foc: pet.rawStats.foc };
  const stats = Object.fromEntries((Object.keys(pet.rawStats) as Stat[]).map(stat => [stat,effectiveStat(raw,stat,pet.caps,gear)])) as Stats;
  const baseStats = Object.fromEntries((Object.keys(pet.rawStats) as Stat[]).map(stat => [stat,effectiveStat(raw,stat,pet.caps)])) as Stats;
  const equipped = createBattle(slug,stats,()=>0.5);
  const base = createBattle(slug,baseStats,()=>0.5);
  return <section className="w-full max-w-xs rounded-xl border border-sky-300/30 bg-sky-950/30 p-3">
    <h2 className="text-sm font-bold text-text">ชุดนี้รับมือบอสอย่างไร?</h2>
    <p className="mt-1 text-xs text-text2">เลือดเริ่มต้น {equipped.hpMax} · บอส {BOSSES[slug].hp}</p>
    <p className="mt-2 text-sm text-text">stat รวม {statPercent(stats).toFixed(1)}% / เกณฑ์ {STAT_REQUIREMENTS[slug]}% · ต้องตอบถูกอย่างน้อย 60%</p>
    {statPercent(stats)<STAT_REQUIREMENTS[slug] && <p className="mt-2 text-xs text-amber-200">ชุดนี้ยังไม่ถึงเกณฑ์ชนะ เข้าไปฝึกและรับอุปกรณ์ได้ แต่ต้องเพิ่ม stat ก่อนพิชิตด่าน</p>}
    <p className="mt-2 text-xs text-text3">โอกาสผลพิเศษเมื่อตอบถูก: ไม่ใส่ของ → ชุดปัจจุบัน</p>
    <ul className="mt-2 space-y-2 text-xs">
      {EXAMPLES.map(id => <li key={id} className="flex justify-between gap-2">
        <span>{CARDS[id].name} · {CARDS[id].stat?.toUpperCase()}</span>
        <strong className="shrink-0 text-sky-200">{formatChance(checkPreview(base,id).chance)} → {formatChance(checkPreview(equipped,id).chance)}</strong>
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-text3">ตัวอย่างช่วงแรกของบอส • ช่วงท้ายเกณฑ์สูงขึ้น ใส่ของเพิ่มได้ถึงเพดานเดิม และอุปกรณ์ไม่เพิ่ม FOC</p>
  </section>;
}
