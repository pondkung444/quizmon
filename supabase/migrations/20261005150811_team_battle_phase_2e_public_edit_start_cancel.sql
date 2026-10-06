-- Team Battle เฟส 2 — team_battle_phase_2e_public_edit_start_cancel
-- paired migration: version 20261005150811 (ดูหมายเหตุใน prompt: 2c ลงทะเบียน version ใหม่เพราะรันผ่าน SQL editor)
-- ฟังก์ชันใหม่ล้วน ไม่แก้ตาราง/ฟังก์ชันเดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.tb_set_player(
  p_battle_id uuid,
  p_user_id uuid,
  p_is_player boolean
)
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

  update public.pvp_team_members
  set is_player = coalesce(p_is_player, true)
  where battle_id = p_battle_id and user_id = p_user_id;

  if not found then raise exception 'member_not_found'; end if;
end;
$function$;

create or replace function public.tb_move_player(
  p_battle_id uuid,
  p_user_id uuid,
  p_team text
)
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
  if p_team not in ('a', 'b') then raise exception 'invalid_team'; end if;

  update public.pvp_team_members
  set team = p_team
  where battle_id = p_battle_id and user_id = p_user_id;

  if not found then raise exception 'member_not_found'; end if;
end;
$function$;

create or replace function public.tb_swap_players(
  p_battle_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_ta text;
  v_tb text;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'setup' then raise exception 'battle_not_in_setup'; end if;
  if p_user_a = p_user_b then raise exception 'invalid_swap'; end if;

  select team into v_ta from public.pvp_team_members
  where battle_id = p_battle_id and user_id = p_user_a;
  select team into v_tb from public.pvp_team_members
  where battle_id = p_battle_id and user_id = p_user_b;

  if v_ta is null or v_tb is null then raise exception 'member_not_found'; end if;
  if v_ta = v_tb then raise exception 'invalid_swap'; end if;

  update public.pvp_team_members
  set team = case when user_id = p_user_a then v_tb else v_ta end
  where battle_id = p_battle_id and user_id in (p_user_a, p_user_b);
end;
$function$;

create or replace function public.tb_start(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_checks jsonb;
  v_stat_a jsonb;
  v_stat_b jsonb;
  v_na int;
  v_nb int;
  v_limit int;
  r record;
begin
  v_b := public._tb_lock_battle(p_battle_id);
  if v_b.status <> 'setup' then raise exception 'battle_not_in_setup'; end if;

  -- รีเฟรช stat ของผู้เล่นล่าสุด (ไม่เพิ่ม/ตัดคน)
  for r in
    select m.user_id, cp.pet_id as room_pet_id
    from public.pvp_team_members m
    left join public.classroom_participants cp
      on cp.session_id = v_b.classroom_session_id and cp.user_id = m.user_id
    where m.battle_id = p_battle_id
  loop
    update public.pvp_team_members m
    set pet_id = public._tb_member_pet(r.user_id, r.room_pet_id),
        stat_snapshot = public._tb_member_snapshot(public._tb_member_pet(r.user_id, r.room_pet_id))
    where m.battle_id = p_battle_id and m.user_id = r.user_id;
  end loop;

  v_checks := public._tb_checks(p_battle_id);
  if not (v_checks ->> 'can_start')::boolean then
    raise exception 'cannot_start: %', v_checks ->> 'block';
  end if;

  select jsonb_build_object(
           'hp',  round(avg((stat_snapshot ->> 'hp')::numeric)),
           'atk', round(avg((stat_snapshot ->> 'atk')::numeric)),
           'def', round(avg((stat_snapshot ->> 'def')::numeric)),
           'spd', round(avg((stat_snapshot ->> 'spd')::numeric)),
           'foc', round(avg((stat_snapshot ->> 'foc')::numeric))),
         count(*)
  into v_stat_a, v_na
  from public.pvp_team_members
  where battle_id = p_battle_id and is_player and team = 'a';

  select jsonb_build_object(
           'hp',  round(avg((stat_snapshot ->> 'hp')::numeric)),
           'atk', round(avg((stat_snapshot ->> 'atk')::numeric)),
           'def', round(avg((stat_snapshot ->> 'def')::numeric)),
           'spd', round(avg((stat_snapshot ->> 'spd')::numeric)),
           'foc', round(avg((stat_snapshot ->> 'foc')::numeric))),
         count(*)
  into v_stat_b, v_nb
  from public.pvp_team_members
  where battle_id = p_battle_id and is_player and team = 'b';

  -- ลำดับผู้บัญชาการหมุนเวียน: สุ่มต่อทีม 1..n (เฉพาะผู้เล่น)
  update public.pvp_team_members m
  set commander_order = o.rn
  from (
    select user_id,
           row_number() over (partition by team order by random()) as rn
    from public.pvp_team_members
    where battle_id = p_battle_id and is_player
  ) o
  where m.battle_id = p_battle_id and m.user_id = o.user_id;

  update public.pvp_team_members
  set commander_order = null
  where battle_id = p_battle_id and not is_player;

  v_limit := (v_b.config ->> 'time_limit_minutes')::int;

  update public.pvp_team_battles
  set status = 'active',
      stat_a = v_stat_a,
      stat_b = v_stat_b,
      hp_max_a = greatest((v_stat_a ->> 'hp')::int, 1),
      hp_max_b = greatest((v_stat_b ->> 'hp')::int, 1),
      hp_a = greatest((v_stat_a ->> 'hp')::int, 1),
      hp_b = greatest((v_stat_b ->> 'hp')::int, 1),
      player_count_a = v_na,
      player_count_b = v_nb,
      started_at = now(),
      ends_at = now() + make_interval(mins => v_limit),
      last_action_at = now()
  where id = p_battle_id;
end;
$function$;

create or replace function public.tb_cancel_setup(p_battle_id uuid)
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

  update public.pvp_team_battles
  set status = 'abandoned',
      ended_at = now(),
      ended_reason = 'host_ended',
      last_action_at = now()
  where id = p_battle_id;

  update public.classroom_sessions
  set current_activity = null,
      active_team_battle_id = null
  where id = v_b.classroom_session_id
    and active_team_battle_id = p_battle_id;
end;
$function$;

revoke all on function public.tb_set_player(uuid, uuid, boolean) from public, anon;
revoke all on function public.tb_move_player(uuid, uuid, text) from public, anon;
revoke all on function public.tb_swap_players(uuid, uuid, uuid) from public, anon;
revoke all on function public.tb_start(uuid) from public, anon;
revoke all on function public.tb_cancel_setup(uuid) from public, anon;
grant execute on function public.tb_set_player(uuid, uuid, boolean) to authenticated;
grant execute on function public.tb_move_player(uuid, uuid, text) to authenticated;
grant execute on function public.tb_swap_players(uuid, uuid, uuid) to authenticated;
grant execute on function public.tb_start(uuid) to authenticated;
grant execute on function public.tb_cancel_setup(uuid) to authenticated;

commit;
