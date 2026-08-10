alter table public.raid_types
  add column boss_scene_path text;

comment on column public.raid_types.boss_scene_path is 'Vertical 1080x1920 boss-fight scene background. Nullable; UI falls back to background_path (cover) until real art is supplied.';
