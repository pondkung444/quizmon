-- Migration: restore_apply_dungeon_bonus_signature
-- แก้ทันทีหลังพบว่าเปลี่ยน signature เป็น apply_dungeon_bonus(uuid) เฉยๆ ผิดเจตนา — ปอนด์อยากให้
-- ยัง "ยิง apply_dungeon_bonus ด้วย p_correct_count ปลอม" ได้ (เทียบผลว่าถูกเพิกเฉย ไม่ใช่ error
-- function not found) จึงต้องคง signature (uuid, int) ไว้เหมือนเดิม แค่เปลี่ยนเนื้อฟังก์ชันให้
-- เพิกเฉยค่า p_correct_count ที่รับมา แล้วนับจาก quiz_attempts จริงแทนเสมอ
--
-- verify แล้ว: insert quiz_attempts ผูก dungeon_run_id 2 ถูก/3 ผิด แล้วยิง
-- apply_dungeon_bonus(run_id, 5) (ปลอมค่า 5) -> bonus_minutes_saved กลับมา 24 (2*12) ไม่ใช่ 60 (5*12)

drop function if exists public.apply_dungeon_bonus(uuid);

create or replace function public.apply_dungeon_bonus(p_run_id uuid, p_correct_count int default null)
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

  -- p_correct_count รับไว้เฉย ๆ เพื่อความเข้ากันได้ของ signature — ไม่ใช้ค่าที่รับมาเลย นับถูกจริง
  -- จาก DB เสมอ (ผูกด้วย dungeon_run_id + user_id + source='dungeon_bonus') กัน client โกงค่า
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

grant execute on function public.apply_dungeon_bonus(uuid, int) to authenticated;

-- ============================================================
-- Rollback: re-apply dungeon_bonus_harden_correct_count.sql (signature (uuid) เดิมก่อนแก้)
-- ============================================================
