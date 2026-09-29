-- Guardian Phase 5: หน้าเจนสรุปรายสัปดาห์ของครู (/teacher/guardian)
-- Spec: guardian design §3.3 (A7) · plan §2 เฟส 5 + §6.2
-- ตัดสินใจแล้ว: ส่ง Gemini เฉพาะสถิติรวม (ไม่มีชื่อ — ใช้ placeholder {ชื่อน้อง}) · เก็บข้อความที่เจน/แก้ไว้ใน DB ·
--               "เล่นน้อยลง" = คะแนนสัปดาห์นี้ < 50% ของค่าเฉลี่ยสัปดาห์ที่เล่น (ล่าสุดไม่เกิน 3 สัปดาห์, ต้องมี ≥ 2 สัปดาห์)

-- 1) allowlist ครู (แยกจาก guardian_admin ซึ่งผู้ปกครองทุกครอบครัวอยู่ในนั้น) ---------
create table public.guardian_digest_admin (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);
alter table public.guardian_digest_admin enable row level security;
revoke all on public.guardian_digest_admin from public, anon, authenticated;
grant select on public.guardian_digest_admin to service_role;

insert into public.guardian_digest_admin (user_id, note)
values ('792b8e1d-410c-4158-9c62-32b437b05121', 'ครูปอนด์ (เจ้าของระบบ)');

create or replace function public.is_guardian_digest_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.guardian_digest_admin where user_id = p_user_id);
$$;
-- ใช้ภายใน RPC เท่านั้น (ไม่ให้ client ไล่ถามว่า uid ไหนเป็นแอดมิน)
revoke all on function public.is_guardian_digest_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_guardian_digest_admin(uuid) to service_role;

