-- Team Battle เฟส 2 — team_battle_phase_2b_internal_checks
-- paired migration: version 20261005150356 (ดูหมายเหตุใน prompt: 2c ลงทะเบียน version ใหม่เพราะรันผ่าน SQL editor)
-- ฟังก์ชันใหม่ล้วน ไม่แก้ตาราง/ฟังก์ชันเดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public._tb_lock_battle(p_battle_id uuid)
returns public.pvp_team_battles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
begin
  select * into v_b
  from public.pvp_team_battles
  where id = p_battle_id and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
  return v_b;
end;
$function$;

create or replace function public._tb_rebalance(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  with ranked as (
    select m.user_id,
           row_number() over (
             order by public._tb_power(m.stat_snapshot) desc, random()
           ) - 1 as rn
    from public.pvp_team_members m
    where m.battle_id = p_battle_id and m.is_player
  )
  update public.pvp_team_members m
  set team = case when (ranked.rn % 4) in (0, 3) then 'a' else 'b' end
  from ranked
  where m.battle_id = p_battle_id and m.user_id = ranked.user_id;
end;
$function$;

create or replace function public._tb_checks(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_b public.pvp_team_battles;
  v_na int;
  v_nb int;
  v_cnt int;
  v_level text;
  v_mixed boolean;
  v_block text[] := '{}';
  v_warn  text[] := '{}';
begin
  select * into v_b from public.pvp_team_battles where id = p_battle_id;

  select count(*) filter (where team = 'a'),
         count(*) filter (where team = 'b')
  into v_na, v_nb
  from public.pvp_team_members
  where battle_id = p_battle_id and is_player;

  if v_na < 2 or v_nb < 2 then v_block := array_append(v_block, 'team_too_small'); end if;
  if abs(v_na - v_nb) > 1 then v_warn := array_append(v_warn, 'team_size_diff'); end if;

  select exists (
    select 1
    from public.pvp_team_members m
    left join public.profiles pr on pr.id = m.user_id
    where m.battle_id = p_battle_id and m.is_player
      and case when v_b.config ->> 'grade_band' = 'primary'
               then pr.grade_band is distinct from 'primary'
               else pr.grade_band = 'primary' end
  ) into v_mixed;
  if v_mixed then v_block := array_append(v_block, 'mixed_band'); end if;

  v_cnt := public._tb_question_count(v_b.config);
  v_level := public._tb_question_level(v_cnt);
  if v_level = 'block' then v_block := array_append(v_block, 'questions_block');
  elsif v_level = 'warn' then v_warn := array_append(v_warn, 'questions_low');
  end if;

  return jsonb_build_object(
    'block', to_jsonb(v_block),
    'warn', to_jsonb(v_warn),
    'players_a', v_na,
    'players_b', v_nb,
    'question_count', v_cnt,
    'can_start', coalesce(array_length(v_block, 1), 0) = 0
  );
end;
$function$;

revoke all on function public._tb_lock_battle(uuid) from public, anon, authenticated;
revoke all on function public._tb_rebalance(uuid) from public, anon, authenticated;
revoke all on function public._tb_checks(uuid) from public, anon, authenticated;

commit;
