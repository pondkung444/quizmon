-- Migration: 20260903130000_boss_raid_loadout_stat_flat_50
-- Classroom Boss Raid — pre-stage-4 Qmon fallback stat 30 -> 50 ทุกแกน
-- อ้างอิง: ต่อจาก 20260903120000_boss_raid_pet_selection (compute_boss_raid_stat_snapshot / select_boss_raid_pet)
--
-- Pond: อยากให้ Qmon ร่างธรรมดา (stage < 4 ที่ยังไม่มี stat จริง) ได้ flat 50 ทุกแกน แทน 30
-- ตัว stage 4 ไม่เปลี่ยน (base + gear + clamp cap เหมือนเดิม). ไม่แตะ schema / สูตรดาเมจ / HP scaling.
-- `select_boss_raid_pet` ไม่ต้องแก้ — มันเรียก compute_boss_raid_stat_snapshot() สดทุกครั้งอยู่แล้ว
-- (ปรับอุปกรณ์แล้วกดเลือกตัวเดิมซ้ำ = re-snapshot รวม gear ใหม่).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
    -- pet ถึง stage 4: stat จริง — base + gear แล้ว clamp cap ตามระบบ raid เดิม
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
    -- pet ยังไม่ถึง stage 4: stat ยังเป็น 0/null ทั้งหมด -> fallback คงที่ 50 ทุกแกน
    v_snapshot := jsonb_build_object('hp', 50, 'atk', 50, 'def', 50, 'spd', 50, 'foc', 50);
  end if;

  return v_snapshot;
end;
$$;

comment on function public.compute_boss_raid_stat_snapshot(uuid) is
  'stat_snapshot ({hp,atk,def,spd,foc}) ของ pet 1 ตัว — base + gear sum + clamp cap ตาม egg_types.stat_profile->caps (stage 4); flat 50 ทุกแกน (stage < 4). ใช้ร่วมกันโดย join_boss_raid_session และ select_boss_raid_pet.';

commit;

-- ============================================================
-- Rollback: re-apply 20260903120000's compute_boss_raid_stat_snapshot (flat 30).
-- ============================================================
