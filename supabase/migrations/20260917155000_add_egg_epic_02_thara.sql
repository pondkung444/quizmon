-- Migration: add_egg_epic_02_thara
-- สร้างไข่ egg_epic_02 (ไข่ศักดิ์ธรา, tier=epic, is_obtainable=false) — species-only setup
-- ตาม epic_02_asset_manifest (17 ก.ย. 69) — is_obtainable/แหล่งรางวัลแยกไปตัดสินใจทีหลัง
-- เหมือน pattern เดียวกับ egg_epic_01 (napha)

insert into egg_types (
  id, name_th, tier, description, sprite_prefix,
  is_obtainable, stat_profile
) values (
  'egg_epic_02', 'ไข่ศักดิ์ธรา', 'epic',
  'ได้จากระบบผู้พิทักษ์',
  'egg6',
  false,
  jsonb_build_object(
    'caps', jsonb_build_object('hp', 130, 'atk', 70, 'def', 130, 'foc', 90, 'spd', 80),
    'growth', 'late_bloomer',
    'archetype', 'tank_stalwart',
    'base_offset', 15,
    'rate_multiplier', 1.0
  )
);
