create table public.self_serve_enrollment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'iap_google', 'iap_apple')),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index self_serve_enrollment_student_id_idx
  on public.self_serve_enrollment (student_id);

-- กัน enroll ซ้ำซ้อน: นักเรียน 1 คนมี active enrollment ได้แถวเดียว ณ เวลาหนึ่ง
-- (จะ extend ให้ update แถวเดิม ไม่ insert แถวใหม่ทับ)
create unique index self_serve_enrollment_one_active_per_student
  on public.self_serve_enrollment (student_id)
  where status = 'active';

alter table public.self_serve_enrollment enable row level security;

-- นักเรียนอ่านสถานะ enrollment ของตัวเองตรงๆ ได้ (ให้การ์ดหน้าแรกเช็คได้เร็วโดยไม่ต้องผ่าน RPC)
-- ตาม pattern เดียวกับ guardian_links_select_own / guardian_plan_select_linked เดิม
create policy self_serve_enrollment_select_own
  on public.self_serve_enrollment
  for select
  using (auth.uid() = student_id);

-- ไม่มี insert/update/delete policy ให้ authenticated เลย — ปอนด์ enroll ผ่าน service role
-- (SQL ตรงๆ) เท่านั้นในรอบ pilot นี้ ตรงกับ "manual gate" ตาม spec ข้อ 4
