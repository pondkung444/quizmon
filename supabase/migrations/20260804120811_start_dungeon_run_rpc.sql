-- Migration: 20260804120300_start_dungeon_run_rpc
-- guard: pet เป็นของ user เรียก · stage=4 and is_active=false (Qmon ที่โตเต็มที่และเก็บเข้าสมุดแล้ว) ·
-- ไม่มีรัน in_progress ค้างอยู่ (บังคับด้วย dungeon_runs_one_active_per_user — unique_violation
-- ถ้าฝ่าฝืน ไม่ต้องเช็คมือซ้ำ)

create or replace function public.start_dungeon_run(p_pet_id uuid, p_dungeon_type_id uuid)
returns public.dungeon_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_duration int;
  v_run public.dungeon_runs;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (
    select 1 from public.pets
    where id = p_pet_id and user_id = v_user_id and stage = 4 and is_active = false
  ) then
    raise exception 'Qmon ตัวนี้ยังไม่พร้อมผจญภัย (ต้องโตเต็มที่และเก็บเข้าสมุดแล้ว)';
  end if;

  select duration_minutes into v_duration
  from public.dungeon_types
  where id = p_dungeon_type_id and is_active = true;

  if v_duration is null then
    raise exception 'ไม่พบดันเจี้ยนนี้ หรือดันเจี้ยนปิดใช้งานอยู่';
  end if;

  insert into public.dungeon_runs (user_id, pet_id, dungeon_type_id, ends_at)
  values (v_user_id, p_pet_id, p_dungeon_type_id, now() + (v_duration || ' minutes')::interval)
  returning * into v_run;

  return v_run;
end;
$$;

grant execute on function public.start_dungeon_run(uuid, uuid) to authenticated;

-- ============================================================
-- Rollback: drop function if exists public.start_dungeon_run(uuid, uuid);
-- ============================================================
