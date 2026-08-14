import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";

// ใช้ร่วมกันระหว่าง MyProfileTab (โชว์ Qmon ที่ภูมิใจ) กับทั้ง 3 sheet (B02/B03/B04 เลือก Qmon) —
// pure ล้วน import ได้ทั้งฝั่ง server component (ตอน fetch) และ client component (ตอน render list)
export type PetSummary = {
  id: string;
  nickname: string | null;
  stage: number;
  subline: string | null;
  personality: string | null;
  isActive: boolean;
  statHp: number | null;
  statAtk: number | null;
  statDef: number | null;
  statSpd: number | null;
  statFoc: number | null;
  evolvedAt: string | null;
  growthQuestionsAnswered: number | null;
  growthQuestionsCorrect: number | null;
  growthSubjectBreakdown: Record<string, { answered: number; correct: number }> | null;
  eggSpritePrefix: string;
  eggNameTh: string;
};

// รับแค่ field ที่จำเป็นจริงๆ (ไม่ใช่ PetSummary เต็ม) เผื่อใช้กับข้อมูล Qmon ที่ภูมิใจของคนอื่น
// (เช่น ผลค้นหา Friend Code เฟส 3) ที่ RPC คืนมาแค่บางฟิลด์ ไม่ครบเท่า PetSummary ของตัวเอง
export type PetDisplayInput = Pick<
  PetSummary,
  "eggSpritePrefix" | "stage" | "subline" | "personality" | "eggNameTh"
>;

// รูปแบบ "Qmon ที่ภูมิใจของคนอื่น" ที่ RPC ฝั่งเพื่อน (search_friend_code/list_my_friend_requests,
// เฟส 3) คืนมา — null ได้ถ้าบัญชีนั้นไม่มี pet เลย (edge case แทบไม่เกิดเพราะสมัครใหม่ได้ไข่เริ่มต้นเสมอ)
export type PetPreview = (PetDisplayInput & { nickname: string | null }) | null;

export function resolvePetDisplay(pet: PetDisplayInput): { imagePath: string | null; speciesName: string } {
  try {
    return {
      imagePath: getPetImagePath(
        pet.eggSpritePrefix,
        pet.stage,
        (pet.subline ?? null) as Subline | null,
        (pet.personality ?? null) as Personality | null
      ),
      speciesName: getSpeciesName(
        pet.eggSpritePrefix,
        pet.stage,
        (pet.subline ?? null) as Subline | null,
        (pet.personality ?? null) as Personality | null,
        pet.eggNameTh
      ),
    };
  } catch {
    // ข้อมูลยังไม่ครบพอคำนวณ (เช่น stage 3 แต่ subline ยัง sync ไม่ทัน) — กันหน้าโปรไฟล์พังทั้งหน้า
    return { imagePath: null, speciesName: pet.eggNameTh };
  }
}
