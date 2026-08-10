// สไปรต์บอส/Qmon แต่ละไฟล์มีช่องว่างโปร่งใสใต้ตัวไม่เท่ากัน (ไม่ได้ crop ชิดขอบล่างมาให้ตรงกัน) ทำให้
// anchor แบบ translate(-50%, -100%) ตรงๆ เห็นบางตัว "ลอย" สูงกว่าตัวอื่น (feedback pass 2026-08-08
// รอบ 3) แก้ที่ CSS แทนการแก้ไฟล์รูป — ไม่แตะไฟล์ /public/pets/*.png เอง (ใช้ร่วมกันหลายหน้าทั้งเกม)
// ค่าด้านล่างวัดจริงจากช่องอัลฟาของไฟล์ปัจจุบันด้วยสคริปต์ (สแกนแถวล่างสุดที่ยังมี pixel ทึบ) หน่วยเป็น
// % ของความสูงภาพ ใช้ปรับ transform ให้ anchor ไปที่ "ขอบล่างของภาพที่มองเห็นจริง" แทนขอบล่างของ canvas
// ไฟล์ไหนไม่มีในตารางนี้ = ไม่รู้ค่า ถือว่า 0 (พฤติกรรมเดิม ไม่ชดเชยอะไร)
//
// ถ้าไฟล์บอสถูกเปลี่ยนเป็นเวอร์ชัน crop ชิดขอบแล้วในอนาคต ให้ลบ entry ของไฟล์นั้นออก (หรือตั้งเป็น 0)
// ไม่ต้องคงตัวเลขเก่าไว้ กันการชดเชยซ้อนทับผิดพลาด
export const SPRITE_GROUND_OFFSET_PCT: Record<string, number> = {
  "/raid/boss_ridge_mist.png": 2.41,
  "/raid/boss_ridge_gale.png": 0.56,
  "/raid/boss_ridge_storm.png": 0,

  "/pets/egg1_stage4_balance_A.png": 2.4,
  "/pets/egg1_stage4_balance_B.png": 5.0,
  "/pets/egg1_stage4_math_A.png": 0,
  "/pets/egg1_stage4_math_B.png": 1.2,
  "/pets/egg1_stage4_science_A.png": 1.0,
  "/pets/egg1_stage4_science_B.png": 1.2,
  "/pets/egg2_stage4_balance_A.png": 0,
  "/pets/egg2_stage4_balance_B.png": 0,
  "/pets/egg2_stage4_math_A.png": 5.2,
  "/pets/egg2_stage4_math_B.png": 4.8,
  "/pets/egg2_stage4_science_A.png": 0,
  "/pets/egg2_stage4_science_B.png": 4.0,
  "/pets/egg3_stage4_balance_A.png": 5.2,
  "/pets/egg3_stage4_balance_B.png": 4.8,
  "/pets/egg3_stage4_math_A.png": 17.0,
  "/pets/egg3_stage4_math_B.png": 2.4,
  "/pets/egg3_stage4_science_A.png": 7.4,
  "/pets/egg3_stage4_science_B.png": 4.8,
  "/pets/egg4_stage4_balance_A.png": 10.0,
  "/pets/egg4_stage4_balance_B.png": 8.8,
  "/pets/egg4_stage4_math_A.png": 7.6,
  "/pets/egg4_stage4_math_B.png": 5.4,
  "/pets/egg4_stage4_science_A.png": 12.8,
  "/pets/egg4_stage4_science_B.png": 10.8,
};

export function getSpriteGroundOffsetPercent(imagePath: string): number {
  return SPRITE_GROUND_OFFSET_PCT[imagePath] ?? 0;
}

// สไปรต์ Qmon ทุกไฟล์เป็นสี่เหลี่ยมจัตุรัส (1:1) มาตลอด ทำให้ next/image ใช้ width={220} height={220}
// (ค่าคงที่มั่ว ไม่ใช่ขนาดจริง — แค่ให้ครบ prop ที่ next/image บังคับตอนไม่ใช้ fill) แล้ว
// aspect-ratio ที่ browser คำนวณจาก attribute นั้นบังเอิญตรงกับภาพจริงพอดี ไม่มีใครสังเกตเห็นบั๊กนี้มาก่อน
// พอเปลี่ยนสไปรต์บอสเป็นภาพแนวตั้งจริง (boss_ridge_mist/storm.png 1024×1536, boss_ridge_gale.png
// 1254×1254 สี่เหลี่ยม) width/height 220×220 (1:1) ที่ผิดสัดส่วนทำให้ browser คำนวณ auto-width ของ
// wrapper (h-full w-auto object-contain) พังไปเลย บอสเหลือกว้างแค่ ~75px จากที่ควรได้ ~470px ทั้งที่
// สูง 700px (feedback pass 2026-08-10: "บอสต้องใหญ่กว่า Qmon" — ตอนนั้นบอสเล็กกว่าเพราะบั๊กนี้ ไม่ใช่
// เพราะ heightPercent ตั้งค่าผิด) แก้โดยส่ง width/height ที่ตรงสัดส่วนจริงแทนค่าคงที่ 220×220 เดิม —
// ไฟล์ไหนไม่มีในตารางนี้ (สไปรต์ Qmon ทุกไฟล์) fallback เป็น 1:1 เหมือนพฤติกรรมเดิมทุกประการ
export const SPRITE_ASPECT_RATIO: Record<string, number> = {
  "/raid/boss_ridge_mist.png": 1024 / 1536,
  "/raid/boss_ridge_gale.png": 1254 / 1254,
  "/raid/boss_ridge_storm.png": 1024 / 1536,
};

export function getSpriteAspectRatio(imagePath: string): number {
  return SPRITE_ASPECT_RATIO[imagePath] ?? 1;
}
