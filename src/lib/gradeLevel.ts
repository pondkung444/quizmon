// ไฟล์นี้ต้องเป็นฟังก์ชันล้วน ห้าม import อะไรที่เป็น server-only (เช่น admin client) — client component
// (GradeLevelSetting) import ค่าคงที่จากที่นี่ตรงๆ; ตัวอ่านโปรไฟล์จาก DB อยู่ใน gradeBand.ts (getGradeProfile)
import type { GradeBand } from "@/lib/gradeBand";

// ระดับชั้นที่ผู้ใช้เลือกเองได้ (ฟอร์มสมัคร/GradeLevelSetting) — ต้องตรงกับ CHECK constraint
// profiles_grade_level_check (supabase/migrations/20260725144924_fix_signup_metadata_add_grade_level.sql)
// ห้ามใส่ ป.x ที่นี่จนกว่า DB จะรับค่า — ป.x ตั้งผ่าน DB ตรงเท่านั้น (เฟสทดสอบ primary)
export const SELECTABLE_GRADE_LEVELS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;
export type SelectableGradeLevel = (typeof SELECTABLE_GRADE_LEVELS)[number];

// ทุกชั้นที่ระบบรู้จักภายใน (รวม primary) — ใช้กับ gradeBandOf/การกรองโจทย์ ไม่ใช่รายการให้ผู้ใช้เลือก
export const ALL_GRADE_LEVELS = ["ป.4", "ป.5", "ป.6", ...SELECTABLE_GRADE_LEVELS] as const;
export type GradeLevel = (typeof ALL_GRADE_LEVELS)[number];

// ลำดับชั้นในแต่ละ band จากต่ำไปสูง — ใช้คำนวณ "ชั้นที่เห็นได้" (ชั้นตัวเองและชั้นก่อนหน้า ภายใน band เดียวกันเท่านั้น)
const GRADE_LEVELS_BY_BAND: Record<GradeBand, readonly string[]> = {
  primary: ["ป.4", "ป.5", "ป.6"],
  junior: ["ม.1", "ม.2", "ม.3"],
  senior: ["ม.4", "ม.5", "ม.6"],
};

// ตรวจค่าที่ผู้ใช้ส่งมาเปลี่ยนชั้น — รับเฉพาะ ม.1–ม.6 (ป.x ยังเลือกเองไม่ได้)
export function isGradeLevel(value: unknown): value is SelectableGradeLevel {
  return typeof value === "string" && (SELECTABLE_GRADE_LEVELS as readonly string[]).includes(value);
}

// รับทุกชั้นที่ระบบรู้จัก (รวม ป.x) — ใช้เฉพาะเมื่อผู้ใช้ปัจจุบันเป็น ป.x อยู่แล้ว (ดู gradeChangeKind)
export function isAnyGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === "string" && (ALL_GRADE_LEVELS as readonly string[]).includes(value);
}

export type GradeChangeKind = "invalid" | "same" | "within_band" | "cross_band";

// จัดประเภทการเปลี่ยนชั้น (ฟังก์ชันล้วน ให้ server action ใช้และเทสต์ได้)
// ผู้ใช้ ม.x เลือก ป.x เองไม่ได้ (invalid) — ผู้ใช้ ป.x เลือกได้ทั้ง ป.4-6 และ ม.1-6 (ข้ามกลุ่ม = cross_band)
export function gradeChangeKind(currentLevel: string | null, currentBand: GradeBand | null, next: string): GradeChangeKind {
  const fromPrimary = typeof currentLevel === "string" && currentLevel.startsWith("ป.");
  if (!isAnyGradeLevel(next) || (!fromPrimary && !isGradeLevel(next))) return "invalid";
  if (currentLevel === next) return "same";
  return gradeBandOf(next) !== currentBand ? "cross_band" : "within_band";
}

// guard ค่า grade_band ที่ DB คืนมา (ไม่ใช่ runtime-checked ที่ต้นทาง) — คืน null ถ้าไม่รู้จัก
export function normalizeGradeBand(value: unknown): GradeBand | null {
  return value === "primary" || value === "junior" || value === "senior" ? value : null;
}

// สอดคล้องกับคอลัมน์ generated profiles.grade_band (ป.4-6 = primary, ม.1-3 = junior, ม.4-6 = senior)
export function gradeBandOf(level: GradeLevel): GradeBand {
  if (level.startsWith("ป.")) return "primary";
  return level === "ม.4" || level === "ม.5" || level === "ม.6" ? "senior" : "junior";
}

