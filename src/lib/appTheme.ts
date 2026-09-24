// ธีมโทนสีของหน้าหลักตามแถบเมนูล่าง (บ้าน /pet, สังคม /social, ฟาร์ม /collection, ประลอง /pvp) —
// ผู้เล่นเลือกเองได้ที่ /settings เก็บใน cookie (ไม่ใช่ localStorage) เพราะหน้าเหล่านี้ render ฝั่ง server
// อ่าน cookie ได้ทันที ได้ธีมถูกตั้งแต่ HTML แรก ไม่มีจังหวะวาบธีมเดิมก่อนสลับ — ข้อแลกคือจำแยกต่อเครื่อง
// (ยังไม่ sync ข้ามเครื่องผ่าน profiles) ค่าสีจริงอยู่ใน globals.css ที่ [data-app-theme] และหน้าไหนจะใช้ธีม
// ให้วาง <AppThemeMarker /> (ดู components/AppThemeMarker.tsx)
export const APP_THEMES = ["dusk", "day"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_APP_THEME: AppTheme = "dusk";
export const APP_THEME_COOKIE = "qm_app_theme";

export const APP_THEME_LABEL_TH: Record<AppTheme, string> = {
  dusk: "ท้องฟ้ายามค่ำ",
  day: "เช้าสดใส",
};

export function parseAppTheme(value: string | undefined | null): AppTheme {
  return APP_THEMES.includes(value as AppTheme) ? (value as AppTheme) : DEFAULT_APP_THEME;
}
