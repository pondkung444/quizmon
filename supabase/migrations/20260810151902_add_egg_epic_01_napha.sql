-- Migration: 20260810151902_add_egg_epic_01_napha
-- ไฟล์นี้ backfill เข้า repo โดยดึง statement คำต่อคำจาก supabase_migrations.schema_migrations
-- ผ่าน Supabase MCP (execute_sql) ไม่ใช่เขียนใหม่ — เพื่อให้ repo ตรงกับสิ่งที่ apply จริงใน
-- production 100% (ตาม pattern เดียวกับ supabase/migrations/20260803152911_add_egg4_rare_ice_bear.sql)
--
-- สร้างไข่ egg_epic_01 (ไข่ศักดิ์นภา, tier=epic, is_obtainable=false) — species-only setup
-- ตาม egg5-napha-species-handoff (10 ส.ค. 69) ยังไม่มีทางรับได้จริง จนกว่าสไลซ์ 4 ของระบบ
-- ท้าทาย (ridge_storm) จะผูกเป็นรางวัลจริงในงานคนละก้อน

insert into egg_types (
  id, name_th, tier, description, sprite_prefix,
  is_obtainable, stat_profile
) values (
  'egg_epic_01', 'ไข่ศักดิ์นภา', 'epic',
  'ไข่ระดับสูงสุด ได้จากการพิชิตด่านยากที่สุดของระบบท้าทายเท่านั้น',
  'egg5',
  false,
  jsonb_build_object(
    'caps', jsonb_build_object('hp', 80, 'atk', 100, 'def', 80, 'foc', 120, 'spd', 120),
    'growth', 'early_bloomer',
    'archetype', 'striker_precise',
    'base_offset', 5,
    'rate_multiplier', 1.1
  )
);
