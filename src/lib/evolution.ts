// เกณฑ์ exp สะสม (ของ pet ตัวเดียว) ที่ต้องถึงเพื่อ "ขยับจาก stage นี้ไป stage ถัดไป"
export const STAGE_EXP_THRESHOLD: Record<number, number> = {
  1: 50,   // ไข่ -> ตัวอ่อน
  2: 350,  // ตัวอ่อน -> วัยเจริญ
  3: 900,  // วัยเจริญ -> ร่างสมบูรณ์
  // stage 4 = สูงสุดใน MVP ไม่มี threshold ต่อ (stage 5 อยู่นอก scope)
};

// ป้ายชื่อ + คำอธิบายระยะ (copy ที่โชว์ผู้เล่น) — จุดเดียวที่ควรแก้ข้อความพวกนี้
export const STAGE_LABEL_TH: Record<number, { name: string; description: string }> = {
  1: { name: "เริ่มต้น", description: "กำลังรอฟักตัว" },
  2: { name: "ฝึกฝน", description: "เริ่มเติบโต" },
  3: { name: "แกร่งกล้า", description: "เริ่มเห็นสายวิวัฒนาการ" },
  4: { name: "ร่างสมบูรณ์", description: "เติบโตเต็มที่แล้ว" },
};

// ขยับได้ครั้งละ "1 stage สูงสุด" เท่านั้น ต่อการเรียก 1 ครั้ง แม้ exp จะเกินหลายธรณีประตูก็ตาม
// สำคัญ: อย่าคำนวณ stage จาก exp ทั้งก้อนแบบเดิม (pet.ts) ให้ดูจาก currentStage เป็นตัวตั้งเสมอ
export function tryAdvanceStage(currentStage: number, currentExp: number): number {
  if (currentStage >= 4) return currentStage;
  const threshold = STAGE_EXP_THRESHOLD[currentStage];
  if (threshold !== undefined && currentExp >= threshold) {
    return currentStage + 1;
  }
  return currentStage;
}

// --- Subline: เช็คตอนขยับเข้า stage 3 เท่านั้น (ครั้งเดียว, lock ไว้ถาวร) ---
export type Subline = "math" | "science" | "balanced";

export function determineSubline(mathCorrect: number, scienceCorrect: number): Subline {
  const total = mathCorrect + scienceCorrect;
  if (total === 0) return "balanced";
  if (mathCorrect / total >= 0.6) return "math";
  if (scienceCorrect / total >= 0.6) return "science";
  return "balanced";
}

// --- Personality: เช็คตอนขยับเข้า stage 4 เท่านั้น (ครั้งเดียว, lock ไว้ถาวร) ---
// playDaysLast7 = จำนวนวัน distinct ใน 7 วันล่าสุด ที่มี quiz_attempts ของ "pet ตัวนี้ตัวเดียว" (pet_id filter)
export type Personality = "A" | "B";

export function determinePersonality(playDaysLast7: number): Personality {
  return playDaysLast7 >= 4 ? "A" : "B"; // >50% ของ 7 วัน
}

// --- ชื่อสายพันธุ์ (copy ที่โชว์ผู้เล่น) — key ด้วย egg_types.sprite_prefix ---
type SublineSpeciesName = {
  base: string;
  byPersonality: Record<Personality, string>;
};

type EggSpeciesNameSet = {
  baby: string; // stage 2
  bySubline: Record<Subline, SublineSpeciesName>; // stage 3 (.base) / stage 4 (.byPersonality)
};

const SPECIES_NAME_TH: Record<string, EggSpeciesNameSet> = {
  egg1: {
    baby: "เพลิงน้อย",
    bySubline: {
      math: { base: "เพลิงผลึก", byPersonality: { A: "เพลิงผลึก: คมสังหาร", B: "เพลิงผลึก: กำแพงแก้ว" } },
      science: { base: "เพลิงลาวา", byPersonality: { A: "เพลิงลาวา: ปะทุ", B: "เพลิงลาวา: แก่นหิน" } },
      balanced: { base: "เพลิงโอฬาร", byPersonality: { A: "เพลิงโอฬาร: ทรงเดช", B: "เพลิงโอฬาร: เกราะทอง" } },
    },
  },
  egg2: {
    baby: "พฤกษ์น้อย",
    bySubline: {
      math: { base: "พฤกษ์สลัก", byPersonality: { A: "พฤกษ์สลัก: หนามคม", B: "พฤกษ์สลัก: เปลือกหนา" } },
      science: { base: "พฤกษ์นิเวศ", byPersonality: { A: "พฤกษ์นิเวศ: ผลิบาน", B: "พฤกษ์นิเวศ: รากลึก" } },
      balanced: { base: "พฤกษ์บรรพ", byPersonality: { A: "พฤกษ์บรรพ: เวทไพร", B: "พฤกษ์บรรพ: พงหลัก" } },
    },
  },
};

