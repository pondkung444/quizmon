-- Premium phase 3a: rewards
--   1) welcome gift on a student's FIRST paid (stripe) order: egg_epic_02 (ไข่ศักดิ์ธรา) + frame guardian_basic
--   2) premium biweekly egg: goal reached this week AND last week (consecutive), while premium (checked at
--      call time only), each week counted in at most one pair -> at most one egg per 2 weeks.
--      v2: a call also recovers a missed award for the immediately preceding pair, so a single failed
--      call on the student's last quiz round of a week does not silently lose that egg.
-- Guardian reward functions are NOT modified (existing chapter-egg and frame ladder stay as they are).

create or replace function public.grant_premium(p_order_id uuid)
returns table (
  order_id        uuid,
  student_id      uuid,
  new_expires_at  timestamptz,
  already_granted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.premium_orders%rowtype;
  v_enr_id  uuid;
  v_old_exp timestamptz;
  v_new_exp timestamptz;
begin
  select * into v_order
    from public.premium_orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'grant_premium: order % not found', p_order_id;
  end if;

  if v_order.status = 'granted' then
    order_id        := v_order.id;
    student_id      := v_order.student_id;
    new_expires_at  := v_order.expires_after;
    already_granted := true;
    return next;
    return;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'grant_premium: order % has status %', p_order_id, v_order.status;
  end if;

  if v_order.student_id is null then
    raise exception 'grant_premium: order % has no student (account deleted)', p_order_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('premium:' || v_order.student_id::text, 0));

  select e.id, e.expires_at
    into v_enr_id, v_old_exp
    from public.self_serve_enrollment e
   where e.student_id = v_order.student_id
     and e.status = 'active'
   for update;

  if v_enr_id is not null then
    v_new_exp := greatest(now(), v_old_exp) + make_interval(days => v_order.days);
    update public.self_serve_enrollment e
       set expires_at   = v_new_exp,
           source       = v_order.provider,
           activated_at = case when v_old_exp <= now() then now() else e.activated_at end
     where e.id = v_enr_id;
  else
    v_new_exp := now() + make_interval(days => v_order.days);
    insert into public.self_serve_enrollment (student_id, status, source, activated_at, expires_at)
    values (v_order.student_id, 'active', v_order.provider, now(), v_new_exp);
  end if;

  -- welcome gift: first paid order ever for this student (a refunded earlier paid order still counts,
  -- so pay -> refund -> pay does not give a second egg). Gifts from Pond never trigger it.
  if v_order.provider = 'stripe' and not exists (
       select 1 from public.premium_orders o2
        where o2.student_id = v_order.student_id
          and o2.provider = 'stripe'
          and o2.status in ('granted', 'refunded')
          and o2.id <> v_order.id
     ) then
    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_order.student_id, 'egg_epic_02', 'premium_welcome');
    perform public.grant_profile_frame(v_order.student_id, 'guardian_basic', 'premium_welcome');
  end if;

  update public.premium_orders o
     set status         = 'granted',
         granted_at     = now(),
         expires_before = v_old_exp,
         expires_after  = v_new_exp
   where o.id = v_order.id;

  order_id        := v_order.id;
  student_id      := v_order.student_id;
  new_expires_at  := v_new_exp;
  already_granted := false;
  return next;
end;
$$;

revoke all on function public.grant_premium(uuid) from public, anon, authenticated;
grant execute on function public.grant_premium(uuid) to service_role;

-- biweekly egg ledger: one row per awarded pair, keyed by the pair's second (later) week
create table public.premium_goal_egg_awards (
  student_id    uuid        not null references auth.users(id) on delete cascade,
  pair_end_week date        not null,             -- Monday (Bangkok) of the later week of the pair
  awarded_at    timestamptz not null default now(),
  primary key (student_id, pair_end_week)
);

alter table public.premium_goal_egg_awards enable row level security;
revoke all on public.premium_goal_egg_awards from anon, authenticated;

-- Called by the app right after guardian_check_weekly_goal_reward() in finishQuizRound.
-- Safe for the student to call directly: it only awards what the DB state already earns.
-- Checks the current pair AND the immediately preceding pair, so a missed call on the
-- student's last quiz round of a week does not permanently lose that pair's egg.
create or replace function public.premium_check_biweekly_egg()
returns boolean                                   -- true = at least one egg was awarded on this call
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_week      date;
  v_prev      date;
  v_candidate date;
  v_inserted  date;
  v_awarded   boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (
    select 1 from public.self_serve_enrollment e
     where e.student_id = v_uid and e.status = 'active' and now() < e.expires_at
  ) then
    return false;
  end if;

  select wb.week_start_date into v_week from public.current_week_bounds_bkk() wb;
  v_prev := v_week - 7;

  foreach v_candidate in array array[v_prev, v_week]
  loop
    if exists (select 1 from public.guardian_goal_reached_weeks g where g.student_id = v_uid and g.week_start = v_candidate)
       and exists (select 1 from public.guardian_goal_reached_weeks g where g.student_id = v_uid and g.week_start = v_candidate - 7)
       and not exists (select 1 from public.premium_goal_egg_awards a where a.student_id = v_uid and a.pair_end_week = v_candidate)
    then
      insert into public.premium_goal_egg_awards (student_id, pair_end_week)
      values (v_uid, v_candidate)
      on conflict do nothing
      returning pair_end_week into v_inserted;

      if v_inserted is not null then
        insert into public.player_eggs (user_id, egg_type_id, source)
        values (v_uid, 'egg_epic_02', 'premium_biweekly_goal');
        v_awarded := true;
      end if;
    end if;
  end loop;

  return v_awarded;
end;
$$;

revoke all on function public.premium_check_biweekly_egg() from public, anon;
grant execute on function public.premium_check_biweekly_egg() to authenticated, service_role;
