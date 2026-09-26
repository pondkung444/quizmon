-- Premium phase 1: order ledger + grant / refund functions (gateway-agnostic).
-- service_role only. No effect on users until app code calls it (phase 4 Stripe webhook),
-- except that Pond can gift access via grant_premium_gift().
-- Revision 2 (after Claude Code review): refund function, hide note from students,
-- and account deletion must not be blocked by premium rows.

-- 1) allow new enrollment sources (existing rows are 'manual' and stay valid)
alter table public.self_serve_enrollment
  drop constraint self_serve_enrollment_source_check;
alter table public.self_serve_enrollment
  add constraint self_serve_enrollment_source_check
  check (source = any (array['manual', 'iap_google', 'iap_apple', 'stripe', 'gift']));

-- 2) FIX existing bug: self_serve_enrollment -> profiles was NO ACTION, which makes
--    delete_own_account() fail for any enrolled user, and makes the guest-cleanup cron
--    abort its whole run on the first enrolled guest. Access rows die with the account.
alter table public.self_serve_enrollment
  drop constraint self_serve_enrollment_student_id_fkey;
alter table public.self_serve_enrollment
  add constraint self_serve_enrollment_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

-- 3) order ledger: one row per purchase / gift, independent of the gateway.
--    Payment records outlive the account: student_id becomes NULL on account deletion.
create table public.premium_orders (
  id              uuid        primary key default gen_random_uuid(),
  student_id      uuid        references public.profiles(id) on delete set null,
  provider        text        not null check (provider in ('stripe', 'gift')),
  provider_ref    text,                                   -- e.g. Stripe Checkout Session id
  amount_satang   integer     not null default 0 check (amount_satang >= 0),  -- ฿99 = 9900
  currency        text        not null default 'THB',
  days            integer     not null check (days between 1 and 366),
  status          text        not null default 'pending'
                  check (status in ('pending', 'granted', 'failed', 'canceled', 'refunded')),
  note            text,                                   -- internal only, not visible to students
  expires_before  timestamptz,                            -- enrollment.expires_at before grant (audit)
  expires_after   timestamptz,                            -- enrollment.expires_at after grant (audit)
  created_at      timestamptz not null default now(),
  granted_at      timestamptz,
  refunded_at     timestamptz,
  updated_at      timestamptz not null default now()
);

create unique index premium_orders_provider_ref_key
  on public.premium_orders (provider, provider_ref)
  where provider_ref is not null;
create index premium_orders_student_id_idx on public.premium_orders (student_id);

create trigger trg_premium_orders_set_updated_at
  before update on public.premium_orders
  for each row execute function public.set_updated_at();

alter table public.premium_orders enable row level security;
revoke all on public.premium_orders from anon, authenticated;
-- students read their own orders, but only these columns (no note / provider_ref / audit fields)
grant select (id, student_id, provider, amount_satang, currency, days, status,
              expires_after, created_at, granted_at, refunded_at)
  on public.premium_orders to authenticated;
create policy premium_orders_select_own on public.premium_orders
  for select to authenticated using (auth.uid() = student_id);

-- 4) grant access for one order — idempotent
--    - same order granted twice → no extra days, returns already_granted = true
--    - extends the student's single active enrollment: expires_at = max(now, expires_at) + days
--      (row is updated in place — the partial unique index allows only one active row)
--    - no active row → inserts a new one
--    - per-student advisory lock so two orders for the same student can't race
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

-- 5) refund one granted order (policy: only for system errors, e.g. double payment)
--    - takes the order's days back off the active enrollment, never below now()
--      (EXP already earned is never touched)
--    - idempotent: refunding an already-refunded order changes nothing
--    - the money itself is returned outside the DB (Stripe dashboard)
create or replace function public.refund_premium(p_order_id uuid, p_note text default null)
returns table (
  order_id        uuid,
  student_id      uuid,
  new_expires_at  timestamptz,
  already_refunded boolean
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
    raise exception 'refund_premium: order % not found', p_order_id;
  end if;

  if v_order.status = 'refunded' then
    order_id         := v_order.id;
    student_id       := v_order.student_id;
    new_expires_at   := null;
    already_refunded := true;
    return next;
    return;
  end if;

  if v_order.status <> 'granted' then
    raise exception 'refund_premium: order % has status % (only granted orders can be refunded)',
      p_order_id, v_order.status;
  end if;

  if v_order.student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('premium:' || v_order.student_id::text, 0));

    select e.id, e.expires_at
      into v_enr_id, v_old_exp
      from public.self_serve_enrollment e
     where e.student_id = v_order.student_id
       and e.status = 'active'
     for update;

    if v_enr_id is not null then
      v_new_exp := greatest(now(), v_old_exp - make_interval(days => v_order.days));
      update public.self_serve_enrollment e
         set expires_at = v_new_exp
       where e.id = v_enr_id;
    end if;
  end if;

  update public.premium_orders o
     set status      = 'refunded',
         refunded_at = now(),
         note        = coalesce(p_note, o.note)
   where o.id = v_order.id;

  order_id         := v_order.id;
  student_id       := v_order.student_id;
  new_expires_at   := v_new_exp;
  already_refunded := false;
  return next;
end;
$$;

revoke all on function public.refund_premium(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_premium(uuid, text) to service_role;

-- 6) Pond's gift helper (run via SQL as postgres, or service_role)
--    creates a 'gift' order (฿0) and grants it in one call
create or replace function public.grant_premium_gift(
  p_student_id uuid,
  p_days       integer,
  p_note       text default null
)
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
  v_order_id uuid;
begin
  insert into public.premium_orders (student_id, provider, amount_satang, days, note)
  values (p_student_id, 'gift', 0, p_days, p_note)
  returning id into v_order_id;

  return query select * from public.grant_premium(v_order_id);
end;
$$;

revoke all on function public.grant_premium_gift(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_premium_gift(uuid, integer, text) to service_role;
