// ป้ายชื่อสาย (subline) ที่โชว์ผู้เล่น — จุดเดียวที่ควรแก้ข้อความพวกนี้
export const SUBLINE_LABEL: Record<string, string> = {
  math: "สายคณิต",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
};

// ป้ายชื่อวิชา — ใช้กับข้อความภารกิจสำรวจ ("ไปสำรวจดินแดน...") ใน MissionCard
export const SUBJECT_LABEL: Record<string, string> = {
  math: "คณิตศาสตร์",
  science: "วิทยาศาสตร์",
};

// ป้ายชื่อบุคลิก (personality A/B) — ห้ามขึ้นต้นด้วยคำว่า "สาย" เด็ดขาด (ชนกับ SUBLINE_LABEL
// ข้างบนที่ใช้ "สาย..." อยู่แล้ว คนละความหมายกัน: subline = คณิต/วิทย์/สมดุล, personality = ดุดัน/สุขุม)
// ⚠️ ใช้เฉพาะตอนโชว์ผลลัพธ์บุคลิกหลังวิวัฒนาการสำเร็จเท่านั้น (PersonalityDecisionModal reveal) —
// ทุกจุดที่เกี่ยวกับคลัง/เควส/ป้อนอาหาร (ก่อนรู้ผลบุคลิก) ต้องใช้ FOOD_LABEL ด้านล่างแทน ห้ามสลับกัน
export const PERSONALITY_LABEL: Record<"A" | "B", string> = {
  A: "ดุดัน",
  B: "สุขุม",
};

// ป้ายชื่อ + รูปอาหาร (food_type A/B) — ใช้ทุกจุดที่เกี่ยวกับคลังอาหาร/ป้อนอาหาร/เลือกอาหารจากเควส
// (ก่อนวิวัฒนาการ ผู้เล่นยังไม่รู้ว่าจะได้บุคลิกอะไร เห็นแค่ชื่ออาหารเฉยๆ ไม่ผูกกับ ดุดัน/สุขุม)
export const FOOD_LABEL: Record<"A" | "B", string> = {
  A: "ผลึกพลัง",
  B: "ผลออโรร่า",
};

export const FOOD_IMAGE_PATH: Record<"A" | "B", string> = {
  A: "/food/food_a_crystal.png",
  B: "/food/food_b_aurora.png",
};
