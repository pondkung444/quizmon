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
  v_caps jsonb;
  v_snapshot jsonb;
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

    if v_pet.stage = 4 then
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
      v_snapshot := jsonb_build_object('hp', 30, 'atk', 30, 'def', 30, 'spd', 30, 'foc', 30);
    end if;

    insert into public.boss_raid_participants (session_id, user_id, pet_id, stat_snapshot)
    values (v_session.id, v_user_id, v_pet.id, v_snapshot)
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