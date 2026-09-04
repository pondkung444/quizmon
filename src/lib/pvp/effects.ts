// ระบบ "ประลอง" (PvP) — สไลซ์ 2: catalog เอฟเฟกต์การ์ดฝั่ง client (โชว์ผลเท่านั้น)
// ความจริงอยู่ใน public.pvp_card_effects + _pvp_resolve_round (SQL)
//
// สี/ไอคอน อ้างอิง mockup: doc/pvp-slice2-handoff §5.1
// null (การ์ดเปล่า) = ไม่มี treatment โดยตั้งใจ ให้การ์ดมีเอฟเฟกต์เด่นด้วยการเทียบ

export type PvpEffectId =
  | "reprisal"
  | "pierce"
  | "heal"
  | "high_stake"
  | "lifesteal"
  | "haste";

export type PvpEffectMeta = {
  id: PvpEffectId;
  nameTh: string;
  color: string; // hex — ใช้เป็น accent ขอบ/ไอคอน/ป้าย
  /** สรุปสั้นสำหรับผู้ตอบเห็นก่อนกดตอบ */
  hintTh: string;
  /** เอฟเฟกต์นี้ทำให้ HP ขยับ "สองฝั่ง" จากการเรโซลูชันเดียว -> โชว์เส้นโยง */
  secondaryHit: boolean;
};

export const PVP_EFFECTS: Record<PvpEffectId, PvpEffectMeta> = {
  reprisal: {
    id: "reprisal",
    nameTh: "สวนกลับ",
    color: "#a78bfa",
    hintTh: "ตอบถูก → ดาเมจสะท้อนกลับใส่ผู้ส่ง",
    secondaryHit: true,
  },
  pierce: {
    id: "pierce",
    nameTh: "เจาะเกราะ",
    color: "#fb923c",
    hintTh: "ตอบถูกก็ยังโดนดาเมจเล็กน้อย",
    secondaryHit: false,
  },
  heal: {
    id: "heal",
    nameTh: "ฮีลเมื่อสำเร็จ",
    color: "#34d399",
    hintTh: "ตอบถูก → ได้เลือดคืน",
    secondaryHit: false,
  },
  high_stake: {
    id: "high_stake",
    nameTh: "เดิมพันสูง",
    color: "#fb5c5c",
    hintTh: "ตอบผิด = ดาเมจ 2 เท่า",
    secondaryHit: false,
  },
  lifesteal: {
    id: "lifesteal",
    nameTh: "ดูดเลือด",
    color: "#dc2626",
    hintTh: "ตอบผิด → ผู้ส่งดูดเลือดคืน",
    secondaryHit: true,
  },
  haste: {
    id: "haste",
    nameTh: "เร่งเวลา",
    color: "#fbbf24",
    hintTh: "เวลาตอบเหลือ 30 วิ",
    secondaryHit: false,
  },
};

export function pvpEffectMeta(id: string | null | undefined): PvpEffectMeta | null {
  if (!id) return null;
  return PVP_EFFECTS[id as PvpEffectId] ?? null;
}
