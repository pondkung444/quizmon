-- ============================================================
-- 1) _ranking_candidates — user_id pool ต่อ scope
--    all: profiles ทั้งหมด ลบ test_accounts (เหมือน weekly_scores_bkk)
--    friends: friend_ids(me) + me เสมอ ("รวมผู้เล่นเองในการจัดอันดับ") — ไม่ exclude test_accounts
--    เพราะ scope นี้เป็น whitelist ของเพื่อนที่เลือกเองอยู่แล้ว ไม่ใช่ pool สาธารณะ
-- ============================================================
create or replace function public._ranking_candidates(p_me uuid, p_scope text)
returns table(cand_user_id uuid)
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if p_scope = 'all' then
    return query
    select pr.id from public.profiles pr
    where pr.id not in (select ta.user_id from public.test_accounts ta);
  else
    return query
    select p_me
    union
    select fi from public.friend_ids(p_me) fi;
  end if;
end;
$$;

-- ============================================================
-- 2) _ranking_pride_pet_id — Qmon ที่ภูมิใจ (pride_pet_id ?? active pet) pattern เดียวกับทุก RPC
--    โปรไฟล์อื่นในระบบนี้ (search_friend_code, get_public_profile, get_friend_profile ฯลฯ)
-- ============================================================
create or replace function public._ranking_pride_pet_id(p_target uuid)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    (select pride_pet_id from public.profile_settings where user_id = p_target),
    (select id from public.pets where user_id = p_target and is_active = true limit 1)
  )
$$;

