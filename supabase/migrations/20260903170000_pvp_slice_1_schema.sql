-- Migration: 20260903170000_pvp_slice_1_schema
-- ระบบ "ประลอง" (PvP) — สไลซ์ 1: ลูปที่เล่นจบได้
-- อ้างอิง: doc/claude_pvp-system-design-2026-09-03-draft.md, doc/pvp-phase-plan-2026-09-03.md,
--          doc/pvp-slice-1-draft-2026-09-03.md
--
-- แยกขาดจาก raid_* / boss_raid_* / quiz_attempts เดิม — namespace pvp_* ทั้งหมด
-- เขียนทุกตารางผ่าน SECURITY DEFINER RPC เท่านั้น (ไม่มี write policy ให้ client)
-- เกต: pvp_allowlist (pattern เดียวกับ raid_allowlist) — สไลซ์ 1 เปิดเฉพาะบัญชีทดสอบ

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 1) pvp_allowlist — เกตกันเดา URL (สไลซ์ 5 ค่อยเปิดเมนูล่าง)
-- ============================================================
create table public.pvp_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.pvp_allowlist enable row level security;

create policy "pvp_allowlist: select own" on public.pvp_allowlist
  for select using (user_id = auth.uid());

-- seed: pond (junior), ซันซัน (junior), daou (senior — สำหรับเทสเคสบล็อกข้ามชั้น)
insert into public.pvp_allowlist (user_id) values
  ('792b8e1d-410c-4158-9c62-32b437b05121'),
  ('a966f038-fe0d-4ab8-9dcf-09411ca41534'),
  ('abbc806f-8da6-49b8-a655-3aeb9dcae6e8')
on conflict (user_id) do nothing;

-- ============================================================
-- 2) pvp_challenges — คำท้าค้าง (ก่อนตอบรับ)
-- ============================================================
create table public.pvp_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  challenger_pet_id uuid not null references public.pets(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  responded_at timestamptz,
  constraint pvp_challenges_not_self check (challenger_id <> opponent_id)
);

-- กันส่งคำท้าซ้ำคู่เดิมขณะที่ยังค้างอยู่
create unique index pvp_challenges_one_pending_per_pair
  on public.pvp_challenges (challenger_id, opponent_id)
  where status = 'pending';
create index pvp_challenges_opponent_idx on public.pvp_challenges (opponent_id, status);
create index pvp_challenges_challenger_idx on public.pvp_challenges (challenger_id, status);
create index pvp_challenges_pet_idx on public.pvp_challenges (challenger_pet_id);

comment on table public.pvp_challenges is
  'PvP ประลอง — คำท้าค้าง. INSERT/UPDATE ผ่าน create_pvp_challenge()/accept_pvp_challenge()/decline_pvp_challenge()/cancel_pvp_challenge() เท่านั้น.';

-- ============================================================
-- 3) pvp_matches — สถานะแมตช์ (A = ผู้ท้า, B = ผู้รับ)
-- ============================================================
create table public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.pvp_challenges(id),
  player_a_id uuid not null references auth.users(id) on delete cascade,
  player_b_id uuid not null references auth.users(id) on delete cascade,
  pet_a_id uuid not null references public.pets(id),
  pet_b_id uuid not null references public.pets(id),

  -- snapshot สเตตัสตอนสร้างแมตช์ {hp,atk,def,spd,foc} — สไลซ์ 1 = raw (null -> 0)
  -- สไลซ์ 4: เติมโบนัสอุปกรณ์ PvP "ที่จุดนี้" คู่กับ src/lib/pvp/stats.ts pvpEffectiveStat()
  stat_a jsonb not null,
  stat_b jsonb not null,

  hp_a integer not null,
  hp_b integer not null,

  -- ปอนด์เคาะ: current_round +1 ต่อการ์ด 1 ใบที่ลงสนาม (เพดาน 30 ≈ 15 การ์ด/คน)
  current_round integer not null default 1,

  attacker_id uuid not null references auth.users(id),   -- ใครเป็น "ผู้ส่งการ์ด" ตอนนี้
  phase text not null default 'assigning'
    check (phase in ('assigning', 'answering')),
  active_card_id uuid,                                   -- FK -> pvp_match_cards เพิ่มท้ายไฟล์ (circular)

  status text not null default 'active'
    check (status in ('active', 'finished', 'abandoned')),
  outcome text check (outcome in ('a_win', 'b_win', 'draw')),
  winner_id uuid references auth.users(id),              -- null เมื่อ draw / abandoned

  created_at timestamptz not null default now(),
  last_action_at timestamptz not null default now(),
  timeout_at timestamptz not null default (now() + interval '3 days'),

  constraint pvp_matches_players_distinct check (player_a_id <> player_b_id)
);

create index pvp_matches_player_a_idx on public.pvp_matches (player_a_id, status);
create index pvp_matches_player_b_idx on public.pvp_matches (player_b_id, status);
create index pvp_matches_attacker_idx on public.pvp_matches (attacker_id);
create index pvp_matches_challenge_idx on public.pvp_matches (challenge_id);
create index pvp_matches_active_status_idx on public.pvp_matches (status) where status = 'active';

