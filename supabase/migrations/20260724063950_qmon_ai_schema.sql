-- Migration: qmon_ai_schema
-- version: 20260724063950 (ตรงกับ supabase_migrations.schema_migrations ใน production)
--
-- Qmon AI Phase 1: schema สำหรับฟีเจอร์ AI persona ("ขอแรงใจ" เมนูแรก, เมนูอื่นเผื่อไว้)
-- ใช้ Gemini free tier — เก็บ log ทุกครั้งที่เรียกจริง (audit) + cache ต่อวันกันเรียกซ้ำ

-- qmon_messages: log ข้อความ AI (Qmon) ทุกครั้งที่สร้างจริง (audit trail, append-only ห้าม overwrite)
create table if not exists public.qmon_messages (
  id             uuid primary key default gen_random_uuid(),
  pet_id         uuid not null references public.pets(id) on delete cascade,
  menu           text not null check (menu in ('practice','progress','encourage','chat')),
  input_summary  jsonb not null default '{}'::jsonb,
  ai_response    text not null,
  source         text not null check (source in ('gemini','fallback_template')),
  is_flagged     boolean not null default false,
  created_at     timestamptz not null default now()
);

comment on table public.qmon_messages is 'Log ข้อความ AI (Qmon) ทุกครั้งที่สร้างจริง (audit trail) — append-only ห้าม update/delete';
comment on column public.qmon_messages.input_summary is 'เฉพาะตัวเลขสรุปที่ส่งให้ Gemini เท่านั้น ห้ามเก็บ PII ของผู้ใช้';

create index if not exists qmon_messages_pet_menu_created_idx
  on public.qmon_messages (pet_id, menu, created_at desc);

alter table public.qmon_messages enable row level security;

create policy "Users can view own qmon messages"
  on public.qmon_messages for select
  using (exists (
    select 1 from public.pets
    where pets.id = qmon_messages.pet_id and pets.user_id = auth.uid()
  ));

create policy "Users can insert own qmon messages"
  on public.qmon_messages for insert
  with check (exists (
    select 1 from public.pets
    where pets.id = qmon_messages.pet_id and pets.user_id = auth.uid()
  ));

-- ตั้งใจไม่มี update/delete policy: เป็น audit trail ห้ามแก้ไข/ลบทีหลัง


-- qmon_menu_cache: cache คำตอบ AI ต่อ (pet_id, menu, วัน) กันเรียก Gemini ซ้ำในวันเดียวกัน
create table if not exists public.qmon_menu_cache (
  pet_id      uuid not null references public.pets(id) on delete cascade,
  menu        text not null check (menu in ('practice','progress','encourage','chat')),
  cache_date  date not null default current_date,
  ai_response text not null,
  source      text not null check (source in ('gemini','fallback_template')),
  created_at  timestamptz not null default now(),
  primary key (pet_id, menu, cache_date)
);

comment on table public.qmon_menu_cache is 'Cache คำตอบ AI ต่อ (pet_id, menu, วัน) — เขียนผ่าน RPC upsert_qmon_cache เท่านั้น';

alter table public.qmon_menu_cache enable row level security;

create policy "Users can view own qmon cache"
  on public.qmon_menu_cache for select
  using (exists (
    select 1 from public.pets
    where pets.id = qmon_menu_cache.pet_id and pets.user_id = auth.uid()
  ));

-- ไม่มี insert/update policy ตรงๆ ให้ authenticated: เขียนผ่าน RPC upsert_qmon_cache (security definer)
-- เท่านั้น กันเคส client เขียน cache เองมั่วๆ (เช่น ปลอมคำตอบ AI ของตัวเอง)


-- upsert_qmon_cache: pattern เดียวกับ claim_daily_mission_bonus/feed_pet — security definer,
-- เช็ค auth.uid()+ownership เอง ไม่พึ่ง RLS เพียงอย่างเดียว, insert...on conflict do update
-- (ไม่ใช่ exception-based 23505 catch — โค้ดเดิมในโปรเจกต์นี้ไม่มี pattern แบบนั้นเลย)
--
-- p_cache_date รับจากฝั่ง app แทนการใช้ current_date ของ Postgres ตรงๆ — DB session ไม่ได้ตั้ง
-- timezone เป็น Asia/Bangkok เสมอไป (current_date อิงเวลาเซิร์ฟเวอร์/UTC) ในขณะที่ทั้งโปรเจกต์นี้
-- ใช้ getTodayInBangkok() (src/lib/exp.ts) เป็นมาตรฐานตัดวันอยู่แล้ว (ดู mission_date ใน
-- src/lib/missions.ts) ถ้าใช้ current_date ในนี้ตรงๆ ช่วง 00:00-06:59 น. เวลาไทยจะตัดวันไม่ตรงกับ
-- ฝั่ง app ทำให้เช็ค cache (ข้อ 1 ของ flow) พลาดวันได้
create or replace function public.upsert_qmon_cache(
  p_pet_id uuid,
  p_menu text,
  p_cache_date date,
  p_ai_response text,
  p_source text
)
returns public.qmon_menu_cache
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.qmon_menu_cache;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if p_menu not in ('practice','progress','encourage','chat') then
    raise exception 'menu ไม่ถูกต้อง';
  end if;

  if p_source not in ('gemini','fallback_template') then
    raise exception 'source ไม่ถูกต้อง';
  end if;

  if not exists (
    select 1 from public.pets
    where pets.id = p_pet_id and pets.user_id = v_user_id
  ) then
    raise exception 'ไม่พบ Qmon ของผู้ใช้นี้';
  end if;

  insert into public.qmon_menu_cache (pet_id, menu, cache_date, ai_response, source)
  values (p_pet_id, p_menu, p_cache_date, p_ai_response, p_source)
  on conflict (pet_id, menu, cache_date)
  do update set ai_response = excluded.ai_response, source = excluded.source, created_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

grant execute on function public.upsert_qmon_cache(uuid, text, date, text, text) to authenticated;
