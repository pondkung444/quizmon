-- Migration: 20260904150300_pvp_raid_bonus_cutoff
-- ปอนด์เคาะ: ตั๋ว raid bonus ไม่ย้อนหลัง — นับเฉพาะ raid run ที่จบ "หลังเปิดระบบตั๋ว"
-- (บัญชีที่มี raid history เยอะจะได้เต็มเพดาน 15 ทันที ซึ่งไม่ต้องการ)
--
-- pvp_config.raid_bonus_since = จุดตัด (default = ตอน migration นี้รัน)
--   ปอนด์ bump ค่านี้เองได้ตอน PvP เปิดให้นักเรียนจริง โดยไม่ต้อง migration ใหม่

begin;

set local lock_timeout = '5s';

-- ============================================================
-- 1) pvp_config — 1 แถวเดียว
-- ============================================================
create table public.pvp_config (
  id int primary key default 1 check (id = 1),
  raid_bonus_since timestamptz not null default now()
);
insert into public.pvp_config (id) values (1);

alter table public.pvp_config enable row level security;
-- อ่านได้ทุกคนที่ล็อกอิน (เผื่อ UI อยากโชว์) — เขียนผ่าน service role เท่านั้น
create policy "pvp_config: authed read" on public.pvp_config
  for select to authenticated using (true);

comment on table public.pvp_config is
  'PvP ประลอง — ค่า config 1 แถว. raid_bonus_since = จุดตัดตั๋ว raid bonus (ไม่นับ run ที่จบก่อนหน้านี้).';

-- ============================================================
-- 2) _pvp_grant_tickets — เพิ่ม filter completed_at >= cutoff
-- ============================================================
create or replace function public._pvp_grant_tickets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_available int;
  v_granted_today int;
  v_want int;
  v_cap constant int := 15;
  v_daily constant int := 2;
  v_raid_since timestamptz;
begin
  if p_user_id is null then return; end if;

  perform pg_advisory_xact_lock(hashtext('pvp_grant:' || p_user_id::text));

  select raid_bonus_since into v_raid_since from public.pvp_config where id = 1;

  select count(*) into v_available
  from public.pvp_tickets where user_id = p_user_id and consumed_at is null;

  -- ---- daily free: เติมให้ครบ 2/วัน (ปฏิทินไทย) ----
  select count(*) into v_granted_today
  from public.pvp_tickets
  where user_id = p_user_id and source = 'daily_free' and granted_day = v_today;

  v_want := least(v_daily - v_granted_today, v_cap - v_available);
  if v_want > 0 then
    insert into public.pvp_tickets (user_id, source, granted_day)
    select p_user_id, 'daily_free', v_today from generate_series(1, v_want);
    v_available := v_available + v_want;
  end if;

  -- ---- raid bonus: +1 ต่อ raid run ที่ completed หลัง cutoff และยังไม่เคยให้ตั๋ว ----
  if v_available < v_cap then
    insert into public.pvp_tickets (user_id, source, source_ref_id)
    select p_user_id, 'raid_bonus', r.id
    from public.raid_runs r
    where r.user_id = p_user_id
      and r.status = 'completed'
      and (v_raid_since is null or r.completed_at >= v_raid_since)
      and not exists (
        select 1 from public.pvp_tickets t
        where t.source = 'raid_bonus' and t.source_ref_id = r.id
      )
    order by r.completed_at asc nulls last
    limit (v_cap - v_available);
  end if;
end;
$$;

revoke execute on function public._pvp_grant_tickets(uuid) from anon, authenticated, public;

-- ============================================================
-- 3) เก็บกวาด: ลบตั๋ว raid_bonus ที่ยังไม่ถูกใช้ ซึ่งมาจาก run ก่อน cutoff
--    (ที่ apply migration ก่อนหน้าไป — ตอนนี้ยังไม่มีใครเล่นแมตช์จริง ตั๋วยัง unconsumed)
-- ============================================================
delete from public.pvp_tickets t
using public.raid_runs r, public.pvp_config c
where t.source = 'raid_bonus'
  and t.consumed_at is null
  and t.source_ref_id = r.id
  and r.completed_at < c.raid_bonus_since;

commit;

-- Rollback:
-- begin;
--   -- ไม่ restore ตั๋วที่ลบ (backlog ที่ไม่ต้องการอยู่แล้ว)
--   drop table if exists public.pvp_config cascade;  -- ต้อง recreate _pvp_grant_tickets แบบไม่มี cutoff ด้วย
-- commit;
