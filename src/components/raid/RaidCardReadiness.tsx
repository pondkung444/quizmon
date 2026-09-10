import type { EligibleRaidPet, RaidGearItemFull } from "@/lib/raid";
import { effectiveStat, type EquippedGearForStats } from "@/lib/raid/stats";
import { BOSSES, createBattle, checkPreview, isBossId, QUESTION_LIMITS, type Stats, type Stat } from "@/lib/raid/cards/engine";


export default function RaidCardReadiness({ slug, pet, items }: { slug: string; pet: EligibleRaidPet; items: RaidGearItemFull[] }) {
  if (!isBossId(slug)) return null;
  const gear = items.filter(item => item.equippedPetId === pet.id) as EquippedGearForStats[];
  const raw = { stat_hp: pet.rawStats.hp, stat_atk: pet.rawStats.atk, stat_def: pet.rawStats.def, stat_spd: pet.rawStats.spd, stat_foc: pet.rawStats.foc };
  const stats = Object.fromEntries((Object.keys(pet.rawStats) as Stat[]).map(stat => [stat,effectiveStat(raw,stat,pet.caps,gear)])) as Stats;
  const baseStats = Object.fromEntries((Object.keys(pet.rawStats) as Stat[]).map(stat => [stat,effectiveStat(raw,stat,pet.caps)])) as Stats;
  const equipped = createBattle(slug,stats,()=>0.5);
  const base = createBattle(slug,baseStats,()=>0.5);
  return <section className="w-full max-w-xs rounded-xl border border-sky-300/30 bg-sky-950/30 p-3">
    <h2 className="text-sm font-bold text-text">ท้าทายสั้น ๆ ไม่เกิน {QUESTION_LIMITS[slug]} ข้อ</h2>
    <p className="mt-1 text-xs text-text2">เลือดเริ่มต้น {equipped.hpMax} · บอส {BOSSES[slug].hp}</p>
    <p className="mt-2 text-sm text-text">เลือกตีแรงหรือตีพร้อมฟื้นเลือด ตอบถูกแล้วลุ้นพลังมอน จบรอบได้ของรางวัล</p>
    <p className="mt-2 text-xs text-text3">ลุ้นคริติคอลเมื่อตอบถูก: ไม่ใส่ของ {checkPreview(base,"strike").chance}% → ชุดนี้ {checkPreview(equipped,"strike").chance}%</p>
    <p className="mt-3 text-xs text-text3">อุปกรณ์ช่วยให้มอนแข็งแรงขึ้น ทุกชุดมีโอกาสชนะ ไม่ต้องจำท่าบอสหรือสะสมพลังการ์ด</p>
  </section>;
}
