-- Migration: 004_egg_stat_profiles.sql
-- วัตถุประสงค์: ใส่ "ลายเซ็นสเตตัส" ให้ไข่แต่ละชนิด (growth curve + per-stat cap)
-- อ้างอิง: game-design-document-v2.md หมวด 5.5 + การตัดสินใจเรื่อง counterplay (ชนะทางแพ้ทาง)
--
-- โครงสร้าง stat_profile (jsonb):
--   archetype        -> ป้ายกำกับคร่าวๆ ของ build (ไว้โชว์/debug)
--   growth           -> รูปแบบเส้นโค้งการโต (early_bloomer / late_bloomer)
--   base_offset      -> หัวคิวค่าเริ่มต้น บวกเข้าค่าดิบก่อนคูณ (ไข่โตไวได้แต้มแรกเยอะกว่า)
--   rate_multiplier  -> อัตราโต คูณกับค่าดิบ (สูง = พุ่งไวอิ่มตัวเร็ว, ต่ำ = ไต่ช้าแต่ยาว)
--   caps             -> เพดานรายสเตตัส (per-stat) กันไม่ให้เกิน
--
-- สูตรที่โค้ดจะใช้ (ตอน snapshot ระยะ 4):
--   stat = min( caps[x],  round( ค่าดิบ[x] × rate_multiplier + base_offset ) × ตัวคูณสาย × ตัวคูณบุคลิก )
--   (ตัวคูณสาย/บุคลิก มาจากหมวด 5.3–5.4 ของเอกสาร)
--
-- *** invariant สำคัญ: ผลรวม caps ของไข่ common ทุกใบต้องเท่ากัน (= 500) ***
--   ต่างกันแค่ "รูปทรง" ไม่ใช่ "แรงรวม" -> ไม่มีไข่ common ไหนแรงกว่าเด็ดขาด (หลักข้อ 4)
--   เพดานรวมที่ "สูงกว่า" สงวนไว้ให้ไข่ rare/legendary อนาคต โดยกั้นด้วยเวลาเลี้ยงยาว

-- 1) เพิ่มคอลัมน์
alter table public.egg_types
  add column if not exists stat_profile jsonb;

comment on column public.egg_types.stat_profile is
  'ลายเซ็นสเตตัสของไข่: growth curve (base_offset/rate_multiplier) + per-stat caps. ผลรวม caps ของไข่ common ทุกใบต้องเท่ากัน';

-- 2) ไข่ใบแรก (บังคับ) = สายบุก/เร็ว + early bloomer
--    caps: HP 90 / ATK 115 / DEF 85 / SPD 115 / FOC 95 = รวม 500
update public.egg_types
set stat_profile = '{
  "archetype": "attacker_fast",
  "growth": "early_bloomer",
  "base_offset": 10,
  "rate_multiplier": 1.30,
  "caps": { "hp": 90, "atk": 115, "def": 85, "spd": 115, "foc": 95 }
}'::jsonb
where id = 'egg_common_01';

-- 3) ไข่ใบสอง (ปลดล็อกหลังเก็บสัตว์ตัวแรก) = สายอึด/แม่น + late bloomer
--    caps: HP 115 / ATK 90 / DEF 110 / SPD 90 / FOC 95 = รวม 500 (เท่าใบแรก, รูปทรงตรงข้าม)
insert into public.egg_types (id, name_th, tier, description, is_obtainable, stat_profile)
values (
  'egg_common_02',
  'ไข่เกราะ',
  'common',
  'ไข่สายอึด ปลดล็อกหลังเลี้ยงสัตว์ตัวแรกจนเก็บเข้าสมุด',
  true,
  '{
    "archetype": "tank_precise",
    "growth": "late_bloomer",
    "base_offset": 0,
    "rate_multiplier": 0.85,
    "caps": { "hp": 115, "atk": 90, "def": 110, "spd": 90, "foc": 95 }
  }'::jsonb
)
on conflict (id) do nothing;
