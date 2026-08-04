-- Migration: dungeon_bonus_harden_correct_count
-- Hardening ตามคำสั่งปอนด์: เดิม apply_dungeon_bonus เชื่อ p_correct_count จาก client ตรงๆ (ไม่มีทาง
-- cross-check กับ quiz_attempts จริงเพราะไม่มีคอลัมน์เชื่อมรัน) — เพิ่ม dungeon_run_id ให้
-- quiz_attempts ผูกกับคำถามโบนัสที่ submitDungeonBonusAnswer() insert แล้วเปลี่ยน apply_dungeon_bonus
-- ให้นับถูก/ผิดจาก DB เองแทนรับพารามิเตอร์จาก client
--
-- หมายเหตุ: migration ถัดไป (restore_apply_dungeon_bonus_signature) แก้ signature ของ
-- apply_dungeon_bonus กลับเป็น (uuid, int) อีกครั้ง (ตอนแรกเปลี่ยนเหลือแค่ (uuid) ผิดเจตนา — ปอนด์
-- อยากให้ยัง "ยิงด้วย p_correct_count ปลอม" แล้วเห็นว่าถูกเพิกเฉยได้ ไม่ใช่ error function not found)
-- คอลัมน์ dungeon_run_id + index ในไฟล์นี้ยังใช้งานอยู่ตามเดิม ไม่ถูกย้อนกลับ

alter table public.quiz_attempts
  add column dungeon_run_id uuid references public.dungeon_runs(id) on delete set null;

comment on column public.quiz_attempts.dungeon_run_id is
  'การผจญภัย (dungeon_runs) ที่คำถามโบนัสข้อนี้ผูกอยู่ — มีค่าเฉพาะแถวที่ source=''dungeon_bonus''
   เท่านั้น ใช้ให้ apply_dungeon_bonus() นับถูก/ผิดจาก DB เองแทนเชื่อ p_correct_count จาก client';

create index idx_quiz_attempts_dungeon_run_id
  on public.quiz_attempts (dungeon_run_id)
  where dungeon_run_id is not null;

-- signature เปลี่ยนจาก apply_dungeon_bonus(uuid, int) เป็น apply_dungeon_bonus(uuid) — ต้อง drop
-- overload เดิมก่อน (ตาม pattern เดียวกับ 20260719103151_drop_old_claim_daily_mission_bonus_overload.sql)
drop function if exists public.apply_dungeon_bonus(uuid, int);

create or replace function public.apply_dungeon_bonus(p_run_id uuid)
returns public.dungeon_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_correct_count int;
  v_clamped int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- นับถูกจริงจาก DB (ผูกด้วย dungeon_run_id + user_id + source='dungeon_bonus') ไม่รับตัวเลขจาก
  -- client เด็ดขาด — filter user_id ด้วยกันเคส user อื่นแอบ insert quiz_attempts ผูก run_id คนอื่น
  -- (RLS "insert own" บังคับ user_id=auth.uid() ของผู้ insert เองอยู่แล้ว จึงนับไม่ปนกัน)
  select count(*) filter (where is_correct) into v_correct_count
  from public.quiz_attempts
  where dungeon_run_id = p_run_id
    and user_id = v_user_id
    and source = 'dungeon_bonus';

  v_clamped := greatest(0, least(5, coalesce(v_correct_count, 0)));

  update public.dungeon_runs
  set ends_at = greatest(now(), ends_at - (v_clamped * 12 || ' minutes')::interval),
      bonus_quiz_used = true,
      bonus_minutes_saved = v_clamped * 12
  where id = p_run_id
    and user_id = v_user_id
    and bonus_quiz_used = false
  returning * into v_run;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้ หรือใช้คำถามโบนัสไปแล้ว';
  end if;

  return v_run;
end;
$$;

grant execute on function public.apply_dungeon_bonus(uuid) to authenticated;

-- ============================================================
-- Rollback:
-- drop function if exists public.apply_dungeon_bonus(uuid);
-- drop index if exists public.idx_quiz_attempts_dungeon_run_id;
-- alter table public.quiz_attempts drop column if exists dungeon_run_id;
-- (ต้อง re-create apply_dungeon_bonus(uuid,int) เดิมเองถ้าต้องการย้อนสมบูรณ์ ดู
-- 20260804120500_dungeon_bonus_rpcs.sql)
-- ============================================================
