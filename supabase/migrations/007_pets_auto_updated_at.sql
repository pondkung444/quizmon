-- Migration: 007_pets_auto_updated_at.sql
-- วัตถุประสงค์: ให้ pets.updated_at อัปเดตอัตโนมัติทุกครั้งที่มี UPDATE แทนที่จะพึ่งให้โค้ดแอปตั้งค่าเอง
-- ที่มา: ตอนแก้ actions.ts (เฟส A) มีความเข้าใจผิดว่า pets ไม่มีคอลัมน์ updated_at เลยตัดออกจากคำสั่ง update
--        ทั้งที่จริงมีคอลัมน์นี้อยู่ -> ใช้ trigger แก้ที่ต้นทาง กันพลาดซ้ำในโค้ดจุดอื่นๆ ต่อไปด้วย

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pets_set_updated_at on public.pets;

create trigger trg_pets_set_updated_at
  before update on public.pets
  for each row
  execute function public.set_updated_at();
