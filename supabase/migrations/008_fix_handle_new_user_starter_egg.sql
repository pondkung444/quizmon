-- Migration: 008_fix_handle_new_user_starter_egg.sql
-- วัตถุประสงค์: แก้บั๊กร้ายแรง — handle_new_user() ยัง insert player_progress ที่ถูก DROP ไปแล้ว
--             (migration 003) ทำให้การสมัครสมาชิกใหม่ error ทุกครั้งตั้งแต่นั้นมา
--             ในตัวเดียวกัน เปลี่ยนเป็น insert ไข่ starter เข้าคลัง player_eggs แทน
--             (ตามการตัดสินใจ: ไข่ starter เข้าคลังก่อน ไม่ฟักอัตโนมัติ ผู้เล่นกดฟักเอง)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  return new;
end;
$function$;

-- หมายเหตุ: ไม่ต้องสร้าง trigger ใหม่ (CREATE TRIGGER ... on auth.users) เพราะ trigger เดิม
-- ที่ผูกกับฟังก์ชันชื่อนี้มีอยู่แล้ว — CREATE OR REPLACE FUNCTION แค่เปลี่ยน body ข้างใน
-- ถ้าไม่แน่ใจว่ามี trigger ผูกอยู่จริง เช็คด้วย:
--   select tgname, tgrelid::regclass from pg_trigger where tgfoid = 'public.handle_new_user'::regproc;
