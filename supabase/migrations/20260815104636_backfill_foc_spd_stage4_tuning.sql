-- Backfill FOC/SPD สำหรับ pet stage 4 เดิม (78 ตัว ณ 2026-08-15) ให้ตรงกับสูตรใหม่ใน
-- computeRawStats() (foc: accuracyPct * 0.7, spd: comboMilestones * 2) — อนุมัติทาง (ก) ใน
-- handoff "จูนสูตรสเตตัส FOC/SPD (แบบ B)" §0 เพราะ FOC ตันบน (85% เฉลี่ย, เขียว 70/78) และ SPD
-- ตันล่าง (31% เฉลี่ย, แดง 55/78) ทำให้ด่านท้าทายทั้ง 2 แกนไม่แยกแยะฝีมือผู้เล่นเลย
--
-- ห้ามแตะ HP/ATK/DEF เด็ดขาด (ไม่ได้เปลี่ยนสูตรของ 3 แกนนี้)
--
-- accuracyPct (ค่าดิบ FOC) ไม่ได้เก็บใน DB แยก ไม่มีคอลัมน์เก็บไว้ตอน snapshot จึงถอดกลับจาก
-- stat_foc เดิมแทนการคำนวณ accuracy ใหม่จาก quiz_attempts (ตามที่แนะนำในเอกสาร §3 ข้อ 2 —
-- เพราะเป้าหมายคือย่อสเกลลง 30% ไม่ใช่คำนวณ accuracy ใหม่ ณ วันนี้):
--   raw_accuracy = (stat_foc_old - base_offset) / rate_multiplier / subline_mult_foc   (foc ไม่มี personality bonus)
--   new_stat_foc = round(raw_accuracy * 0.7 * subline_mult_foc * rate_multiplier + base_offset)
--                = round(0.7 * stat_foc_old + 0.3 * base_offset)   -- พีชคณิตยุบแล้ว เทียบเท่ากัน
--
-- combo_milestones (ค่าดิบ SPD) เก็บอยู่ใน pets ตรงๆ คำนวณสดใหม่ทั้ง pipeline ได้เลย ไม่ต้องถอดกลับ
--   new_stat_spd = round(combo_milestones * 2 * spd_mult(subline) * (1 + spd_personality_bonus) * rate_multiplier + base_offset)
--   spd_mult: math/science = 1.0, balanced = 1.1 (SUBLINE_MULTIPLIER)
--   spd_personality_bonus: personality='A' -> 0.05, else 0 (PERSONALITY_BONUS)
--
-- ตรวจแล้วก่อน apply (ดู execute_sql dry-run ใน conversation): FOC เฉลี่ย 85.0%->61.6%,
-- SPD เฉลี่ย 30.6%->58.1%, ผลรวมเฉลี่ย ÷500 55.7%->56.9% (เกณฑ์ §4.1 ต้องคงที่ ~56% ผ่าน)
-- ไม่มีตัวไหนเกิน cap ของไข่ตัวเอง

with e as (
  select id,
    (stat_profile->>'base_offset')::numeric as base_offset,
    (stat_profile->>'rate_multiplier')::numeric as rate_multiplier,
    (stat_profile->'caps'->>'foc')::numeric as cap_foc,
    (stat_profile->'caps'->>'spd')::numeric as cap_spd
  from egg_types
),
calc as (
  select
    pt.id,
    least(
      e.cap_foc,
      round(0.7 * pt.stat_foc + 0.3 * e.base_offset)
    )::int as new_foc,
    least(
      e.cap_spd,
      round(
        (pt.combo_milestones * 2)
        * (case pt.subline when 'math' then 1.0 when 'science' then 1.0 when 'balanced' then 1.1 end)
        * (1 + case when pt.personality = 'A' then 0.05 else 0 end)
        * e.rate_multiplier
        + e.base_offset
      )
    )::int as new_spd
  from pets pt
  join e on e.id = pt.egg_type_id
  where pt.stage = 4 and pt.stat_foc is not null
)
update pets
set stat_foc = calc.new_foc,
    stat_spd = calc.new_spd
from calc
where pets.id = calc.id;
