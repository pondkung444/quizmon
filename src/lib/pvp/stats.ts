// ระบบ "ประลอง" (PvP) — interface สเตตัส/การ์ด ที่ต้องล็อกตั้งแต่สไลซ์ 1
// อ้างอิง: doc/pvp-phase-plan-2026-09-03.md §0.2, doc/pvp-slice-1-draft-2026-09-03.md §2
//
// ห้ามแตะ src/lib/exp.ts / src/lib/evolution.ts / src/lib/raid/stats.ts — PvP มีชุดอุปกรณ์แยกของตัวเอง
// จึงต้องมี effectiveStat เวอร์ชันของตัวเอง คนละตัวกับ raid

export type PvpStatKey = "hp" | "atk" | "def" | "spd" | "foc";
export type PvpPetStats = Record<PvpStatKey, number>;

// สไลซ์ 1: raw + 0 (ไม่มีอุปกรณ์ PvP)
// สไลซ์ 4: raw + โบนัสจากอุปกรณ์ PvP ที่ผูกกับแมตช์ — เติม "ที่จุดเดียวนี้" คู่กับ SQL snapshot
//          ใน accept_pvp_challenge (pvp_matches.stat_a/stat_b)
//
// กฎเหล็ก: ทุกจุดในโค้ด PvP ที่อ่านสเตตัส (ดาเมจ ATK/DEF, คริ FOC, ความยาว timer จาก SPD)
// ต้องผ่านฟังก์ชันนี้เท่านั้น ห้ามอ่าน stats.atk / pet.stat_atk ตรงๆ
// (turn order ไม่ใช้ SPD แล้ว — ผู้รับคำท้าได้เล่นก่อนเสมอ ดู accept_pvp_challenge revision 2026-09-04)
export function pvpEffectiveStat(stats: PvpPetStats, stat: PvpStatKey): number {
  return stats[stat] ?? 0;
}

export function parsePvpStats(raw: unknown): PvpPetStats {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return {
    hp: num(r.hp),
    atk: num(r.atk),
    def: num(r.def),
    spd: num(r.spd),
    foc: num(r.foc),
  };
}

// โครงสร้างการ์ด — ล็อกรูปร่างตั้งแต่สไลซ์ 1 (สไลซ์ 2 แค่เติม effect_id ที่มีอยู่แล้ว)
export type PvpCard = {
  id: string;
  chapter: string; // questions.chapter
  subject: string; // questions.subject
  difficulty: number; // questions.difficulty
  effect_id: string | null; // สไลซ์ 1 = null เสมอ
  question_id: number; // ผูกตั้งแต่จั่ว (ไม่ null ในสไลซ์นี้)
};
