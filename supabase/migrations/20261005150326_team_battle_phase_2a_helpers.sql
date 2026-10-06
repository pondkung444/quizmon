-- Team Battle เฟส 2 — team_battle_phase_2a_helpers
-- paired migration: version 20261005150326 (ดูหมายเหตุใน prompt: 2c ลงทะเบียน version ใหม่เพราะรันผ่าน SQL editor)
-- ฟังก์ชันใหม่ล้วน ไม่แก้ตาราง/ฟังก์ชันเดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public._tb_normalize_config(p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_band     text  := p_config ->> 'grade_band';
  v_subject  text  := p_config ->> 'subject';
  v_branch   text  := nullif(p_config ->> 'branch', '');
  v_chapters jsonb := coalesce(p_config -> 'chapters', '[]'::jsonb);
  v_pick     int   := coalesce((p_config ->> 'pick_seconds')::int, 15);
  v_ans      int   := coalesce((p_config ->> 'answer_seconds')::int, 30);
  v_limit    int   := coalesce((p_config ->> 'time_limit_minutes')::int, 15);
  v_rewards  boolean := coalesce((p_config ->> 'rewards_enabled')::boolean, true);
  v_eggs     boolean := coalesce((p_config ->> 'eggs_enabled')::boolean, true);
begin
  if v_band is null or v_band not in ('primary', 'junior', 'senior') then
    raise exception 'invalid_config_grade_band';
  end if;
  if v_subject is null or length(trim(v_subject)) = 0 then
    raise exception 'invalid_config_subject';
  end if;
  if jsonb_typeof(v_chapters) <> 'array'
     or jsonb_array_length(v_chapters) = 0
     or jsonb_array_length(v_chapters) > 30 then
    raise exception 'invalid_config_chapters';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_chapters) e where jsonb_typeof(e) <> 'string'
  ) then
    raise exception 'invalid_config_chapters';
  end if;
  if v_pick not between 5 and 60 then raise exception 'invalid_config_pick_seconds'; end if;
  if v_ans not between 10 and 120 then raise exception 'invalid_config_answer_seconds'; end if;
  if v_limit not between 3 and 90 then raise exception 'invalid_config_time_limit'; end if;

  return jsonb_build_object(
    'grade_band',         v_band,
    'subject',            trim(v_subject),
    'branch',             v_branch,
    'chapters',           v_chapters,
    'pick_seconds',       v_pick,
    'answer_seconds',     v_ans,
    'time_limit_minutes', v_limit,
    'rewards_enabled',    v_rewards,
    'eggs_enabled',       v_eggs
  );
end;
$function$;

create or replace function public._tb_question_count(p_config jsonb)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*)::int
  from public.questions q
  where q.status = 'active'
    and q.subject = p_config ->> 'subject'
    and q.branch is not distinct from nullif(p_config ->> 'branch', '')
    and q.grade_band = p_config ->> 'grade_band'
    and q.chapter in (select jsonb_array_elements_text(p_config -> 'chapters'));
$function$;

create or replace function public._tb_question_level(p_count integer)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case when p_count >= 50 then 'ok'
              when p_count >= 15 then 'warn'
              else 'block' end;
$function$;

create or replace function public._tb_member_pet(p_user_id uuid, p_room_pet_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select p.id from public.pets p where p.id = p_room_pet_id and p.user_id = p_user_id),
    (select p.id from public.pets p where p.user_id = p_user_id and p.is_active limit 1)
  );
$function$;

create or replace function public._tb_member_snapshot(p_pet_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if p_pet_id is null then
    return jsonb_build_object('hp', 50, 'atk', 50, 'def', 50, 'spd', 50, 'foc', 50);
  end if;
  return public.compute_boss_raid_stat_snapshot(p_pet_id);
end;
$function$;

create or replace function public._tb_power(p_snapshot jsonb)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(sum(e.value::numeric), 0)
  from jsonb_each_text(p_snapshot) e
  where e.key in ('hp', 'atk', 'def', 'spd', 'foc');
$function$;

revoke all on function public._tb_normalize_config(jsonb) from public, anon, authenticated;
revoke all on function public._tb_question_count(jsonb) from public, anon, authenticated;
revoke all on function public._tb_question_level(integer) from public, anon, authenticated;
revoke all on function public._tb_member_pet(uuid, uuid) from public, anon, authenticated;
revoke all on function public._tb_member_snapshot(uuid) from public, anon, authenticated;
revoke all on function public._tb_power(jsonb) from public, anon, authenticated;

commit;
