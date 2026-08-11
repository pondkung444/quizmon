// ชื่อคงที่จาก naming session (7 ส.ค. 2026) — ช่องอุปกรณ์ไม่มีตาราง lookup ใน DB
// (raid_gear_items.slot เป็น CHECK ตายตัว) ต่างจากคุณภาพอุปกรณ์ที่มี label_th ใน
// raid_gear_qualities แล้ว ยังไม่มี UI เรียกใช้ (equip เป็นสไลซ์ 2) — ประกาศไว้ให้พร้อมก่อน
export const RAID_GEAR_SLOT_LABEL_TH: Record<"head" | "body" | "feet", string> = {
  head: "มงคลเศียร",
  body: "มงคลกาย",
  feet: "มงคลบาท",
};

export const RAID_MOUNTAIN_NAME_TH = "ภูเหนือเมฆ";

// กุญแจเข้าด่านท้าทาย — รางวัลจาก adventure (dungeon_claim) แทนที่อาหารตั้งแต่ 9 ส.ค. 2026
// ไฟล์รูปยังไม่มี เจ้าของโปรเจกต์จะส่งมาวางที่ path นี้เอง (ดู ClaimScreen.tsx สำหรับ fallback)
export const RAID_TICKET_NAME_TH = "กุญแจภูเหนือเมฆ";
export const RAID_TICKET_ICON_PATH = "/tickets/mountain_key.webp";

// ตัดสินใจ 9 ส.ค. 2026 (raid-slice2-ui-handoff §2.6) — label ช่องอุปกรณ์ในจอ equip ใช้ชื่ออวัยวะตรงๆ
// ไม่ใช้ RAID_GEAR_SLOT_LABEL_TH (ชื่อ flavor ชุด) เพราะช่อง UI ไม่ควรผูกกับชื่อชุดปัจจุบันที่อาจเปลี่ยน
export const RAID_GEAR_SLOT_ANATOMY_TH: Record<"head" | "body" | "feet", string> = {
  head: "ส่วนหัว",
  body: "ส่วนตัว",
  feet: "ส่วนเท้า",
};

// ตัดสินใจ 9 ส.ค. 2026 — สีคุณภาพคงที่ (ไม่ไล่เฉด) เทา→ฟ้า→เหลือง→ส้ม ห้ามเปลี่ยนโดยไม่คุยก่อน
// ใช้เป็น background-color ของ mask icon (ดู RaidGearIcon.tsx) คีย์ตรงกับ raid_gear_qualities.code
export const RAID_GEAR_QUALITY_COLOR: Record<string, string> = {
  q1: "#9CA3AF",
  q2: "#60A5FA",
  q3: "#FACC15",
  q4: "#F97316",
};