-- ============================================================
-- 3) _ranking_full — คำนวณ (cand_id, score, rnk) เต็มทุกคนใน candidates ก่อน join โปรไฟล์/limit
--    ผู้ที่ยังไม่มีผลงานเลยในหมวดนั้นได้ score/rnk เป็น null (ไม่ถูกตัดทิ้งตอน scope=friends —
--    ให้ frontend โชว์ "—" ท้ายรายการ ตาม §9.8) ใช้ร่วมกันทั้ง get_ranking และ get_my_rank
--    ห้ามคิดนิยามเรียง/tie-break ใหม่ — ทุกหมวด reuse ตามที่ระบุในสเปกเป๊ะ:
--      weekly_training: reuse weekly_scores_bkk(null) ตรงๆ (exclude test_accounts มาจากในนั้นเองแล้ว)
--      consistency: นิยาม "completed day" เดียวกับ _eval_consistency (count(qa.id) >= dm.target_count)
--        + streak ปัจจุบัน (กลุ่มวันต่อเนื่องที่จบด้วย mission_date ล่าสุด) + เวลาทำภารกิจล่าสุด
--      achievement: sum(tier point: Bronze=1/Silver=2/Gold=3/Crown=5) exclude legacy_pioneer_tester
--        เสมอ + จำนวน Crown + จำนวน Gold + เวลาได้เหรียญล่าสุด (running total เพิ่มขึ้นเสมอเพราะ
--        pts>0 ทุกแถว จึงเท่ากับเวลาเหรียญสุดท้ายพอดี ไม่ต้องคำนวณ running sum แยก)
--      collector: นิยามเดียวกับ _eval_collection (egg_type_id + subline normalized + personality,
--        นับจาก pets stage=4 ทั้งหมดไม่กรอง is_active) + จำนวน Qmon stage4 ทั้งหมด + เวลาค้นพบ
--        รูปแบบล่าสุด (max ของ first_evolved_at ต่อรูปแบบ)
-- ============================================================
-- row_number() ต้องคำนวณเฉพาะในกลุ่ม "scored" (ไม่มี null ปนแน่นอน) แล้วค่อย left join กลับเข้า
-- full candidate set แทนที่จะห่อด้วย CASE WHEN บน window function ที่รันบน full_set ตรงๆ — เหตุผล:
-- "ORDER BY x DESC" ของ Postgres ค่า default คือ NULLS FIRST (ตรงข้าม ASC ที่ NULLS LAST) ถ้า
-- row_number() over (order by score desc, ...) รันบน full_set ที่มีทั้งคนมีคะแนน/ไม่มีคะแนนปนกัน
-- แถวที่ score เป็น null จะถูกเรียงไปอยู่ก่อนแล้วกิน row_number 1..M ไปก่อนคนที่มีคะแนนจริง (พังแบบ
-- อันดับ 1 จริงกลายเป็นอันดับ 83) — คำนวณแยกใน CTE ที่ไม่มี null เท่านั้นเพื่อกันปัญหานี้เด็ดขาด
create or replace function public._ranking_full(p_category text, p_me uuid, p_scope text)
returns table(cand_id uuid, score int, rnk int)
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if p_category = 'weekly_training' then
    return query
    with candidates as (select cand_user_id from public._ranking_candidates(p_me, p_scope)),
    scored as (
      select ws.user_id as cid, ws.total_points as sc
      from public.weekly_scores_bkk(null) ws
      where ws.user_id in (select cand_user_id from candidates)
    ),
    scored_ranked as (
      select cid, sc, row_number() over (order by sc desc, cid)::int as rnk
      from scored
    ),
    full_set as (
      select c.cand_user_id as cid, sr.sc, sr.rnk
      from candidates c left join scored_ranked sr on sr.cid = c.cand_user_id
    )
    select fs.cid, fs.sc, fs.rnk from full_set fs;

  elsif p_category = 'consistency' then
    return query
    with candidates as (select cand_user_id from public._ranking_candidates(p_me, p_scope)),
    completed_days as (
      select dm.user_id as cid, dm.mission_date, max(qa.created_at) as finished_at
      from public.daily_missions dm
      join public.quiz_attempts qa on qa.mission_id = dm.id
      where dm.user_id in (select cand_user_id from candidates)
        and dm.mission_date >= ((now() at time zone 'Asia/Bangkok')::date - 30)
      group by dm.user_id, dm.mission_date, dm.target_count
      having count(qa.id) >= dm.target_count
    ),
    day_counts as (
      select cid, count(*)::int as sc, max(finished_at) as latest_finished_at
      from completed_days group by cid
    ),
    streak_groups as (
      select cid, mission_date, finished_at,
        mission_date - (row_number() over (partition by cid order by mission_date))::int as grp
      from completed_days
    ),
    streak_lengths as (
      select cid, mission_date, finished_at, grp,
        row_number() over (partition by cid, grp order by mission_date) as streak_len
      from streak_groups
    ),
    latest_per_user as (
      select cid, max(mission_date) as max_date from completed_days group by cid
    ),
    current_streak as (
      select sl.cid, sl.streak_len as current_streak_len
      from streak_lengths sl
      join latest_per_user lp on lp.cid = sl.cid and lp.max_date = sl.mission_date
    ),
    scored as (
      select dc.cid, dc.sc, coalesce(cs.current_streak_len, 0) as streak, dc.latest_finished_at
      from day_counts dc left join current_streak cs on cs.cid = dc.cid
    ),
    scored_ranked as (
      select cid, sc, streak, latest_finished_at,
        row_number() over (order by sc desc, streak desc, latest_finished_at desc)::int as rnk
      from scored
    ),
    full_set as (
      select c.cand_user_id as cid, sr.sc, sr.rnk
      from candidates c left join scored_ranked sr on sr.cid = c.cand_user_id
    )
    select fs.cid, fs.sc, fs.rnk from full_set fs;

  elsif p_category = 'achievement' then
    return query
    with candidates as (select cand_user_id from public._ranking_candidates(p_me, p_scope)),
    tier_points as (
      select ua.user_id as cid, ad.tier, ua.earned_at,
        case ad.tier when 'Bronze' then 1 when 'Silver' then 2 when 'Gold' then 3 when 'Crown' then 5 else 0 end as pts
      from public.user_achievements ua
      join public.achievement_definitions ad on ad.id = ua.achievement_id
      where ua.user_id in (select cand_user_id from candidates)
        and ua.achievement_id <> 'legacy_pioneer_tester'
    ),
    agg as (
      select cid, sum(pts)::int as sc,
        count(*) filter (where tier = 'Crown')::int as crown_count,
        count(*) filter (where tier = 'Gold')::int as gold_count,
        max(earned_at) as latest_earned_at
      from tier_points group by cid
    ),
    scored_ranked as (
      select cid, sc, crown_count, gold_count, latest_earned_at,
        row_number() over (order by sc desc, crown_count desc, gold_count desc, latest_earned_at asc)::int as rnk
      from agg
    ),
    full_set as (
      select c.cand_user_id as cid, sr.sc, sr.rnk
      from candidates c left join scored_ranked sr on sr.cid = c.cand_user_id
    )
    select fs.cid, fs.sc, fs.rnk from full_set fs;

  elsif p_category = 'collector' then
    return query
    with candidates as (select cand_user_id from public._ranking_candidates(p_me, p_scope)),
    normalized_patterns as (
      select p.user_id as cid, p.evolved_at,
        p.egg_type_id || '|' ||
        case p.subline
          when 'physics' then 'math'
          when 'chemistry' then 'balanced'
          when 'biology' then 'science'
          else p.subline
        end || '|' || p.personality as pattern_key
      from public.pets p
      where p.user_id in (select cand_user_id from candidates) and p.stage = 4
    ),
    pattern_first_seen as (
      select cid, pattern_key, min(evolved_at) as first_evolved_at
      from normalized_patterns group by cid, pattern_key
    ),
    agg as (
      select cid, count(*)::int as sc, max(first_evolved_at) as latest_pattern_at
      from pattern_first_seen group by cid
    ),
    stage4_counts as (
      select user_id as cid, count(*)::int as stage4_total
      from public.pets
      where user_id in (select cand_user_id from candidates) and stage = 4
      group by user_id
    ),
    scored as (
      select a.cid, a.sc, coalesce(s4.stage4_total,0) as stage4_total, a.latest_pattern_at
      from agg a
      left join stage4_counts s4 on s4.cid = a.cid
    ),
    scored_ranked as (
      select cid, sc, stage4_total, latest_pattern_at,
        row_number() over (order by sc desc, stage4_total desc, latest_pattern_at asc)::int as rnk
      from scored
    ),
    full_set as (
      select c.cand_user_id as cid, sr.sc, sr.rnk
      from candidates c left join scored_ranked sr on sr.cid = c.cand_user_id
    )
    select fs.cid, fs.sc, fs.rnk from full_set fs;

  else
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
end;
$$;

