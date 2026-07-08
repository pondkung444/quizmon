// เกณฑ์ exp สะสม (ของ pet ตัวเดียว) ที่ต้องถึงเพื่อ "ขยับจาก stage นี้ไป stage ถัดไป"
export const STAGE_EXP_THRESHOLD: Record<number, number> = {
  1: 50,   // ไข่ -> ตัวอ่อน
  2: 350,  // ตัวอ่อน -> วัยเจริญ
  3: 900,  // วัยเจริญ -> ร่างสมบูรณ์
  // stage 4 = สูงสุดใน MVP ไม่มี threshold ต่อ (stage 5 อยู่นอก scope)
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
