-- Migration: 20260925180000_classroom_end_closes_focus
-- ปิดห้องเรียนแล้ว "คาบตั้งใจ" ที่ยังรันอยู่จบตามด้วย (ต่อจาก 20260925170000_boss_raid_close_flows
-- ที่ทำแบบเดียวกันกับ Boss Raid) — ขยาย trigger function เดิม ไม่สร้าง trigger ใหม่
--
-- end_focus_mode_session ตอนนี้แค่ปิดสถานะ (ยังไม่มีการแจก EXP — Phase 3 ยังไม่ทำ) จึงปิดตรงนี้ได้
-- ด้วยค่าเดียวกัน (status='ended', ended_reason='host_ended'). ถ้า Phase 3 เพิ่มการแจก EXP ตอนจบคาบ
-- ต้องย้าย logic นั้นเป็นฟังก์ชันกลางแล้วเรียกจากที่นี่ด้วย ไม่งั้นปิดห้องแล้วนักเรียนจะไม่ได้ EXP
-- (ไม่ต้องแตะ classroom_sessions: end_classroom_session / หมดอายุ ตั้ง current_activity = null ให้แล้ว)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.classroom_end_open_boss_raids()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_raid uuid;
begin
  for v_raid in
    select b.id
    from public.classroom_boss_raids cbr
    join public.boss_raid_sessions b on b.id = cbr.boss_raid_session_id
    where cbr.classroom_session_id = new.id and b.status <> 'ended'
  loop
    perform public.resolve_boss_raid_session(v_raid, 'host_ended');
  end loop;

  -- คาบตั้งใจที่ยังรันอยู่ (ห้องละไม่เกิน 1 รอบ — unique index one_running_per_room)
  update public.classroom_focus_sessions
  set status = 'ended', ended_at = now(), ended_reason = 'host_ended'
  where classroom_session_id = new.id and status = 'running';

  return new;
end;
$$;

comment on function public.classroom_end_open_boss_raids() is
  'trigger: ห้องเรียนเปลี่ยนเป็น ended → จบ Boss Raid ที่ค้าง + คาบตั้งใจที่ยังรัน (ชื่อเดิมคงไว้เพื่อไม่ต้องสร้าง trigger ใหม่)';

commit;

-- ============================================================
-- Rollback: คืนตัวเดิมจาก 20260925170000_boss_raid_close_flows (ลบ update classroom_focus_sessions ออก)
-- ============================================================
