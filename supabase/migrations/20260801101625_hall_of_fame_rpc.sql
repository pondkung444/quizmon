-- Hall of Fame: RPC อ่านอย่างเดียว loop สัปดาห์ที่จบแล้วย้อนหลัง หา rank=1 ทั้ง junior/senior ต่อสัปดาห์
-- ใช้ weekly_scores_bkk_for_week() ตัวเดียวกับระบบแจกรางวัล (ไม่สร้างฟังก์ชันคำนวณคะแนนย้อนหลังอันที่สอง)
-- "ใครชนะ" มาจากการคำนวณสด ส่วน weekly_leaderboard_rewards ใช้แค่ join ดึง badge เคลม/ยังไม่เคลม
-- ไม่ใช่ตัวตัดสินว่าใครคือแชมป์ (แชมป์ที่ไม่เคลมไข่ก็ยังต้องโชว์)
-- ข้าม 2 account แอดมิน (Dawu, PonDKunG) ได้ฟรีเพราะ weekly_scores_bkk_for_week() exclude ไว้อยู่แล้ว
-- ไม่ query ย้อนก่อนสัปดาห์ที่ weekly_leaderboard_grade_band ใช้งานจริง (2026-07-27 เป็นวันจันทร์พอดี
-- ตรงกับ week_start_date คอนเวนชันเดิมอยู่แล้ว ไม่ต้องปัดเข้าจันทร์เพิ่ม)
-- pagination: offset/limit นับเฉพาะ "สัปดาห์ที่มีคนเล่นจริง" (ข้ามสัปดาห์ว่างไม่นับ ไม่โชว์การ์ดว่าง)
create or replace function public.get_hall_of_fame_page(p_weeks_offset integer default 0, p_weeks_limit integer default 10)
returns table (
  week_start_date date, grade_band text, user_id uuid, username text,
  total_points integer, accuracy numeric, claimed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_last_week_start date;
  v_cutoff date := '2026-07-27';
  v_week date;
  v_weeks_emitted integer := 0;
  v_weeks_skipped integer := 0;
  v_found boolean;
begin
  select wb.week_start_date - 7 into v_last_week_start from public.current_week_bounds_bkk() wb;
  v_week := v_last_week_start;

  while v_week >= v_cutoff and v_weeks_emitted < p_weeks_limit loop
    v_found := exists (select 1 from public.weekly_scores_bkk_for_week(v_week, null) limit 1);

    if v_found then
      if v_weeks_skipped < p_weeks_offset then
        v_weeks_skipped := v_weeks_skipped + 1;
      else
        return query
          select v_week, band.b, ranked.user_id, ranked.username, ranked.total_points, ranked.accuracy,
            exists (
              select 1 from public.weekly_leaderboard_rewards r
              where r.user_id = ranked.user_id and r.week_start_date = v_week
            )
          from (values ('junior'), ('senior')) as band(b)
          cross join lateral (
            select s.user_id, s.username, s.total_points, s.accuracy,
              (rank() over (order by s.total_points desc, s.accuracy desc))::integer as rnk
            from public.weekly_scores_bkk_for_week(v_week, band.b) s
          ) ranked
          where ranked.rnk = 1;
        v_weeks_emitted := v_weeks_emitted + 1;
      end if;
    end if;

    v_week := v_week - 7;
  end loop;
end;
$$;

grant execute on function public.get_hall_of_fame_page(integer, integer) to authenticated;
