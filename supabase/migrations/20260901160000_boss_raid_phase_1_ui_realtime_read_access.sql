-- Migration: 20260901160000_boss_raid_phase_1_ui_realtime_read_access
-- Classroom Boss Raid — Phase 1 TV/Student UI: read access เปิดที่ยังขาด
-- อ้างอิง: handoff boss-raid-phase1-context-2026-08-31.md §2.2/§3.2, สำรวจ 2026-09-01 พบว่า
--   boss_raid_answers และ boss_raid_event_log ยังไม่มี SELECT policy เลย (deny-all ตาม
--   comment เดิมตอนสร้างตาราง) และไม่อยู่ใน supabase_realtime publication —
--   ticker/damage-float (TV) + event overlay (มือถือ) ที่ต้องใช้ทั้งสองตารางนี้ยังทำไม่ได้จนกว่าจะแก้
--
-- Nickname fallback (เคาะกับปอนด์แล้ว 2026-09-01):
--   coalesce(pets.nickname, 'Qmon ของ ' || profiles.username)
--   pets/profiles เป็น RLS แบบ "select own เท่านั้น" (auth.uid() = user_id / id) — client join ตรงไม่ได้
--   -> เปิดผ่าน SECURITY DEFINER RPC เดียว คืนแค่ participant_id + display_name (ไม่แตะ column อื่นของ
--   pets/profiles เลย) แทนที่จะเปิด SELECT policy ให้ทั้งตาราง

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ===== 1. SELECT policies — สโคปเดียวกับ boss_raid_participants/sessions ทุกตาราง =====
-- (is_boss_raid_member: ครูเจ้าของห้อง หรือ participant ของห้องนั้น — ไม่มีการเปิดกว้างกว่านี้)

create policy "boss_raid_answers: member select" on public.boss_raid_answers
  for select using (public.is_boss_raid_member(session_id));

create policy "boss_raid_event_log: member select" on public.boss_raid_event_log
  for select using (public.is_boss_raid_member(session_id));

-- ===== 2. Realtime publication — ให้ TV ticker + มือถือ event overlay subscribe ได้ =====
-- ทั้งคู่ insert-only จากมุมมอง client (boss_raid_event_log มี UPDATE ตอน claim ผู้ชนะ meteor
-- แต่ winner_participant_id ก็ broadcast ซ้ำผ่าน boss_raid_sessions.active_event อยู่แล้ว
-- ที่ publish/replica-identity-full ไปแล้วตั้งแต่ 0.1) — ไม่ต้อง replica identity full เพิ่ม

alter publication supabase_realtime add table public.boss_raid_answers;
alter publication supabase_realtime add table public.boss_raid_event_log;

-- ===== 3. ชื่อแสดงผล (nickname fallback) — SECURITY DEFINER, คืนเฉพาะ participant_id + display_name =====

create or replace function public.get_boss_raid_participant_names(p_session_id uuid)
returns table (participant_id uuid, display_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id,
         coalesce(pt.nickname, 'Qmon ของ ' || prof.username)
  from public.boss_raid_participants p
  join public.pets pt on pt.id = p.pet_id
  join public.profiles prof on prof.id = p.user_id
  where p.session_id = p_session_id
    and public.is_boss_raid_member(p_session_id);
$$;

comment on function public.get_boss_raid_participant_names(uuid) is
  'ชื่อแสดงผลของผู้เล่นในห้อง (TV top-5 / ticker / มือถือ) — coalesce(pets.nickname, "Qmon ของ " || profiles.username). '
  'เข้าถึงได้เฉพาะ member ของห้องนั้น (ครู/นักเรียนในห้อง) คืนแค่ participant_id+display_name ไม่ expose column อื่นของ pets/profiles.';

grant execute on function public.get_boss_raid_participant_names(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   DROP FUNCTION public.get_boss_raid_participant_names(uuid);
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.boss_raid_event_log;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.boss_raid_answers;
--   DROP POLICY "boss_raid_event_log: member select" ON public.boss_raid_event_log;
--   DROP POLICY "boss_raid_answers: member select" ON public.boss_raid_answers;
-- ============================================================
