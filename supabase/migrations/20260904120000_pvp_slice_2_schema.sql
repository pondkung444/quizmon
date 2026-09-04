-- Migration: 20260904120000_pvp_slice_2_schema
-- ระบบ "ประลอง" (PvP) — สไลซ์ 2: เอฟเฟกต์การ์ด + กราฟิกการ์ด
-- อ้างอิง: doc/pvp-slice2-handoff (2026-09-04)
--
-- ส่วนนี้ = schema เท่านั้น (catalog เอฟเฟกต์ + FK + คอลัมน์ round_deadline)
-- logic การจับเวลา/เรโซลูชันอยู่ใน 20260904120100_pvp_slice_2_rpcs.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 1) pvp_card_effects — catalog เอฟเฟกต์ 6 แบบ (reference table)
--    favors = ข้อมูลประกอบ UI/analytics เท่านั้น — ไม่มี game logic แตกแขนงจากค่านี้
-- ============================================================
create table public.pvp_card_effects (
  id text primary key,
  name_th text not null,
  short_desc_th text not null,
  favors text not null check (favors in ('sender', 'receiver', 'sender_risk'))
);

insert into public.pvp_card_effects (id, name_th, short_desc_th, favors) values
  ('reprisal',   'สวนกลับ',      'ตอบถูก → ดาเมจสะท้อนกลับใส่คนส่งเท่าดาเมจฐานของการ์ดนั้น',        'sender_risk'),
  ('pierce',     'เจาะเกราะ',     'ตอบถูกก็ยังโดนดาเมจเล็กน้อย (ไม่สน DEF)',                          'sender'),
  ('heal',       'ฮีลเมื่อสำเร็จ', 'ตอบถูก → ได้เลือดคืนแทนที่จะแค่ไม่โดน',                            'receiver'),
  ('high_stake', 'เดิมพันสูง',    'ตอบผิด = ดาเมจ 2 เท่าปกติ',                                        'sender'),
  ('lifesteal',  'ดูดเลือด',      'ตอบผิด → นอกจากโดนดาเมจปกติ คนส่งได้เลือดคืนเท่าดาเมจที่สร้างได้',   'sender'),
  ('haste',      'เร่งเวลา',      'เวลาตอบเหลือ 30 วิ แทน 60',                                        'sender');

alter table public.pvp_card_effects enable row level security;

-- catalog สาธารณะสำหรับผู้ใช้ที่ล็อกอิน (อ่านอย่างเดียว — ไม่มี write policy)
create policy "pvp_card_effects: authed read" on public.pvp_card_effects
  for select to authenticated using (true);

comment on table public.pvp_card_effects is
  'PvP ประลอง — catalog เอฟเฟกต์การ์ด 6 แบบ (สไลซ์ 2). อ่านอย่างเดียว, seed จาก migration.';

-- ============================================================
-- 2) FK: pvp_match_cards.effect_id -> pvp_card_effects(id)
--    (คอลัมน์ text nullable มีอยู่แล้วจากสไลซ์ 1 — null = การ์ดเปล่า)
-- ============================================================
alter table public.pvp_match_cards
  add constraint pvp_match_cards_effect_id_fkey
  foreign key (effect_id) references public.pvp_card_effects(id);

-- ============================================================
-- 3) pvp_matches.round_deadline — นาฬิกาตอบต่อยก (server-enforced)
--    ตั้งตอน phase -> 'answering' (assign_pvp_card), เคลียร์ตอนยกจบ (submit / gc)
-- ============================================================
alter table public.pvp_matches
  add column round_deadline timestamptz;

comment on column public.pvp_matches.round_deadline is
  'เส้นตายตอบของยกปัจจุบัน. now()+60วิ+โบนัส SPD ปกติ / now()+30วิ ถ้าการ์ด effect_id=haste. null เมื่อไม่ได้อยู่ช่วง answering.';

commit;

-- ============================================================
-- Rollback:
-- begin;
--   alter table public.pvp_matches drop column round_deadline;
--   alter table public.pvp_match_cards drop constraint pvp_match_cards_effect_id_fkey;
--   drop table if exists public.pvp_card_effects;
-- commit;
