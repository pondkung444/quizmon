-- Migration: 013_egg_choice_after_collect.sql
-- วัตถุประสงค์: เอกสารอย่างเดียว (ไม่มีการเปลี่ยน schema/constraint) — sync comment
-- ของ player_eggs.source กับพฤติกรรมใหม่: เลิก auto-grant "first_pet_reward"
-- ครั้งเดียวตอนเก็บสัตว์ตัวแรก เปลี่ยนเป็นให้ผู้เล่นเลือกไข่เองทุกครั้งที่เก็บสัตว์
-- เข้าสมุด (แถวใหม่ source = 'collection_choice', เลือกชนิดเดิมซ้ำได้ — ไม่มี
-- unique constraint บน (user_id, egg_type_id) กันไว้อยู่แล้ว)

comment on column public.player_eggs.source is
  'ที่มาของไข่ — ค่าที่ใช้ตอนนี้: starter (ไข่ใบแรกตอนสมัคร), collection_choice (ผู้เล่นเลือกเองทุกครั้งหลังเก็บสัตว์เข้าสมุด). ค่าเก่าที่เลิกใช้แล้วแต่ยังพบในข้อมูลเดิม: first_pet_reward. สงวนไว้อนาคต: idle, dungeon, leaderboard, event. ใช้ text ตั้งใจ (เพิ่ม source ใหม่ไม่ต้อง ALTER)';
