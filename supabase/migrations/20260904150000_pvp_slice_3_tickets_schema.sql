-- Migration: 20260904150000_pvp_slice_3_tickets_schema
-- PvP ประลอง — สไลซ์ 3: ตั๋วประลอง (pvp_tickets) + คอลัมน์ EXP บน pvp_matches
--
-- โมเดล ledger มิเรอร์ raid_tickets: 1 แถว = 1 ตั๋ว
--   consumed_at is null  -> ใช้ได้ (นับ balance จากตรงนี้)
--   consumed_at set       -> ถูกใช้ไปกับ consumed_challenge_id
--   refunded_at set       -> เคยถูกคืน (audit); availability ดูแค่ consumed_at is null
-- grant แบบ lazy (ไม่มี cron) — daily 2/วัน + raid bonus +1 ต่อ raid run ที่ completed (ชนะ/แพ้นับหมด)
-- deduct: ผู้ท้าเท่านั้น ตอน create_pvp_challenge · refund: อัตโนมัติผ่าน trigger เมื่อคำท้า
--   pending -> declined/cancelled/expired

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 1) pvp_tickets
-- ============================================================
create table public.pvp_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('daily_free', 'raid_bonus')),
  source_ref_id uuid,                 -- raid_runs.id สำหรับ raid_bonus / null สำหรับ daily_free
  granted_day date,                   -- วันปฏิทินไทยตอน grant (daily_free ใช้กันซ้ำ/วัน) / null สำหรับ raid_bonus
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_challenge_id uuid references public.pvp_challenges(id),
  refunded_at timestamptz
);

-- balance = ตั๋วที่ยังไม่ถูกใช้
create index pvp_tickets_available_idx
  on public.pvp_tickets (user_id) where consumed_at is null;
-- daily_free: นับจำนวนที่ grant ไปแล้ววันนี้
create index pvp_tickets_daily_idx
  on public.pvp_tickets (user_id, granted_day) where source = 'daily_free';
-- raid_bonus: 1 run ให้ตั๋วได้ครั้งเดียวตลอดกาล
create unique index pvp_tickets_raid_once_idx
  on public.pvp_tickets (source_ref_id) where source = 'raid_bonus';
-- หา ตั๋วที่ผูกกับคำท้า (ตอน refund)
create index pvp_tickets_challenge_idx
  on public.pvp_tickets (consumed_challenge_id) where consumed_challenge_id is not null;

alter table public.pvp_tickets enable row level security;

-- อ่านได้เฉพาะตั๋วตัวเอง (นับ balance ฝั่ง client) — เขียนผ่าน SECURITY DEFINER RPC เท่านั้น
create policy "pvp_tickets: select own" on public.pvp_tickets
  for select using (user_id = auth.uid());

comment on table public.pvp_tickets is
  'PvP ประลอง — ตั๋ว (ledger, 1 แถว = 1 ตั๋ว). grant lazy (daily 2 + raid bonus), deduct ที่ create_pvp_challenge, refund ผ่าน trigger. เพดานสะสม 15.';

-- ============================================================
-- 2) trigger: คืนตั๋วเมื่อคำท้า pending -> declined/cancelled/expired
-- ============================================================
create or replace function public._pvp_refund_ticket_on_challenge_close()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status = 'pending' and new.status in ('declined', 'cancelled', 'expired') then
    update public.pvp_tickets
      set consumed_at = null,
          consumed_challenge_id = null,
          refunded_at = now()
    where consumed_challenge_id = new.id
      and consumed_at is not null;
  end if;
  return new;
end;
$$;

create trigger trg_pvp_refund_ticket
  after update of status on public.pvp_challenges
  for each row
  execute function public._pvp_refund_ticket_on_challenge_close();

-- ============================================================
-- 3) pvp_matches: EXP ที่ให้ตอนแมตช์จบ (ให้ "ตัวที่กำลังเลี้ยง" ของแต่ละฝ่าย)
--    เก็บไว้เพื่อให้ทั้งสองจอเห็นเลข + client เอา exp_pet_* ไป reconcile วิวัฒนาการ (option B)
-- ============================================================
alter table public.pvp_matches
  add column exp_a int,
  add column exp_b int,
  add column exp_pet_a uuid,   -- pets.id ของตัว active ฝั่ง a ตอนจบแมตช์ (อาจ null ถ้าไม่มีตัวเลี้ยง)
  add column exp_pet_b uuid;

commit;

-- ============================================================
-- Rollback:
-- begin;
--   alter table public.pvp_matches drop column exp_a, drop column exp_b,
--     drop column exp_pet_a, drop column exp_pet_b;
--   drop trigger if exists trg_pvp_refund_ticket on public.pvp_challenges;
--   drop function if exists public._pvp_refund_ticket_on_challenge_close();
--   drop table if exists public.pvp_tickets;
-- commit;