-- 2) ข้อความสรุปที่เจน/แก้แล้ว (1 แถว/เด็ก/สัปดาห์; ไม่มีสถานะ "ส่งแล้ว" ตามสเปก) ------
create table public.guardian_digest (
  student_id   uuid not null references public.profiles(id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  body         text not null check (char_length(body) between 1 and 4000),
  context      text check (char_length(context) <= 500),
  is_edited    boolean not null default false,
  generated_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (student_id, week_start)
);
alter table public.guardian_digest enable row level security;
revoke all on public.guardian_digest from public, anon, authenticated;
grant select, insert, update, delete on public.guardian_digest to service_role;

-- 3) สถิติรายสัปดาห์ของเด็กทุกคนที่มีผู้พิทักษ์ผูกอยู่ + ข้อความที่บันทึกไว้ ---------------
-- คืน jsonb array: [{student_id, username, stats:{...}, saved:{body,context,is_edited,updated_at}|null}]
-- username ใช้แสดง/แทน {ชื่อน้อง} ฝั่ง server เท่านั้น — ห้ามส่งเข้า prompt (ส่งเฉพาะ stats)
create or replace function public.guardian_admin_weekly_digest(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  c_cutoff constant date := date '2026-07-27';        -- F2: ก่อนวันนี้กติกาคะแนนต่างกัน ไม่เอามาเทียบ
  v_this_monday date := (select b.week_start_date from public.current_week_bounds_bkk() b);
  v_out jsonb := '[]'::jsonb;
  r record;
  v_window_start date;
  v_points integer;
  v_days integer;
  v_goal public.guardian_goal;
  v_goal_json jsonb;
  v_reached boolean;
  v_next_goal boolean;
  v_ever_played boolean;
  v_silent_prior integer;
  v_wk date;
  v_wk_points integer;
  v_prev_points integer;
  v_played_prior integer[];
  v_avg numeric;
  v_situation text;
  v_plan public.guardian_plan;
  v_plan_json jsonb;
  v_passed jsonb;
  v_stuck jsonb;
  v_saved jsonb;
  k integer;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_digest_admin(v_uid) then
    raise exception 'ไม่มีสิทธิ์ใช้ฟีเจอร์นี้';
  end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'สัปดาห์ต้องขึ้นต้นวันจันทร์';
  end if;
  if p_week_start < c_cutoff or p_week_start > v_this_monday then
    raise exception 'ช่วงสัปดาห์ไม่ถูกต้อง';
  end if;

  for r in
    select distinct on (gl.student_id)
           gl.student_id, p.username,
           ((gl.claimed_at at time zone 'Asia/Bangkok')::date) as linked_date
    from public.guardian_links gl
    join public.profiles p on p.id = gl.student_id
    where gl.status = 'claimed'
    order by gl.student_id, gl.claimed_at desc nulls last
  loop
    -- สัปดาห์ที่จบก่อนวันที่ผูกลิงก์ → ยังไม่มีผู้พิทักษ์ ไม่ต้องมีสรุป
    continue when p_week_start + 6 < r.linked_date;

    -- หน้าต่างสัปดาห์ก่อนหน้าที่เอามาเทียบ: ไม่ก่อน cutoff และไม่ก่อนสัปดาห์ที่ผูกลิงก์
    v_window_start := greatest(c_cutoff, date_trunc('week', r.linked_date)::date);

    select coalesce(sum(d.day_points), 0)::int,
           count(*) filter (where d.day_points > 0)::int
      into v_points, v_days
    from public.guardian_daily_points_bkk(r.student_id, p_week_start) d;

    -- สัปดาห์ที่ไม่เล่นติดกันก่อนหน้านี้ (นับย้อนไม่เกิน 8 สัปดาห์ ภายในหน้าต่าง)
    v_silent_prior := 0;
    v_prev_points := null;
    v_played_prior := '{}';
    for k in 1..8 loop
      v_wk := p_week_start - 7 * k;
      exit when v_wk < v_window_start;
      select coalesce(sum(d.day_points), 0)::int into v_wk_points
      from public.guardian_daily_points_bkk(r.student_id, v_wk) d;
      if k = 1 then v_prev_points := v_wk_points; end if;
      if k <= 3 and v_wk_points > 0 then
        v_played_prior := v_played_prior || v_wk_points;
      end if;
    end loop;
    -- นับสัปดาห์เงียบต่อเนื่องแยกอีกรอบ (ต้องหยุดเมื่อเจอสัปดาห์ที่เล่น)
    for k in 1..8 loop
      v_wk := p_week_start - 7 * k;
      exit when v_wk < v_window_start;
      select coalesce(sum(d.day_points), 0)::int into v_wk_points
      from public.guardian_daily_points_bkk(r.student_id, v_wk) d;
      exit when v_wk_points > 0;
      v_silent_prior := v_silent_prior + 1;
    end loop;

    select exists (
      select 1 from public.quiz_attempts qa where qa.user_id = r.student_id and qa.source is null
    ) into v_ever_played;

    if coalesce(array_length(v_played_prior, 1), 0) >= 2 then
      select avg(x)::numeric into v_avg from unnest(v_played_prior) x;
    else
      v_avg := null;
    end if;

    -- โทนตามสเปก §3.3
    if not v_ever_played then
      v_situation := 'never_played';
    elsif v_points = 0 then
      if v_silent_prior + 1 >= 2 then
        v_situation := 'silent_multi';                          -- ไม่เล่น ≥ 2 สัปดาห์ติด
      elsif v_prev_points is not null and v_prev_points > 0 then
        v_situation := 'silent_one';                            -- ไม่เล่น 1 สัปดาห์ แต่ก่อนหน้าเล่น
      else
        v_situation := 'silent_new';                            -- ไม่มีประวัติในหน้าต่าง (เพิ่งผูกลิงก์)
      end if;
    elsif v_avg is not null and v_points < 0.5 * v_avg then
      v_situation := 'played_less';
    else
      v_situation := 'played_normal';
    end if;

    -- เป้า
    select * into v_goal from public.guardian_goal g
    where g.student_id = r.student_id and g.week_start = p_week_start;
    if found then
      v_reached := v_points >= v_goal.computed_target
        or exists (select 1 from public.guardian_goal_reached_weeks w
                   where w.student_id = r.student_id and w.week_start = p_week_start);
      v_goal_json := jsonb_build_object('level', v_goal.level, 'target', v_goal.computed_target, 'reached', v_reached);
    else
      v_goal_json := null;
    end if;
    -- สัปดาห์ถัดไปตั้งเป้าแล้วหรือยัง (ใช้ตัดสินว่าท้ายข้อความชวนตั้งเป้าใหม่ไหม — §5.8)
    select exists (
      select 1 from public.guardian_goal g
      where g.student_id = r.student_id and g.week_start = p_week_start + 7
    ) into v_next_goal;

    -- แผน: บทที่ผ่านในสัปดาห์นี้ / บทที่ยังไม่คล่อง / เหลือกี่บท
    v_plan_json := null; v_passed := '[]'::jsonb; v_stuck := '[]'::jsonb;
    select * into v_plan from public.guardian_plan gp
    where gp.student_id = r.student_id and gp.status = 'active';
    if found then
      select coalesce(jsonb_agg(cc.chapter order by c.passed_at), '[]'::jsonb) into v_passed
      from public.guardian_plan_chapters c
      join public.curriculum_chapters cc on cc.chapter_key = c.chapter_key
      where c.plan_id = v_plan.id and c.status = 'passed'
        and (c.passed_at at time zone 'Asia/Bangkok')::date >= p_week_start
        and (c.passed_at at time zone 'Asia/Bangkok')::date < p_week_start + 7;

      select coalesce(jsonb_agg(cc.chapter order by c.queue_order), '[]'::jsonb) into v_stuck
      from (
        select * from public.guardian_plan_chapters c0
        where c0.plan_id = v_plan.id and c0.status = 'stuck'
        order by c0.queue_order limit 3
      ) c
      join public.curriculum_chapters cc on cc.chapter_key = c.chapter_key;

      v_plan_json := jsonb_build_object(
        'remaining_chapters', (select count(*) from public.guardian_plan_chapters c
                               where c.plan_id = v_plan.id and c.status in ('current', 'pending')),
        'passed_this_week', v_passed,
        'stuck_chapters', v_stuck
      );
    end if;

    select jsonb_build_object('body', dg.body, 'context', dg.context, 'is_edited', dg.is_edited, 'updated_at', dg.updated_at)
      into v_saved
    from public.guardian_digest dg
    where dg.student_id = r.student_id and dg.week_start = p_week_start;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'student_id', r.student_id,
      'username', r.username,
      'stats', jsonb_build_object(
        'situation', v_situation,
        'is_current_week', p_week_start = v_this_monday,
        'days_played', v_days,
        'total_points', v_points,
        'avg_recent_points', case when v_avg is null then null else round(v_avg) end,
        'silent_weeks_before', v_silent_prior,
        'goal', v_goal_json,
        'next_week_goal_set', v_next_goal,
        'plan', v_plan_json
      ),
      'saved', v_saved
    ));
  end loop;

  return v_out;
