-- แบบสำรวจความคิดเห็น tester (feedback popup) — append-only, insert/select เฉพาะแถวของตัวเอง
-- (pattern เดียวกับ qmon_messages: RLS คุมสิทธิ์ ไม่มี update/delete policy ให้ใครแก้ย้อนหลังได้เลย
-- แม้แต่เจ้าของแถวเอง) user_id เก็บไว้เพื่อ safety follow-up เท่านั้น ห้ามโชว์ตัวตนในหน้า
-- aggregate/admin ในอนาคต (masking ทำที่ชั้น UI/query ตอนนั้น)
create table public.player_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  mood text not null check (mood in ('great','good','neutral','bad')),
  friction text[] not null default '{}'
    check (friction <@ array['no_start_button','pet_growth_unclear','exp_unclear','none']),
  content_difficulty text not null check (content_difficulty in ('good','hard','too_hard')),
  -- เฉพาะตอน content_difficulty = 'too_hard' — id คำถามที่ผู้เล่นแตะเลือกจาก 3 ข้อล่าสุดที่ตอบผิด
  -- ไม่มี FK ตั้งใจ (คำถามลบ/ปิด active ภายหลังไม่ควรทำให้แถว feedback เก่าอ่านไม่ได้)
  flagged_question_ids bigint[] not null default '{}',
  graphics_rating text not null check (graphics_rating in ('love','good','neutral','dislike')),
  graphics_issues text[] not null default '{}'
    check (graphics_issues <@ array['sprites_similar','theme_dull','text_hard_read','effects_plain','none']),
  wants text[] not null default '{}'
    check (wants <@ array['more_subjects','more_qmon_chat','see_classmates','other']),
  -- ความยาวคุมที่ชั้น DB ตรงๆ ผ่าน varchar(60) (ไม่ใช้ check constraint แยก) — server action
  -- ยัง validate ซ้ำก่อน insert เป็น defense in depth ชั้นแรก
  free_text varchar(60),
  source text not null default 'popup',
  created_at timestamptz not null default now()
);

comment on table public.player_feedback is
  'คำตอบแบบสำรวจความคิดเห็น tester — append-only ห้าม update/delete. user_id เก็บไว้เพื่อ safety follow-up เท่านั้น ห้ามโชว์ตัวตนในหน้า aggregate/admin (masking ทำที่ชั้น UI/query)';

alter table public.player_feedback enable row level security;

create policy "player_feedback: insert own"
  on public.player_feedback
  for insert
  with check (auth.uid() = user_id);

create policy "player_feedback: select own"
  on public.player_feedback
  for select
  using (auth.uid() = user_id);
