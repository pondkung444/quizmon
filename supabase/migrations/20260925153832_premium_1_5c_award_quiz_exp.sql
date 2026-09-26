-- Premium phase 1.5c: server-side daily EXP cap (premium 300 / free 180)
-- and atomic quiz EXP award. service_role only; no effect until app code calls it (1.5d).

create or replace function public.get_daily_exp_cap(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when exists (
             select 1
               from public.self_serve_enrollment e
              where e.student_id = p_user_id
                and e.status = 'active'
                and now() < e.expires_at
           ) then 300
           else 180
         end;
$$;

revoke all on function public.get_daily_exp_cap(uuid) from public, anon, authenticated;
grant execute on function public.get_daily_exp_cap(uuid) to service_role;

create or replace function public.award_quiz_exp(
  p_user_id uuid,
  p_pet_id  uuid,
  p_amount  integer
)
returns table (
  added      integer,
  total_exp  integer,
  today_exp  integer,
  daily_cap  integer,
  was_capped boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today     date := (now() at time zone 'Asia/Bangkok')::date;
  v_cap       integer;
  v_old_today integer;
  v_old_date  date;
  v_so_far    integer;
  v_remaining integer;
  v_add       integer;
begin
  if p_amount is null or p_amount < 0 or p_amount > 1000 then
    raise exception 'award_quiz_exp: invalid amount %', p_amount;
  end if;

  select p.exp_today, p.exp_today_date
    into v_old_today, v_old_date
    from public.pets p
   where p.id = p_pet_id
     and p.user_id = p_user_id
   for update;

  if not found then
    raise exception 'award_quiz_exp: pet % not found for user %', p_pet_id, p_user_id;
  end if;

  v_cap       := public.get_daily_exp_cap(p_user_id);
  v_so_far    := case when v_old_date = v_today then v_old_today else 0 end;
  v_remaining := greatest(0, v_cap - v_so_far);
  v_add       := least(p_amount, v_remaining);

  update public.pets p
     set exp            = p.exp + v_add,
         exp_today      = v_so_far + v_add,
         exp_today_date = v_today
   where p.id = p_pet_id
  returning p.exp, p.exp_today
    into total_exp, today_exp;

  added      := v_add;
  daily_cap  := v_cap;
  was_capped := p_amount > v_remaining;
  return next;
end;
$$;

revoke all on function public.award_quiz_exp(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.award_quiz_exp(uuid, uuid, integer) to service_role;
