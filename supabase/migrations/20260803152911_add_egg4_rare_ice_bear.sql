-- Migration: 20260803152911_add_egg4_rare_ice_bear
-- ไฟล์นี้ backfill เข้า repo โดยดึง statement คำต่อคำจาก supabase_migrations.schema_migrations
-- ผ่าน Supabase MCP (execute_sql) ไม่ใช่เขียนใหม่ — เพื่อให้ repo ตรงกับสิ่งที่ apply จริงใน
-- production 100% (ตาม pattern เดียวกับ supabase/migrations/20260718225509_add_food_system.sql)
--
-- สร้างไข่ egg_rare_01 (ไข่ฤทธิ์ธาร, tier=rare, is_obtainable=false) — ยังเปิดให้ผู้เล่นได้ไม่ได้
-- จนกว่าจะมีทาง (ระบบผจญภัย/dungeon ที่ insert player_eggs ตรงๆ ไม่ผ่าน is_obtainable check)
-- ดู supabase/migrations/20260804120400_claim_dungeon_run_rpc.sql (Phase 3)

insert into egg_types (id, name_th, tier, sprite_prefix, is_obtainable, description, stat_profile)
values (
  'egg_rare_01', 'ไข่ฤทธิ์ธาร', 'rare', 'egg4', false,
  'ไข่หายาก ได้จากการส่ง Qmon ร่างสุดท้ายไปผจญภัยเท่านั้น',
  '{"caps":{"hp":110,"atk":95,"def":120,"foc":100,"spd":75},
    "growth":"steady_bloomer","archetype":"tank_precise",
    "base_offset":5,"rate_multiplier":1}'::jsonb
);
