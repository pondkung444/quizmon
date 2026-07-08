-- Migration: 009_egg_sprite_prefix.sql
-- วัตถุประสงค์: เพิ่ม sprite_prefix ให้ egg_types ใช้ประกอบชื่อไฟล์รูป (public/pets/<prefix>_stage...png)
-- แยกจาก id ตั้งใจ เพื่อให้ไข่ใหม่ในอนาคตตั้งชื่อไฟล์เองได้อิสระจาก id โดยไม่ต้องแก้โค้ด (หลักข้อ 6)

alter table public.egg_types
  add column if not exists sprite_prefix text;

comment on column public.egg_types.sprite_prefix is
  'ใช้ประกอบ path รูป เช่น public/pets/{sprite_prefix}_stage{N}_....png';

update public.egg_types set sprite_prefix = 'egg1' where id = 'egg_common_01';
update public.egg_types set sprite_prefix = 'egg2' where id = 'egg_common_02';

alter table public.egg_types
  alter column sprite_prefix set not null;
