-- Migration: 010_rename_eggs.sql
-- วัตถุประสงค์: เปลี่ยนชื่อไข่ common ทั้งสองใบให้เข้าธีม "เอพิค/นักล่ามอนสเตอร์"
-- อ้างอิง: ตกลงในแชทออกแบบ — เปลี่ยนแค่ name_th (data) ไม่กระทบ id/sprite_prefix/stat_profile

update public.egg_types set name_th = 'ไข่แก่นเพลิง' where id = 'egg_common_01';
update public.egg_types set name_th = 'ไข่แก่นพฤกษ์' where id = 'egg_common_02';