-- ============================================================
-- 4) get_ranking — S01 รายการอันดับ (all: top 50, friends: ไม่จำกัด รวมคนยังไม่มีผลงานท้ายรายการ)
-- ============================================================
create or replace function public.get_ranking(p_category text, p_scope text)
returns table(
  rank int,
  user_id uuid,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  score_value int,
  is_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if p_category not in ('weekly_training','consistency','achievement','collector') then
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
  if p_scope not in ('all','friends') then raise exception 'ขอบเขตไม่ถูกต้อง'; end if;

  return query
  with full_rank as (
    select * from public._ranking_full(p_category, v_me, p_scope)
  )
  select
    fr.rnk, fr.cand_id, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fr.score, fr.cand_id = v_me
  from full_rank fr
  join public.profiles pr on pr.id = fr.cand_id
  left join public.pets pt on pt.id = public._ranking_pride_pet_id(fr.cand_id)
  left join public.egg_types et on et.id = pt.egg_type_id
  where p_scope = 'friends' or fr.score is not null
  order by (fr.score is null) asc, fr.rnk asc nulls last, pr.username asc
  limit case when p_scope = 'all' then 50 else null end;
end;
$$;

grant execute on function public.get_ranking(text, text) to authenticated;

-- ============================================================
-- 5) get_my_rank — ใช้ตอน scope='all' และไม่ติด Top 50 คืนแค่แถวของฉันเอง (ไม่ query คนรอบข้าง)
--    found=false = ยังไม่มีผลงานเลยในหมวดนั้น หรือไม่ได้อยู่ใน candidates เลย (เช่น test account
--    เรียก scope='all' ซึ่งไม่รวม test_accounts) — ทั้งสองเคสคือ "ยังไม่ติดอันดับ" ไม่ใช่ error
--    ต้อง join จาก profiles ของตัวเองเป็นหลักเสมอ (การันตีมี 1 แถว) แล้ว left join full_rank เข้ามา
--    แทนการ filter จาก full_rank ตรงๆ (ถ้าไม่อยู่ใน candidates เลยจะได้ 0 แถวกลับไป ทำให้ .single()
--    ฝั่ง client พัง)
-- ============================================================
create or replace function public.get_my_rank(p_category text, p_scope text)
returns table(
  found boolean,
  rank int,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  score_value int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if p_category not in ('weekly_training','consistency','achievement','collector') then
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
  if p_scope not in ('all','friends') then raise exception 'ขอบเขตไม่ถูกต้อง'; end if;

  return query
  with full_rank as (
    select * from public._ranking_full(p_category, v_me, p_scope)
  )
  select
    (fr.score is not null),
    fr.rnk,
    pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fr.score
  from public.profiles pr
  left join full_rank fr on fr.cand_id = v_me
  left join public.pets pt on pt.id = public._ranking_pride_pet_id(v_me)
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = v_me;
end;
$$;

grant execute on function public.get_my_rank(text, text) to authenticated;