end;
$$;

-- 4) บันทึก/แก้ข้อความสรุป ---------------------------------------------------------
create or replace function public.guardian_admin_save_digest(
  p_student_id uuid,
  p_week_start date,
  p_body text,
  p_context text,
  p_edited boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_digest_admin(v_uid) then
    raise exception 'ไม่มีสิทธิ์ใช้ฟีเจอร์นี้';
  end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'สัปดาห์ต้องขึ้นต้นวันจันทร์';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'ข้อความว่างเปล่า';
  end if;
  if not exists (
    select 1 from public.guardian_links gl
    where gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    raise exception 'นักเรียนคนนี้ไม่มีผู้พิทักษ์ที่ผูกอยู่';
  end if;

  insert into public.guardian_digest (student_id, week_start, body, context, is_edited, generated_at, updated_at)
  values (p_student_id, p_week_start, p_body, nullif(btrim(coalesce(p_context, '')), ''), coalesce(p_edited, false), now(), now())
  on conflict (student_id, week_start) do update
    set body       = excluded.body,
        context    = excluded.context,
        is_edited  = excluded.is_edited,
        -- แก้มือ = เก็บเวลาที่เจนเดิมไว้; เจนใหม่ (p_edited=false) = รีเซ็ตเวลาเจน
        generated_at = case when excluded.is_edited then public.guardian_digest.generated_at else now() end,
        updated_at = now();
end;
$$;

-- 5) สิทธิ์ ---------------------------------------------------------------------
revoke all on function public.guardian_admin_weekly_digest(date) from public, anon;
revoke all on function public.guardian_admin_save_digest(uuid, date, text, text, boolean) from public, anon;
grant execute on function public.guardian_admin_weekly_digest(date) to authenticated, service_role;
grant execute on function public.guardian_admin_save_digest(uuid, date, text, text, boolean) to authenticated, service_role;
