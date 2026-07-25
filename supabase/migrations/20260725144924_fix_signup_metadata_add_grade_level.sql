-- แก้บั๊ก: signup UI ส่ง phone/school มาตลอด แต่ handle_new_user() ทิ้งไป
-- เพิ่ม grade_level (ม.1-ม.6) + grade_band (derived) สำหรับระบบ ม.6

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists grade_level text;

alter table public.profiles
  drop constraint if exists profiles_grade_level_check;

alter table public.profiles
  add constraint profiles_grade_level_check
  check (grade_level is null or grade_level in ('ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'));

alter table public.profiles
  drop column if exists grade_band;

alter table public.profiles
  add column grade_band text
  generated always as (
    case
      when grade_level in ('ม.4','ม.5','ม.6') then 'senior'
      when grade_level in ('ม.1','ม.2','ม.3') then 'junior'
      else null
    end
  ) stored;

-- กู้คืน school ที่เด็กเคยกรอกจริง (trigger เดิมทิ้งไป แต่ auth.users ยังเก็บไว้)
update public.profiles p
set school = nullif(u.raw_user_meta_data->>'school', '')
from auth.users u
where u.id = p.id
  and p.school is null
  and u.raw_user_meta_data ? 'school';

-- กู้คืน phone ที่เด็กเคยกรอกจริง
update public.profiles p
set phone = nullif(u.raw_user_meta_data->>'phone', '')
from auth.users u
where u.id = p.id
  and p.phone is null
  and u.raw_user_meta_data ? 'phone';

-- บัญชีเดิมทั้งหมดตอนนี้คือ ม.3 ตามที่ยืนยัน
update public.profiles
set grade_level = 'ม.3'
where grade_level is null;

-- แก้ trigger ให้รับ phone/school/grade_level จริง (แก้บั๊กเดิมที่ทิ้งข้อมูล)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, username, phone, school, grade_level)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', '')
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  return new;
end;
$$;
