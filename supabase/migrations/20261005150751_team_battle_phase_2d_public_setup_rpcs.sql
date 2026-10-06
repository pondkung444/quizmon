-- Team Battle เฟส 2 — team_battle_phase_2d_public_setup_rpcs
-- paired migration: version 20261005150751 (ดูหมายเหตุใน prompt: 2c ลงทะเบียน version ใหม่เพราะรันผ่าน SQL editor)
-- ฟังก์ชันใหม่ล้วน ไม่แก้ตาราง/ฟังก์ชันเดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_team_battle_question_count(
  p_session_id uuid,
  p_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_cfg jsonb;
  v_cnt int;
begin
  if not exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid() and status <> 'ended'
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  v_cfg := public._tb_normalize_config(p_config);
  v_cnt := public._tb_question_count(v_cfg);
  return jsonb_build_object('count', v_cnt, 'level', public._tb_question_level(v_cnt));
end;
$function$;

create or replace function public.create_team_battle(
  p_session_id uuid,
  p_config jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room public.classroom_sessions;
  v_cfg  jsonb;
  v_cnt  int;
  v_id   uuid;
begin
  select * into v_room
  from public.classroom_sessions
  where id = p_session_id and teacher_id = auth.uid() and status <> 'ended'
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  if v_room.current_activity is not null
     and public.classroom_activity_is_busy(v_room) then
    raise exception 'classroom_activity_busy';
  end if;

  v_cfg := public._tb_normalize_config(p_config);
  v_cnt := public._tb_question_count(v_cfg);
  if public._tb_question_level(v_cnt) = 'block' then
    raise exception 'not_enough_questions';
  end if;

  insert into public.pvp_team_battles (classroom_session_id, teacher_id, config)
  values (p_session_id, auth.uid(), v_cfg)
  returning id into v_id;

  update public.classroom_sessions
  set current_activity = 'team_battle',
      active_team_battle_id = v_id
  where id = p_session_id;

  perform public._tb_sync_roster(v_id);
  perform public._tb_rebalance(v_id);

  return v_id;
end;
$function$;

create or replace function public.get_team_battle_setup(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_members jsonb;
begin
  select * into v_b
  from public.pvp_team_battles
  where id = p_battle_id and teacher_id = auth.uid();
  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.team, x.is_player desc, x.power desc), '[]'::jsonb)
  into v_members
  from (
    select m.user_id,
           pr.username,
           cp.display_name,
           cp.student_number,
           pr.grade_band as profile_grade_band,
           m.team,
           m.is_player,
           m.stat_snapshot as stat,
           public._tb_power(m.stat_snapshot) as power,
           pet.nickname as pet_nickname,
           pet.stage as pet_stage,
           et.sprite_prefix as pet_sprite_prefix
    from public.pvp_team_members m
    left join public.profiles pr on pr.id = m.user_id
    left join public.classroom_participants cp
      on cp.session_id = v_b.classroom_session_id and cp.user_id = m.user_id
    left join public.pets pet on pet.id = m.pet_id
    left join public.egg_types et on et.id = pet.egg_type_id
    where m.battle_id = p_battle_id
  ) x;

  return jsonb_build_object(
    'battle', jsonb_build_object(
      'id', v_b.id,
      'status', v_b.status,
      'config', v_b.config,
      'started_at', v_b.started_at,
      'ends_at', v_b.ends_at
    ),
    'checks', public._tb_checks(p_battle_id),
    'members', v_members
  );
end;
$function$;

create or replace function public.tb_sync_roster(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'setup' then raise exception 'battle_not_in_setup'; end if;
  perform public._tb_sync_roster(p_battle_id);
end;
$function$;

create or replace function public.tb_auto_split(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'setup' then raise exception 'battle_not_in_setup'; end if;
  perform public._tb_sync_roster(p_battle_id);
  perform public._tb_rebalance(p_battle_id);
end;
$function$;

revoke all on function public.get_team_battle_question_count(uuid, jsonb) from public, anon;
revoke all on function public.create_team_battle(uuid, jsonb) from public, anon;
revoke all on function public.get_team_battle_setup(uuid) from public, anon;
revoke all on function public.tb_sync_roster(uuid) from public, anon;
revoke all on function public.tb_auto_split(uuid) from public, anon;
grant execute on function public.get_team_battle_question_count(uuid, jsonb) to authenticated;
grant execute on function public.create_team_battle(uuid, jsonb) to authenticated;
grant execute on function public.get_team_battle_setup(uuid) to authenticated;
grant execute on function public.tb_sync_roster(uuid) to authenticated;
grant execute on function public.tb_auto_split(uuid) to authenticated;

commit;
