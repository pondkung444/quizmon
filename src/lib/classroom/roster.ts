import type { Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName, parsePetLine } from "@/lib/petLine";

// แถวจาก RPC get_classroom_roster (supabase/migrations/20260925090000_classroom_ux_v2.sql)
// display_name/student_number ของคนอื่นเป็น null เสมอเมื่อคนเรียกเป็นนักเรียน (mask ใน RPC)
export type ClassroomRosterRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  student_number: number | null;
  joined_at: string;
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  pet_sprite_prefix: string | null;
  pet_egg_name_th: string | null;
};

export type RosterPet = { imagePath: string; speciesName: string; nickname: string | null };

function isPersonality(v: string | null): v is Personality {
  return v === "A" || v === "B";
}

// คืน null แทน throw — แถวยังต้องแสดงได้แม้ข้อมูล pet ไม่ครบ (ไม่มี pet active, stage 3 ไม่มี subline ฯลฯ)
export function resolveRosterPet(row: ClassroomRosterRow): RosterPet | null {
  const prefix = row.pet_sprite_prefix;
  const stage = row.pet_stage;
  if (!prefix || !stage) return null;
  const line = parsePetLine(row.pet_subline);
  const personality = isPersonality(row.pet_personality) ? row.pet_personality : null;
  try {
    return {
      imagePath: getPetImagePath(prefix, stage, line, personality),
      speciesName: getSpeciesName(prefix, stage, line, personality, row.pet_egg_name_th ?? ""),
      nickname: row.pet_nickname,
    };
  } catch {
    return null;
  }
}

// ชื่อหลักที่ครูเห็น: ชื่อจริงที่นักเรียนกรอกในห้อง > username
export function rosterDisplayName(row: Pick<ClassroomRosterRow, "display_name" | "username">): string {
  return row.display_name || row.username || "นักเรียน";
}

export const STAGE_LABEL: Record<number, string> = {
  1: "ยังเป็นไข่",
  2: "ร่างเด็ก",
  3: "ร่างโต",
  4: "ร่างสมบูรณ์",
};

// เลขที่ก่อน แล้วชื่อ — ครูไทยเรียงตามเลขที่เสมอ; คนที่ยังไม่กรอกเลขที่ไปท้าย เรียงตามเวลาเข้า
export function sortByStudentNumber(rows: ClassroomRosterRow[]): ClassroomRosterRow[] {
  return [...rows].sort((a, b) => {
    const an = a.student_number ?? Number.POSITIVE_INFINITY;
    const bn = b.student_number ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return a.joined_at.localeCompare(b.joined_at);
  });
}

// รหัสห้องตัวเลข 6 หลัก แสดงเป็น "482 915" ให้อ่านออกเสียง/จดบนกระดานง่าย
// ห้องเก่าที่เป็นตัวอักษร (ก่อน migration) แสดงตามเดิม
export function formatJoinCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

const JOIN_ERRORS: Array<[code: string, message: string]> = [
  ["classroom_not_found", "ไม่พบห้องนี้ ลองเช็ครหัสกับครูอีกครั้ง"],
  ["classroom_kicked", "ครูนำคุณออกจากห้องนี้แล้ว"],
  ["invalid_display_name", "กรอกชื่อ 1–40 ตัวอักษร"],
  ["invalid_student_number", "เลขที่ต้องอยู่ระหว่าง 1–99"],
  ["no_participants", "ยังไม่มีนักเรียนในห้อง"],
];

export function classroomErrorMessage(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    for (const [code, message] of JOIN_ERRORS) {
      if (raw.includes(code)) return message;
    }
  }
  return fallback;
}
