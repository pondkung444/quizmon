// ชื่อคงที่จาก naming session (7 ส.ค. 2026) — ช่องอุปกรณ์ไม่มีตาราง lookup ใน DB
// (raid_gear_items.slot เป็น CHECK ตายตัว) ต่างจากคุณภาพอุปกรณ์ที่มี label_th ใน
// raid_gear_qualities แล้ว ยังไม่มี UI เรียกใช้ (equip เป็นสไลซ์ 2) — ประกาศไว้ให้พร้อมก่อน
export const RAID_GEAR_SLOT_LABEL_TH: Record<"head" | "body" | "feet", string> = {
  head: "มงคลเศียร",
  body: "มงคลกาย",
  feet: "มงคลบาท",
};

export const RAID_MOUNTAIN_NAME_TH = "ภูเหนือเมฆ";

// ตั๋วเข้าด่านท้าทาย — รางวัลจาก adventure (dungeon_claim) แทนที่อาหารตั้งแต่ 9 ส.ค. 2026
// ไฟล์รูปยังไม่มี เจ้าของโปรเจกต์จะส่งมาวางที่ path นี้เอง (ดู ClaimScreen.tsx สำหรับ fallback)
export const RAID_TICKET_NAME_TH = "กุญแจภูเหนือเมฆ";
export const RAID_TICKET_ICON_PATH = "/tickets/mountain_key.webp";
