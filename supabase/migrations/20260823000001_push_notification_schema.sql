-- ============================================================
-- Push Notification schema (Phase 1)
-- 4 ตาราง: push_devices, push_preferences, notification_jobs, notification_deliveries
-- ออกแบบให้ platform-agnostic ตั้งแต่ต้น (android/ios ใช้ schema เดียวกัน)
--
-- หมายเหตุ: migration นี้ apply ผ่าน Supabase MCP ไปแล้วจริงบน production DB
-- (project wmndxiuqzrnqbhrznmfg) ไฟล์นี้แค่เอามาใส่ supabase/migrations/
-- เพื่อกัน drift ระหว่าง repo กับ DB จริง — ห้าม apply ซ้ำถ้า DB มีตารางอยู่แล้ว
-- ============================================================

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null check (platform in ('android','ios')),
  permission_status text,
  enabled boolean not null default true,
  app_version text,
  last_seen_at timestamptz,
  token_refreshed_at timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_push_devices_user_id on public.push_devices(user_id) where enabled = true;

create trigger trg_push_devices_set_updated_at
  before update on public.push_devices
  for each row
  execute function public.set_updated_at();

create table public.push_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  daily_quest_enabled boolean not null default true,
  daily_exp_enabled boolean not null default true,
  adventure_enabled boolean not null default true,
  social_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_push_preferences_set_updated_at
  before update on public.push_preferences
  for each row
  execute function public.set_updated_at();

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  deep_link text,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempt_count smallint not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notification_jobs_user_created on public.notification_jobs(user_id, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references public.notification_jobs(id) on delete cascade,
  push_device_id uuid not null references public.push_devices(id) on delete cascade,
  status text not null check (status in ('success','failed')),
  provider_message_id text,
  error_code text,
  attempted_at timestamptz not null default now()
);

create index idx_notification_deliveries_job on public.notification_deliveries(notification_job_id);

-- ============================================================
-- RLS: push_devices / push_preferences -> user จัดการของตัวเอง
-- notification_jobs / notification_deliveries -> ไม่มี policy เลย (service role only)
-- ============================================================

alter table public.push_devices enable row level security;
alter table public.push_preferences enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "push_devices_select_own" on public.push_devices
  for select using (auth.uid() = user_id);

create policy "push_devices_insert_own" on public.push_devices
  for insert with check (auth.uid() = user_id);

create policy "push_devices_update_own" on public.push_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_devices_delete_own" on public.push_devices
  for delete using (auth.uid() = user_id);

create policy "push_preferences_select_own" on public.push_preferences
  for select using (auth.uid() = user_id);

create policy "push_preferences_insert_own" on public.push_preferences
  for insert with check (auth.uid() = user_id);

create policy "push_preferences_update_own" on public.push_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
