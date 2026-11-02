insert into public.raid_types
  (slug, name_th, boss_name_th, obstacle_count, boss_threshold_pct,
   boss_question_count, boss_pass_count, color_quota, sort_order, zone_id, is_active,
   background_path, boss_sprite_path)
values
  ('ridge_gale', 'สันลมโหม', 'เสือหิมะจอมผา',
   3, 60, 5, 3, '{"green":2,"yellow":2,"red":2}'::jsonb,
   2, '23b82842-5b61-42c6-8ba1-6b9af6b34061', true,
   '/raid/ridge_gale.webp', '/raid/boss_ridge_gale.png'),
  ('ridge_storm', 'ยอดฟ้าคำราม', 'พญาหมาป่าสายฟ้า',
   4, 75, 5, 3, '{"green":1,"yellow":3,"red":4}'::jsonb,
   3, '23b82842-5b61-42c6-8ba1-6b9af6b34061', true,
   '/raid/ridge_storm.webp', '/raid/boss_ridge_storm.png');