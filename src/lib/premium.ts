import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DAILY_EXP_CAP } from "@/lib/exp";
import { PREMIUM_DAILY_EXP_CAP } from "@/lib/dailyExpCap";
import { STAGE_EXP_THRESHOLD, type Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import type { PetLine } from "@/lib/petLine";

// ราคา/ระยะเวลาพรีเมียม — จุดเดียวในแอป (เฟส 4 ค่อยผูกกับ Stripe price จริง)
export const PREMIUM_PRICE_BAHT = 199;
export const PREMIUM_DAYS = 90;
// การ์ดหน้า /pet เปลี่ยนเป็นสถานะ "ใกล้หมดอายุ" (แถบต่ออายุสีส้ม) เมื่อเหลือไม่เกินกี่วัน
export const PREMIUM_RENEW_WARN_DAYS = 7;

export const FREE_DAILY_EXP_CAP = DAILY_EXP_CAP;
export { PREMIUM_DAILY_EXP_CAP };

// ค่าประมาณ "โตเต็มวัยเร็วสุดกี่วัน" — EXP สะสมที่ต้องถึงเพื่อเข้าร่างสมบูรณ์ (threshold stage 3→4,
// pets.exp สะสมข้าม stage ไม่รีเซ็ต) หารด้วยเพดาน EXP รายวัน = กรณีเก็บเต็มเพดานทุกวัน
// ไม่นับ EXP จาก Focus Mode/โบนัสภารกิจ ซึ่งมีโควตาแยก — เป็นตัวเลขโฆษณา "เร็วสุด" ไม่ใช่คำสัญญา
const FULL_GROWTH_EXP = STAGE_EXP_THRESHOLD[3];
export function daysToFullGrowth(dailyCap: number): number {
  return Math.ceil(FULL_GROWTH_EXP / dailyCap);
}

// จำนวนวันที่เหลือ (ปัดขึ้น) — เหลือ 3 ชั่วโมงก็นับเป็น "อีก 1 วัน" ไม่โชว์ "อีก 0 วัน"
export function premiumDaysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000));
}

const FALLBACK_HERO_IMAGE = "/pets/egg1_stage4_math_A.png";

// รูป Qmon ร่างสมบูรณ์บนหน้า /premium + การ์ด CTA — ถ้า Qmon ที่เลี้ยงอยู่มีสายวิวัฒนาการ (subline)
// แล้ว โชว์ร่างสมบูรณ์ของสายนั้น ("Qmon ของเธอจะโตเป็นแบบนี้") ยังไม่ถึง stage 3 (ไม่มี subline) /
// ยังไม่มี pet → ใช้รูป static เดิมตาม mockup ส่วน personality ยังไม่ล็อกจนกว่าจะถึง stage 4 → ใช้ A
export async function getPremiumHeroImage(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pets")
    .select("subline, personality, egg_types(sprite_prefix)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const eggType = Array.isArray(data?.egg_types) ? data?.egg_types[0] : data?.egg_types;
  const prefix = (eggType as { sprite_prefix: string } | null | undefined)?.sprite_prefix;
  if (!data?.subline || !prefix) return FALLBACK_HERO_IMAGE;

  try {
    return getPetImagePath(
      prefix,
      4,
      data.subline as PetLine,
      ((data.personality as Personality | null) ?? "A") as Personality
    );
  } catch {
    return FALLBACK_HERO_IMAGE;
  }
}
