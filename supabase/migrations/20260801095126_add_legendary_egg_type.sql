insert into public.egg_types (id, name_th, tier, description, is_obtainable, sprite_prefix, stat_profile)
values (
  'egg_legendary_01',
  'ไข่เทพทิพย์',
  'legendary',
  'ไข่ในตำนาน ได้จากการครองอันดับ 1 กระดานผู้นำประจำสัปดาห์เท่านั้น',
  false,
  'egg3',
  jsonb_build_object(
    'base_offset', 5,
    'rate_multiplier', 1.0,
    'growth', 'steady_bloomer',
    'archetype', 'balanced_all',
    'caps', jsonb_build_object('hp',100,'atk',100,'def',100,'spd',100,'foc',100)
  )
);