comment on table public.pvp_matches is
  'PvP ประลอง — 1 แถว = 1 แมตช์. เขียนผ่าน accept_pvp_challenge()/assign_pvp_card()/submit_pvp_card()/pvp_gc() เท่านั้น.';

-- ============================================================
-- 4) pvp_match_cards — มือการ์ดต่อการจั่ว (สไลซ์ 1: การ์ดเปล่า effect_id = null เสมอ)
-- ============================================================
create table public.pvp_match_cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.pvp_matches(id) on delete cascade,
  hand_no integer not null,                              -- ครั้งที่จั่วของผู้เล่นคนนั้น
  drawn_for_user_id uuid not null references auth.users(id) on delete cascade,
  chapter text not null,
  subject text not null,
  difficulty smallint not null,
  effect_id text,                                        -- null เสมอในสไลซ์ 1
  question_id bigint not null references public.questions(id),  -- ผูกตั้งแต่จั่ว (ปอนด์เคาะ)
  played_at timestamptz,                                 -- เซ็ตตอนถูกเลือกส่ง (assign_pvp_card)
  created_at timestamptz not null default now()
);

create index pvp_match_cards_match_idx on public.pvp_match_cards (match_id);
create index pvp_match_cards_hand_idx
  on public.pvp_match_cards (match_id, drawn_for_user_id, hand_no);
create index pvp_match_cards_question_idx on public.pvp_match_cards (question_id);

comment on table public.pvp_match_cards is
  'PvP ประลอง — มือการ์ด. SELECT ได้เฉพาะมือตัวเอง + การ์ดที่ลงสนามแล้ว (กันแอบดู question_id มืออีกฝ่าย). เขียนผ่าน draw_pvp_cards()/assign_pvp_card().';

-- circular FK: ตอนนี้ pvp_match_cards มีแล้ว
alter table public.pvp_matches
  add constraint pvp_matches_active_card_fk
  foreign key (active_card_id) references public.pvp_match_cards(id) on delete set null;

-- ============================================================
-- 5) quiz_attempts.pvp_match_id + ขยาย source CHECK
-- ============================================================
alter table public.quiz_attempts
  add column pvp_match_id uuid references public.pvp_matches(id);

create index quiz_attempts_pvp_match_idx
  on public.quiz_attempts (pvp_match_id) where pvp_match_id is not null;

alter table public.quiz_attempts drop constraint quiz_attempts_source_check;
alter table public.quiz_attempts add constraint quiz_attempts_source_check
  check (
    source is null
    or source = any (array['dungeon_bonus', 'raid_obstacle', 'raid_boss', 'topic_select', 'pvp'])
  );

-- ============================================================
-- 6) membership helper (SECURITY DEFINER — เลี่ยง RLS recursion)
-- ============================================================
create or replace function public.is_pvp_match_member(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.pvp_matches m
    where m.id = p_match_id
      and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid())
  );
$$;

comment on function public.is_pvp_match_member(uuid) is
  'true ถ้า auth.uid() เป็นผู้เล่นคนใดคนหนึ่งของแมตช์นี้. ใช้ใน RLS policy ของ pvp_matches / pvp_match_cards.';

-- ============================================================
-- 7) RLS
-- ============================================================
alter table public.pvp_challenges enable row level security;
alter table public.pvp_matches enable row level security;
alter table public.pvp_match_cards enable row level security;

create policy "pvp_challenges: party select" on public.pvp_challenges
  for select using (challenger_id = auth.uid() or opponent_id = auth.uid());

create policy "pvp_matches: member select" on public.pvp_matches
  for select using (public.is_pvp_match_member(id));

-- เห็นเฉพาะมือตัวเอง + การ์ดที่ลงสนามแล้ว (กันดึง question_id มืออีกฝ่ายมาเปิดหาเฉลยล่วงหน้า)
create policy "pvp_match_cards: own hand or played" on public.pvp_match_cards
  for select using (
    public.is_pvp_match_member(match_id)
    and (drawn_for_user_id = auth.uid() or played_at is not null)
  );

-- ตั้งใจไม่มี INSERT/UPDATE/DELETE policy ทั้ง 3 ตาราง — เขียนผ่าน SECURITY DEFINER RPC เท่านั้น

-- ============================================================
-- 8) Realtime — จอดวลสองฝั่ง subscribe channel `pvp:<matchId>`
-- ============================================================
alter publication supabase_realtime add table public.pvp_matches;
alter publication supabase_realtime add table public.pvp_match_cards;
alter table public.pvp_matches replica identity full;

commit;

-- ============================================================
-- Rollback:
-- begin;
--   alter publication supabase_realtime drop table public.pvp_match_cards;
--   alter publication supabase_realtime drop table public.pvp_matches;
--   alter table public.quiz_attempts drop constraint quiz_attempts_source_check;
--   alter table public.quiz_attempts add constraint quiz_attempts_source_check
--     check (source is null or source = any (array['dungeon_bonus','raid_obstacle','raid_boss','topic_select']));
--   alter table public.quiz_attempts drop column pvp_match_id;
--   drop function if exists public.is_pvp_match_member(uuid);
--   drop table if exists public.pvp_match_cards cascade;
--   drop table if exists public.pvp_matches cascade;
--   drop table if exists public.pvp_challenges cascade;
--   drop table if exists public.pvp_allowlist;
-- commit;
