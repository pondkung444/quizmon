// ไฟล์นี้ต้องเป็นฟังก์ชันล้วน ห้าม import อะไรที่เป็น server-only (เช่น admin client) — client component
// (GradeLevelSetting) import ค่าคงที่จากที่นี่ตรงๆ; ตัวอ่านโปรไฟล์จาก DB อยู่ใน gradeBand.ts (getGradeProfile)
import type { GradeBand } from "@/lib/gradeBand";

// ระดับชั้นที่ profiles.grade_level รับได้ — ต้องตรงกับ CHECK constraint profiles_grade_level_check
// (supabase/migrations/20260725144924_fix_signup_metadata_add_grade_level.sql)
export const ALL_GRADE_LEVELS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;
export type GradeLevel = (typeof ALL_GRADE_LEVELS)[number];

// ลำดับชั้น junior จากต่ำไปสูง — ใช้คำนวณ "ชั้นที่เห็นได้" (ชั้นตัวเองและชั้นก่อนหน้า)
const JUNIOR_GRADE_LEVELS: readonly string[] = ["ม.1", "ม.2", "ม.3"];

export function isGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === "string" && (ALL_GRADE_LEVELS as readonly string[]).includes(value);
}

// สอดคล้องกับคอลัมน์ generated profiles.grade_band (ม.1-3 = junior, ม.4-6 = senior)
export function gradeBandOf(level: GradeLevel): GradeBand {
  return level === "ม.4" || level === "ม.5" || level === "ม.6" ? "senior" : "junior";
}

// ชั้นของโจทย์ที่ผู้เล่น junior ควรเจอในการสุ่มปกติ: ม.1 -> [ม.1], ม.2 -> [ม.1, ม.2], ม.3 -> [ม.1, ม.2, ม.3]
// คืน null = ไม่กรองตามชั้น (ผู้เล่น senior หรือไม่มี grade_level) — senior ยังไม่ได้ tag grade_level ให้โจทย์
// ครบ จึงไม่ใช้กฎนี้กับ senior
// โจทย์ที่ grade_level เป็น null (สถิติเบื้องต้น, อะตอมและตารางธาตุ) ถูกรวมเสมอผ่าน gradeLevelOrFilter()
export function visibleJuniorGradeLevels(gradeLevel: string | null | undefined): string[] | null {
  if (!gradeLevel) return null;
  const idx = JUNIOR_GRADE_LEVELS.indexOf(gradeLevel);
  if (idx === -1) return null;
  return JUNIOR_GRADE_LEVELS.slice(0, idx + 1);
}

// สตริงสำหรับ supabase query.or(...) — ใส่ "..." ครอบค่าเพราะ "ม.1" มีจุด ซึ่งเป็นตัวอักษรที่ PostgREST
// ใช้แยก operator ใน or()/in() ถ้าไม่ครอบจะ parse ผิด
export function gradeLevelOrFilter(levels: string[]): string {
  const list = levels.map((l) => `"${l}"`).join(",");
  return `grade_level.is.null,grade_level.in.(${list})`;
}
