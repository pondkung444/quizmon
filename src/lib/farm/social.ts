export const FARM_STICKERS = [
  { id: "star", icon: "⭐", label: "เก่งมาก" },
  { id: "heart", icon: "💛", label: "เป็นกำลังใจให้" },
  { id: "clap", icon: "👏", label: "ทำได้ดี" },
  { id: "flower", icon: "🌼", label: "ฟาร์มน่ารัก" },
  { id: "water", icon: "💧", label: "ค่อย ๆ เติบโต" },
  { id: "moon", icon: "🌙", label: "พักแล้วค่อยต่อ" },
] as const;
export type FarmSticker = (typeof FARM_STICKERS)[number]["id"];
