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
  "/raid/boss_ridge_mist.png": 2.93,
  "/raid/boss_ridge_gale.png": 16.8,
  "/raid/boss_ridge_storm.png": 3.13,

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
