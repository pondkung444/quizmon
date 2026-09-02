-- Migration: 20260903120000_boss_raid_pet_selection
-- Classroom Boss Raid — เลือก Qmon เองที่หน้ารอ (status='lobby')
-- อ้างอิง: classroom-boss-raid-design-2026-08-28-v2.md §5, §12
--
-- เดิม: join_boss_raid_session() auto-pick pet is_active=true แล้ว snapshot stat ทันที ห้ามเปลี่ยน
-- ใหม่: นักเรียนสลับเป็น pet stage 4 ตัวไหนก็ได้ของตัวเอง ระหว่างที่ห้องยัง lobby
--
-- 1) compute_boss_raid_stat_snapshot(p_pet_id) — ดึง logic คำนวณ stat_snapshot
--    (base + gear sum + clamp cap ตาม egg_types.stat_profile->'caps') ออกจาก join เป็นฟังก์ชันกลาง
--    stage 4 -> stat จริง; stage < 4 -> fallback คงที่ 30 ทุกแกน (เดิมอยู่ใน join)
-- 2) join_boss_raid_session() — เรียก compute_boss_raid_stat_snapshot() แทน inline logic (พฤติกรรมเดิมทุกประการ)
-- 3) select_boss_raid_pet(p_participant_id, p_pet_id) — สลับ pet ของ participant ตัวเอง
--    เงื่อนไข: participant เป็นของ auth.uid(), pet เป็นของ auth.uid(), pet.stage >= 4, session.status = 'lobby'
--
-- ไม่แตะ schema. ไม่แตะสูตรดาเมจ/HP scaling ใดๆ.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) compute_boss_raid_stat_snapshot — ฟังก์ชันกลางคำนวณ stat_snapshot ของ pet 1 ตัว
-- ============================================================
create or replace function public.compute_boss_raid_stat_snapshot(p_pet_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_pet public.pets;
  v_caps jsonb;
  v_snapshot jsonb;
begin
  select * into v_pet from public.pets where id = p_pet_id;
  if not found then
    raise exception 'ไม่พบสัตว์เลี้ยงตัวนี้';
  end if;

  if v_pet.stage = 4 then
    -- pet ถึง stage 4: stat จริง snapshot แล้ว — base + gear แล้ว clamp cap ตามระบบ raid เดิม
    select stat_profile -> 'caps' into v_caps
    from public.egg_types where id = v_pet.egg_type_id;

    with gear as (
      select main_stat, main_value, sub_stat, sub_value
      from public.raid_gear_items
      where equipped_pet_id = v_pet.id
    ),
    axes(k, base) as (
      values
        ('hp',  coalesce(v_pet.stat_hp, 0)),
        ('atk', coalesce(v_pet.stat_atk, 0)),
        ('def', coalesce(v_pet.stat_def, 0)),
        ('spd', coalesce(v_pet.stat_spd, 0)),
        ('foc', coalesce(v_pet.stat_foc, 0))
    )
    select jsonb_object_agg(
      a.k,
      least(
        a.base
          + coalesce((select sum(g.main_value) from gear g where g.main_stat = a.k), 0)
          + coalesce((select sum(g.sub_value)  from gear g where g.sub_stat  = a.k), 0),
        coalesce((v_caps ->> a.k)::int, 2147483647)
      )
    ) into v_snapshot
    from axes a;
  else
    -- pet ยังไม่ถึง stage 4: stat ยังเป็น 0/null ทั้งหมด -> fallback คงที่ 30 ทุกแกน
    -- (ขยาย precedent §5) — ไม่ query raid_gear_items (ผูก gear ได้เฉพาะ pet stage 4)
    v_snapshot := jsonb_build_object('hp', 30, 'atk', 30, 'def', 30, 'spd', 30, 'foc', 30);
  end if;

  return v_snapshot;
end;
$$;

comment on function public.compute_boss_raid_stat_snapshot(uuid) is
  'stat_snapshot ({hp,atk,def,spd,foc}) ของ pet 1 ตัว — base + gear sum + clamp cap ตาม egg_types.stat_profile->caps (stage 4); flat 30 ทุกแกน (stage < 4). ใช้ร่วมกันโดย join_boss_raid_session และ select_boss_raid_pet.';

-- ============================================================
-- 2) join_boss_raid_session — เรียก compute_boss_raid_stat_snapshot() แทน inline logic
-- ============================================================
create or replace function public.join_boss_raid_session(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
  v_pet public.pets;
  v_participant public.boss_raid_participants;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_session
  from public.boss_raid_sessions
  where join_code = upper(btrim(p_join_code));

  if not found then
    raise exception 'ไม่พบรหัสห้องนี้';
  end if;

  if v_session.status not in ('lobby', 'in_progress') then
    raise exception 'ห้องนี้ปิดรับผู้เล่นแล้ว';
  end if;

  select * into v_participant
  from public.boss_raid_participants
  where session_id = v_session.id and user_id = v_user_id;

  if not found then
    select * into v_pet
    from public.pets
    where user_id = v_user_id and is_active = true
    limit 1;

    if not found then
      raise exception 'ยังไม่มีสัตว์เลี้ยงที่ใช้งานอยู่';
    end if;

    insert into public.boss_raid_participants (session_id, user_id, pet_id, stat_snapshot)
    values (
      v_session.id,
      v_user_id,
      v_pet.id,
      public.compute_boss_raid_stat_snapshot(v_pet.id)
    )
    returning * into v_participant;
  end if;

  return jsonb_build_object(
    'session_id',    v_session.id,
    'status',        v_session.status,
    'join_code',     v_session.join_code,
    'config',        v_session.config,
    'participant_id', v_participant.id,
    'pet_id',        v_participant.pet_id,
    'stat_snapshot', v_participant.stat_snapshot
  );
end;
$$;

grant execute on function public.join_boss_raid_session(text) to authenticated;

-- ============================================================
-- 3) select_boss_raid_pet — นักเรียนสลับ pet ระหว่างห้องยัง lobby
-- ============================================================
create or replace function public.select_boss_raid_pet(p_participant_id uuid, p_pet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.boss_raid_participants;
  v_session public.boss_raid_sessions;
  v_pet public.pets;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_participant
  from public.boss_raid_participants
  where id = p_participant_id;

  if not found or v_participant.user_id <> v_user_id then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนตัวของผู้เล่นนี้';
  end if;

  select * into v_session
  from public.boss_raid_sessions
  where id = v_participant.session_id;

  if not found then
    raise exception 'ไม่พบห้องนี้';
  end if;

  -- state เป็นของ server เสมอ (§12): ล็อกตัวเลือกทันทีที่เกมเริ่ม
  if v_session.status <> 'lobby' then
    raise exception 'เกมเริ่มแล้ว เปลี่ยน Qmon ไม่ได้';
  end if;

  select * into v_pet
  from public.pets
  where id = p_pet_id and user_id = v_user_id;

  if not found then
    raise exception 'ไม่พบ Qmon ตัวนี้ หรือไม่ใช่ของคุณ';
  end if;

  if v_pet.stage < 4 then
    raise exception 'เลือกได้เฉพาะ Qmon ที่โตเต็มวัย (stage 4)';
  end if;

  v_snapshot := public.compute_boss_raid_stat_snapshot(p_pet_id);

  update public.boss_raid_participants
  set pet_id = p_pet_id,
      stat_snapshot = v_snapshot
  where id = p_participant_id
  returning * into v_participant;

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'pet_id',         v_participant.pet_id,
    'stat_snapshot',  v_participant.stat_snapshot
  );
end;
$$;

comment on function public.select_boss_raid_pet(uuid, uuid) is
  'นักเรียนสลับ pet ของ participant ตัวเอง (pet.stage >= 4, session ยัง lobby) — re-snapshot stat ทันที.';

grant execute on function public.select_boss_raid_pet(uuid, uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
-- ============================================================
-- begin;
-- drop function if exists public.select_boss_raid_pet(uuid, uuid);
-- -- re-apply 20260829230000_boss_raid_join_fallback_stat_pre_stage4's join_boss_raid_session
-- drop function if exists public.compute_boss_raid_stat_snapshot(uuid);
-- commit;
