-- Team Battle เฟส 2 — team_battle_phase_2c_sync_roster
-- paired migration: version 20261005151000 (ดูหมายเหตุใน prompt: 2c ลงทะเบียน version ใหม่เพราะรันผ่าน SQL editor)
-- ฟังก์ชันใหม่ล้วน ไม่แก้ตาราง/ฟังก์ชันเดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public._tb_sync_roster(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room_id uuid;
  r record;
  v_pet uuid;
  v_na int;
  v_nb int;
begin
  select classroom_session_id into v_room_id
  from public.pvp_team_battles where id = p_battle_id;

  delete from public.pvp_team_members m
  where m.battle_id = p_battle_id
    and not exists (
      select 1 from public.classroom_participants cp
      where cp.session_id = v_room_id and cp.user_id = m.user_id
    );

  for r in
    select cp.user_id, cp.pet_id
    from public.classroom_participants cp
    where cp.session_id = v_room_id
    order by cp.joined_at
  loop
    v_pet := public._tb_member_pet(r.user_id, r.pet_id);

    if exists (
      select 1 from public.pvp_team_members
      where battle_id = p_battle_id and user_id = r.user_id
    ) then
      update public.pvp_team_members
      set pet_id = v_pet,
          stat_snapshot = public._tb_member_snapshot(v_pet)
      where battle_id = p_battle_id and user_id = r.user_id;
    else
      select count(*) filter (where team = 'a' and is_player),
             count(*) filter (where team = 'b' and is_player)
      into v_na, v_nb
      from public.pvp_team_members where battle_id = p_battle_id;

      insert into public.pvp_team_members
        (battle_id, user_id, team, pet_id, stat_snapshot, is_player)
      values
        (p_battle_id, r.user_id,
         case when v_nb < v_na then 'b' else 'a' end,
         v_pet, public._tb_member_snapshot(v_pet), true);
    end if;
  end loop;
end;
$function$;

revoke all on function public._tb_sync_roster(uuid) from public, anon, authenticated;

commit;
