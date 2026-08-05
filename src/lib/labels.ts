// ป้ายชื่อสาย (subline) ที่โชว์ผู้เล่น — จุดเดียวที่ควรแก้ข้อความพวกนี้
// ⚠️ type คงเป็น Record<string, string> (หลวม) ไว้ก่อน ไม่ใช่ Record<PetLine, string> — เพราะ
// src/app/admin/analytics/page.tsx อินเด็กซ์ด้วย c.subline ที่เป็น string เฉยๆ (มาจาก Map<string, ...>
// สรุปยอด combo ในไฟล์นั้น ไม่ได้ narrow เป็น PetLine) ถ้า tighten type ตรงนี้จะพัง compile ที่ไฟล์นั้น
// ทันที ซึ่งอยู่นอกขอบเขต 3 ไฟล์ของเฟสนี้ — ปล่อยให้ tighten พร้อมกับตอนแก้ import swap เฟส 4/5 แทน
export const SUBLINE_LABEL: Record<string, string> = {
  math: "สายคณิต",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
  physics: "สายฟิสิกส์",
  chemistry: "สายเคมี",
  biology: "สายชีวะ",
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

// ป้ายชื่อย่อ ใช้กับการ์ดสถิติรายวันในปฏิทิน (/pet/calendar) เท่านั้น — คนละชุดกับ SUBLINE_LABEL
// (มีคำว่า "สาย" นำหน้า) และ SUBJECT_LABEL (ชื่อเต็ม "คณิตศาสตร์")
export const CALENDAR_STAT_LABEL_JUNIOR: { key: "math" | "science"; label: string }[] = [
  { key: "math", label: "คณิต" },
  { key: "science", label: "วิทย์" },
];

export const CALENDAR_STAT_LABEL_SENIOR: { key: "physics" | "chemistry" | "biology"; label: string }[] = [
  { key: "physics", label: "ฟิสิกส์" },
  { key: "chemistry", label: "เคมี" },
  { key: "biology", label: "ชีวะ" },
];
