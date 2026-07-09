-- เพิ่มฟิลด์เบอร์โทรและโรงเรียนให้โปรไฟล์ผู้ใช้ (กรอกตอนสมัครสมาชิก)
alter table public.profiles
  add column if not exists phone text,
  add column if not exists school text;

-- อัปเดต trigger ให้ดึงค่าจาก raw_user_meta_data มาใส่ตอนสร้างโปรไฟล์ใหม่
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, phone, school)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'school'
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  return new;
end;
$$;
