-- Migration: 20260925170000_boss_raid_close_flows
-- ปิด Boss Raid ได้จากทุกจุด + ปิดห้องเรียนแล้ว Raid ที่ค้างจบตามไปด้วย
--
--   1) close_boss_raid(p_boss_raid_session_id) — ครูเจ้าของ Raid: จบเกม (ถ้ายังไม่จบ ผ่าน
--      resolve_boss_raid_session แบบเดียวกับ end_boss_raid_session → แจกรางวัลตามเดิม) แล้วพาห้องเรียน
--      ที่ผูก Raid นี้อยู่กลับห้องรอ (current_activity = null). คืน classroom_session_id ให้หน้าเว็บพากลับ
--      ใช้ได้ทั้งตอน lobby (ยกเลิกก่อนเริ่ม) / กำลังเล่น / จบแล้ว — เดิม clear_classroom_activity ปฏิเสธ
--      (classroom_activity_busy) ตอน Raid ยังไม่จบ แต่หน้าห้องเรียนไม่มีปุ่มจบ Raid ครูจึงติด
--   2) trigger บน classroom_sessions: status เปลี่ยนเป็น 'ended' (ปิดห้อง / หมดอายุ 12 ชม. /
--      start_class_session ปิดห้องอื่น) → Raid ทุกตัวของคาบนั้นที่ยังไม่จบ จบด้วย 'host_ended'
--      (ครอบทุกทางที่ปิดห้อง ไม่ต้องแก้ทีละ RPC)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) close_boss_raid
-- ============================================================
create or replace function public.close_boss_raid(p_boss_raid_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s public.boss_raid_sessions;
  v_result text;
  v_classroom uuid;
begin
  select * into v_s from public.boss_raid_sessions where id = p_boss_raid_session_id;
  if not found or v_s.teacher_id <> auth.uid() then
    raise exception 'not_authorized_or_not_found';
  end if;

  if v_s.status <> 'ended' then
    v_result := public.resolve_boss_raid_session(p_boss_raid_session_id, 'host_ended');
  else
    v_result := v_s.result;
  end if;

  select cbr.classroom_session_id into v_classroom
  from public.classroom_boss_raids cbr
  where cbr.boss_raid_session_id = p_boss_raid_session_id;

  -- ห้องเรียนยังชี้ Raid นี้อยู่ → กลับห้องรอ (ห้องที่เปลี่ยนไปกิจกรรมอื่นแล้วไม่แตะ)
  update public.classroom_sessions
  set current_activity = null
  where id = v_classroom
    and status <> 'ended'
    and current_activity = 'boss_raid'
    and active_boss_raid_session_id = p_boss_raid_session_id;

  return jsonb_build_object('result', v_result, 'classroom_session_id', v_classroom);
end;
$$;

grant execute on function public.close_boss_raid(uuid) to authenticated;

-- ============================================================
-- 2) ปิดห้องเรียน → จบ Raid ที่ค้าง
-- ============================================================
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
  return new;
end;
$$;

revoke all on function public.classroom_end_open_boss_raids() from public, anon, authenticated;

create trigger classroom_sessions_end_open_boss_raids
  after update of status on public.classroom_sessions
  for each row
  when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function public.classroom_end_open_boss_raids();

commit;

-- ============================================================
-- Rollback:
--   drop trigger if exists classroom_sessions_end_open_boss_raids on public.classroom_sessions;
--   drop function if exists public.classroom_end_open_boss_raids();
--   drop function if exists public.close_boss_raid(uuid);
-- ============================================================