// กระดานผู้นำรายสัปดาห์/Hall of Fame รวม primary เข้ากับ junior ชั่วคราว (ป้ายยังเป็น "ม.ต้น") — ทุกจุดที่ส่ง p_grade_band
// เข้า RPC ของกระดานต้องผ่านฟังก์ชันนี้ (โหมดอื่นอย่าง PvP/Raid ไม่ใช้ — primary แยกพูลเอง)
export function leaderboardBandOf(band: GradeBand): "junior" | "senior" {
  return band === "senior" ? "senior" : "junior";
}

// ป้ายกลุ่มบนกระดานผู้นำ/Hall of Fame — junior pool รวม primary ไว้ชั่วคราว แต่ป้ายคง "ม.ต้น"
// จะแยกกระดาน primary ตอนเปิดสาธารณะ
export const LEADERBOARD_BAND_LABEL_TH: Record<"junior" | "senior", string> = {
  junior: "ม.ต้น",
  senior: "ม.ปลาย",
};

// แปลง grade_band ดิบจาก RPC เป็น bucket ของกระดาน — คืน null ถ้าไม่รู้จัก (ผู้เรียกข้ามแถวนั้น ไม่ crash)
export function leaderboardBucketOf(raw: unknown): "junior" | "senior" | null {
  const band = normalizeGradeBand(raw);
  return band ? leaderboardBandOf(band) : null;
}

// โหมด "เลือกบทฝึกฝน": band ของบทที่ผู้เล่นเปิดดู/ฝึกได้ — primary แยกวงของตัวเอง (เห็นเฉพาะบท ป.)
// junior/senior ยังข้ามกันได้ (cross-grade ม.↔ม. ตามเดิม) แต่ห้ามเห็นบท primary
// ค่าที่ไม่รู้จัก → [] (ไม่ตกเป็น junior เงียบๆ; ผู้เรียกที่ต้องการ fallback ต้องทำเองก่อนเรียก)
export function topicBandsFor(band: unknown): GradeBand[] {
  const b = normalizeGradeBand(band);
  if (b === "primary") return ["primary"];
  if (b === "junior" || b === "senior") return ["junior", "senior"];
  return [];
}

// ผู้เล่น band นี้เปิดบทของ band ปลายทางได้ไหม — ใช้ guard ค่า tf.gradeBand ที่ client ส่งมาใน startQuizRound
export function isTopicBandAllowed(userBand: unknown, topicBand: unknown): boolean {
  const b = normalizeGradeBand(topicBand);
  return b !== null && topicBandsFor(userBand).includes(b);
}

// ชั้นของโจทย์ที่ผู้เล่นควรเจอในการสุ่มปกติ (ภายใน band ของตัวเองเท่านั้น ไม่ข้ามไป ม.):
//   junior: ม.1 -> [ม.1], ม.2 -> [ม.1, ม.2], ม.3 -> [ม.1, ม.2, ม.3]
//   primary: ป.4 -> [ป.4], ป.5 -> [ป.4, ป.5], ป.6 -> [ป.4, ป.5, ป.6]
// คืน null = ไม่กรองตามชั้น (senior, ไม่มี grade_level, หรือชั้นไม่ตรงกับ band) — senior ยังไม่ได้ tag
// grade_level ให้โจทย์ครบ จึงไม่ใช้กฎนี้กับ senior
// โจทย์ที่ grade_level เป็น null (สถิติเบื้องต้น, อะตอมและตารางธาตุ) ถูกรวมเสมอผ่าน gradeLevelOrFilter()
export function visibleGradeLevels(band: GradeBand, gradeLevel: string | null | undefined): string[] | null {
  if (band === "senior" || !gradeLevel) return null;
  const levels = GRADE_LEVELS_BY_BAND[band];
  const idx = levels.indexOf(gradeLevel);
  if (idx === -1) return null;
  return levels.slice(0, idx + 1);
}

// สตริงสำหรับ supabase query.or(...) — ใส่ "..." ครอบค่าเพราะ "ม.1" มีจุด ซึ่งเป็นตัวอักษรที่ PostgREST
// ใช้แยก operator ใน or()/in() ถ้าไม่ครอบจะ parse ผิด
export function gradeLevelOrFilter(levels: string[]): string {
  const list = levels.map((l) => `"${l}"`).join(",");
  return `grade_level.is.null,grade_level.in.(${list})`;
}
