-- Migration: 20260901170000_boss_raid_tv_participant_display
-- Classroom Boss Raid — Phase 1 TV: top-5 formation ต้องโชว์ Qmon "ตัวจริง" ของผู้เล่นแต่ละคน
--   (ไม่ใช่ sprite generic ต่อช่องอันดับ) — feedback ปอนด์ 2026-09-01
--
-- get_boss_raid_participant_names() (20260901160000) คืนแค่ display_name — ยังขาด field ที่ต้องใช้
-- resolve sprite path ผ่าน src/lib/petImage.ts (single source of truth เดียวของโปรเจกต์ รวม gotcha
-- "balanced" -> "balance" ที่ documented ไว้ในนั้น) TV ไม่ควรประกอบ path เองใน SQL
--
-- pets เป็น RLS "select own row เท่านั้น" (auth.uid() = user_id) เหมือนเดิม — client join ข้ามไปดู
-- Qmon ของเพื่อนร่วมห้องไม่ได้ ต้องผ่าน SECURITY DEFINER RPC เดียว สโคป is_boss_raid_member(session_id)
-- (เหมือนตัวเดิม) — คืนเฉพาะ field ที่จำเป็นต่อการ render (ชื่อ + 4 ช่องประกอบ sprite) ไม่ leak
-- pets/profiles column อื่น
--
-- เปลี่ยน return shape ไม่ได้ด้วย CREATE OR REPLACE (Postgres: cannot change return type) และ
-- get_boss_raid_participant_names ยังไม่มีใครเรียกใน main (โค้ด TV อยู่บน feature branch เท่านั้น)
-- -> DROP ทิ้งแล้วสร้าง get_boss_raid_participant_display แทน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.get_boss_raid_participant_names(uuid);

create or replace function public.get_boss_raid_participant_display(p_session_id uuid)
returns table (
  participant_id uuid,
  display_name   text,
  sprite_prefix  text,
  stage          smallint,
  subline        text,
  personality    text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id,
         coalesce(pt.nickname, 'Qmon ของ ' || prof.username),
         et.sprite_prefix,
         pt.stage,
         pt.subline,
         pt.personality
  from public.boss_raid_participants p
  join public.pets pt on pt.id = p.pet_id
  join public.egg_types et on et.id = pt.egg_type_id
  join public.profiles prof on prof.id = p.user_id
  where p.session_id = p_session_id
    and public.is_boss_raid_member(p_session_id);
$$;

comment on function public.get_boss_raid_participant_display(uuid) is
  'ข้อมูลแสดงผลผู้เล่นในห้อง (TV top-5 formation / ticker / มือถือ): display_name '
  '(coalesce(pets.nickname, "Qmon ของ " || profiles.username)) + 4 ช่องประกอบ sprite path '
  '(sprite_prefix/stage/subline/personality — client resolve ผ่าน src/lib/petImage.ts เอง). '
  'เข้าถึงได้เฉพาะ member ของห้องนั้น (ครู/นักเรียนในห้อง) ไม่ expose column อื่นของ pets/egg_types/profiles.';

grant execute on function public.get_boss_raid_participant_display(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   DROP FUNCTION public.get_boss_raid_participant_display(uuid);
--   re-apply 20260901160000 ส่วน get_boss_raid_participant_names(uuid)
-- ============================================================
