-- แก้ return columns ของ claim_weekly_leaderboard_reward() ให้คืน name_th/sprite_prefix ของไข่มาด้วย
-- (แทนที่จะคืนแค่ id เฉยๆ) กันฝั่ง client ต้อง query egg_types ซ้ำอีกรอบเพื่อโชว์ป๊อปอัพฉลอง
-- ต้อง drop ก่อนเพราะเปลี่ยนจำนวน/ชนิดคอลัมน์ผลลัพธ์ — create or replace อย่างเดียวทำไม่ได้เมื่อ
-- return type เปลี่ยน ยังไม่มี caller จริงใช้ signature เดิม (เพิ่งสร้างในไฟล์ก่อนหน้านี้เอง) จึง drop
-- ได้อย่างปลอดภัย
drop function if exists public.claim_weekly_leaderboard_reward();

create or replace function public.claim_weekly_leaderboard_reward()
returns table (awarded boolean, egg_type_id text, egg_name_th text, egg_sprite_prefix text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_last_week_start date;
  v_grade_band text;
  v_won boolean;
  v_egg_type_id text := 'egg_legendary_01';
  v_new_egg_id uuid;
begin
  if v_user_id is null then
    raise exception 'ต้องล็อกอินก่อน';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = v_user_id;
  if v_grade_band is null then
    return query select false, null::text, null::text, null::text;
    return;
  end if;

  select wb.week_start_date - 7 into v_last_week_start
  from public.current_week_bounds_bkk() wb;

  if exists (
    select 1 from public.weekly_leaderboard_rewards r
    where r.user_id = v_user_id and r.week_start_date = v_last_week_start
  ) then
    return query select false, null::text, null::text, null::text;
    return;
  end if;

  select exists (
    select 1 from (
      select s.user_id, (rank() over (order by s.total_points desc, s.accuracy desc))::integer as rnk
      from public.weekly_scores_bkk_for_week(v_last_week_start, v_grade_band) s
    ) ranked
    where ranked.user_id = v_user_id and ranked.rnk = 1
  ) into v_won;

  if not v_won then
    return query select false, null::text, null::text, null::text;
    return;
  end if;

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (v_user_id, v_egg_type_id, 'weekly_leaderboard_reward')
  returning id into v_new_egg_id;

  insert into public.weekly_leaderboard_rewards (user_id, week_start_date, grade_band, egg_type_id, player_egg_id)
  values (v_user_id, v_last_week_start, v_grade_band, v_egg_type_id, v_new_egg_id);

  return query
    select true, e.id, e.name_th, e.sprite_prefix
    from public.egg_types e
    where e.id = v_egg_type_id;
end;
$$;

grant execute on function public.claim_weekly_leaderboard_reward() to authenticated;