// mirror ข้อจำกัดเดียวกับ getPetImagePath (src/lib/petImage.ts): stage 3 ต้องมี subline,
// stage 4 ต้องมี subline+personality — throw แบบเดียวกันแทนการเดา/ใส่ค่า default เงียบๆ
export function getSpeciesName(
  spritePrefix: string,
  stage: number,
  subline: Subline | null,
  personality: Personality | null,
  eggNameTh: string
): string {
  if (stage === 1) return eggNameTh;

  const set = SPECIES_NAME_TH[spritePrefix];
  if (!set) {
    throw new Error(`getSpeciesName: ไม่พบชื่อสายพันธุ์สำหรับ sprite_prefix="${spritePrefix}"`);
  }

  if (stage === 2) return set.baby;

  if (stage === 3) {
    if (!subline) {
      throw new Error(`getSpeciesName: pet stage 3 ต้องมี subline แต่ได้ null (prefix=${spritePrefix})`);
    }
    return set.bySubline[subline].base;
  }

  if (stage === 4) {
    if (!subline || !personality) {
      throw new Error(
        `getSpeciesName: pet stage 4 ต้องมี subline+personality แต่ได้ subline=${subline}, personality=${personality} (prefix=${spritePrefix})`
      );
    }
    return set.bySubline[subline].byPersonality[personality];
  }

  throw new Error(`getSpeciesName: stage ไม่ถูกต้อง: ${stage}`);
}

// --- ตัวคูณชั้น subline (หมวด 5.3 ของเอกสาร) ---
export const SUBLINE_MULTIPLIER: Record<Subline, { hp: number; atk: number; def: number; spd: number; foc: number }> = {
  math:     { atk: 1.3, foc: 1.3, hp: 0.9, def: 0.9, spd: 1.0 },
  science:  { atk: 0.9, foc: 0.9, hp: 1.3, def: 1.3, spd: 1.0 },
  balanced: { atk: 1.0, foc: 1.0, hp: 1.0, def: 1.0, spd: 1.1 },
};

// --- ตัวคูณชั้นบุคลิก (หมวด 5.4 ของเอกสาร) — +5% ให้เฉพาะสเตตัสที่ระบุ ---
export const PERSONALITY_BONUS: Record<Personality, Partial<{ hp: number; atk: number; def: number; spd: number; foc: number }>> = {
  A: { atk: 0.05, spd: 0.05 },
  B: { hp: 0.05, def: 0.05 },
};

// --- ค่าดิบก่อนคูณ (หมวด 5.2 ของเอกสาร) ---
export interface RawStatInputs {
  daysPlayedAllTime: number; // จำนวนวัน distinct ที่เล่น pet ตัวนี้ (ทั้งอายุ ไม่ใช่แค่ 7 วัน) -> HP
  mathCorrect: number;
  scienceCorrect: number;    // -> ATK ใช้ผลรวม, DEF ใช้ min(math,science)
  accuracyPct: number;       // 0-100, ความแม่นยำเฉลี่ยของ pet ตัวนี้ -> FOC
  bestCombo: number;         // -> SPD
}

export function computeRawStats(input: RawStatInputs) {
  return {
    hp: input.daysPlayedAllTime,
    atk: input.mathCorrect + input.scienceCorrect,
    foc: input.accuracyPct,
    spd: input.bestCombo,
    def: Math.min(input.mathCorrect, input.scienceCorrect) * 2,
  };
}

// --- ไข่ signature (หมวด 5.5) จาก egg_types.stat_profile jsonb ---
export interface EggStatProfile {
  base_offset: number;
  rate_multiplier: number;
  caps: { hp: number; atk: number; def: number; spd: number; foc: number };
}

// รวมทุกชั้น: raw -> ×subline -> ×(1+personality bonus) -> ×egg.rate_multiplier + egg.base_offset -> clamp ที่ caps
// หมายเหตุ: สเตตัสยังไม่มีหน้าจอใช้งานจริงใน MVP (เก็บ snapshot ไว้เฉยๆ) — สูตรนี้เป็น baseline ที่ตรงตามเอกสาร
// ตัวเลขละเอียด (การ scale ให้ raw เข้าใกล้ cap พอดี) ค่อยจูนตอนสเตตัสจะถูกใช้งานจริง post-MVP
export function snapshotStats(
  raw: ReturnType<typeof computeRawStats>,
  subline: Subline,
  personality: Personality,
  egg: EggStatProfile
) {
  const sublineMult = SUBLINE_MULTIPLIER[subline];
  const persBonus = PERSONALITY_BONUS[personality];
  const stats = { hp: 0, atk: 0, def: 0, spd: 0, foc: 0 } as Record<
    "hp" | "atk" | "def" | "spd" | "foc",
    number
  >;

  (["hp", "atk", "def", "spd", "foc"] as const).forEach((key) => {
    const afterSubline = raw[key] * sublineMult[key];
    const afterPersonality = afterSubline * (1 + (persBonus[key] ?? 0));
    const afterEggCurve = afterPersonality * egg.rate_multiplier + egg.base_offset;
    stats[key] = Math.min(egg.caps[key], Math.round(afterEggCurve));
  });

  return stats;
}
