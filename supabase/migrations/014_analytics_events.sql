-- เพิ่มตาราง analytics_events สำหรับเก็บ event การเล่นของนักเรียน (ให้ผู้พัฒนาดู insight เท่านั้น)
-- insert-only จากฝั่ง client ผ่าน src/app/api/analytics/route.ts (ไม่ใช่ server action — ดูเหตุผล
-- เรื่อง sendBeacon เรียก server action ไม่ได้ + server action ถูก dispatch เรียงคิวเดียวกับ
-- submitAnswer ใน src/app/quiz/actions.ts) ไม่มี select policy ให้ผู้เล่นเอง อ่านได้เฉพาะฝั่ง server
-- ผ่าน service role (เหมือน public.questions)
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  session_id uuid not null,
  event_name text not null,
  screen text,
  pet_id uuid references public.pets (id) on delete set null,
  props jsonb not null default '{}',
  client_ts timestamptz not null,
  created_at timestamptz not null default now()
);

comment on column public.analytics_events.client_ts is
  'timestamp ฝั่ง client ตอน event เกิดขึ้นจริง — ต่างจาก created_at ที่เป็นเวลาที่แถวถูก insert จริง (ช้ากว่าได้ถ้า flush ล่าช้า/beacon ตอนปิดหน้า)';
comment on column public.analytics_events.session_id is
  'สุ่มใหม่ทุกครั้งที่โหลดแอป (module-level ใน src/lib/analytics.ts) ใช้กลุ่ม event ในเซสชันเดียวกัน';

create index if not exists analytics_events_user_ts_idx on public.analytics_events (user_id, client_ts);
create index if not exists analytics_events_name_ts_idx on public.analytics_events (event_name, client_ts);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id);
create index if not exists analytics_events_props_gin_idx on public.analytics_events using gin (props);

alter table public.analytics_events enable row level security;

-- insert เท่านั้น ไม่มี select policy ตั้งใจ (กันผู้เล่นเห็น event ของตัวเอง/คนอื่นผ่าน REST API ตรงๆ)
create policy "analytics_events: insert own" on public.analytics_events
  for insert with check (auth.uid() = user_id);
