// ธีมโทนสีหน้าน้อง Qmon (/pet) — ผู้เล่นเลือกเองได้ที่ /settings เก็บใน cookie (ไม่ใช่ localStorage)
// เพราะหน้า /pet render ฝั่ง server อ่าน cookie ได้ทันที ได้ธีมถูกตั้งแต่ HTML แรก ไม่มีจังหวะวาบธีมเดิม
// ก่อนสลับ — ข้อแลกคือจำแยกต่อเครื่อง (ยังไม่ sync ข้ามเครื่องผ่าน profiles) ค่าสีจริงอยู่ใน globals.css
// ที่ [data-pet-theme]
export const PET_THEMES = ["dusk", "day"] as const;
export type PetTheme = (typeof PET_THEMES)[number];

export const DEFAULT_PET_THEME: PetTheme = "dusk";
export const PET_THEME_COOKIE = "qm_pet_theme";

export const PET_THEME_LABEL_TH: Record<PetTheme, string> = {
  dusk: "ท้องฟ้ายามค่ำ",
  day: "เช้าสดใส",
};

export function parsePetTheme(value: string | undefined | null): PetTheme {
  return PET_THEMES.includes(value as PetTheme) ? (value as PetTheme) : DEFAULT_PET_THEME;
}
