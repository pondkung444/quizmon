begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.question_factory_run_leases (
  run_id bigint primary key references public.question_factory_runs(id) on delete restrict,
  lease_owner text not null,
  lease_token uuid not null default gen_random_uuid(),
  lease_version bigint not null default 1,
  state text not null default 'active',
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  last_idempotency_key text not null,
  last_event_type text not null,
  updated_at timestamptz not null default now(),
  constraint question_factory_run_leases_token_unique unique (lease_token),
  constraint question_factory_run_leases_owner_nonempty check (btrim(lease_owner) <> ''),
  constraint question_factory_run_leases_version_positive check (lease_version > 0),
  constraint question_factory_run_leases_state_check check (state in ('active','released')),
  constraint question_factory_run_leases_times_valid check (
    expires_at > acquired_at and heartbeat_at >= acquired_at and updated_at >= acquired_at
    and ((state='active' and released_at is null) or (state='released' and released_at is not null))
  )
);

create index question_factory_run_leases_active_expiry_idx
  on public.question_factory_run_leases (expires_at, run_id) where state='active';

create table public.question_factory_run_budgets (
  run_id bigint primary key references public.question_factory_runs(id) on delete restrict,
  generated_item_limit integer not null,
  asset_build_limit integer not null,
  technical_retry_limit integer not null,
  cost_limit_microunits bigint not null,
  generated_item_used integer not null default 0,
  asset_build_used integer not null default 0,
  technical_retry_used integer not null default 0,
  cost_used_microunits bigint not null default 0,
  budget_version bigint not null default 1,
  exhausted_reason jsonb,
  configured_by text not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_factory_run_budgets_limits_valid check (
    generated_item_limit > 0 and asset_build_limit >= 0
    and technical_retry_limit >= 0 and cost_limit_microunits >= 0
  ),
  constraint question_factory_run_budgets_usage_valid check (
    generated_item_used >= 0 and asset_build_used >= 0 and technical_retry_used >= 0
    and cost_used_microunits >= 0 and budget_version > 0
  ),
  constraint question_factory_run_budgets_exhausted_object check (
    exhausted_reason is null or jsonb_typeof(exhausted_reason)='object'
  ),
  constraint question_factory_run_budgets_actor_nonempty check (btrim(configured_by) <> '')
);

create table public.question_factory_budget_reservations (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.question_factory_runs(id) on delete restrict,
  work_type text not null,
  units integer not null,
  estimated_cost_microunits bigint not null,
  reserved boolean not null,
  reason_code text not null,
  budget_version bigint not null,
  actor_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint question_factory_budget_reservations_idempotency_unique unique (idempotency_key),
  constraint question_factory_budget_reservations_work_type_check check (
    work_type in ('generated_item','asset_build','technical_retry')
  ),
  constraint question_factory_budget_reservations_units_positive check (units > 0),
  constraint question_factory_budget_reservations_cost_nonnegative check (estimated_cost_microunits >= 0),
  constraint question_factory_budget_reservations_text_nonempty check (
    btrim(reason_code) <> '' and btrim(actor_id) <> '' and btrim(idempotency_key) <> ''
  )
);

create index question_factory_budget_reservations_run_created_idx
  on public.question_factory_budget_reservations (run_id, created_at, id);

alter table public.question_factory_run_leases enable row level security;
alter table public.question_factory_run_budgets enable row level security;
alter table public.question_factory_budget_reservations enable row level security;
revoke all on table public.question_factory_run_leases, public.question_factory_run_budgets,
  public.question_factory_budget_reservations from public,anon,authenticated,service_role;
grant select,insert,update on table public.question_factory_run_leases,
  public.question_factory_run_budgets, public.question_factory_budget_reservations to service_role;
revoke all on sequence public.question_factory_budget_reservations_id_seq
  from public,anon,authenticated,service_role;
grant usage,select on sequence public.question_factory_budget_reservations_id_seq to service_role;

create function public.question_factory_claim_run(
  p_run_key uuid, p_expected_run_state_version bigint, p_lease_owner text,
  p_ttl_seconds integer, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_event public.question_factory_events%rowtype; v_now timestamptz:=pg_catalog.now();
begin
  if p_expected_run_state_version is null or p_expected_run_state_version < 0
     or p_ttl_seconds not between 30 and 900
     or nullif(pg_catalog.btrim(p_lease_owner),'') is null
     or nullif(pg_catalog.btrim(p_idempotency_key),'') is null then
    raise exception 'invalid Run claim input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,21));
  select * into v_run from public.question_factory_runs where run_key=p_run_key for update;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id for update;
  if found and v_lease.last_idempotency_key=p_idempotency_key and v_lease.last_event_type='RUN_LEASE_ACQUIRED' then
    if v_lease.lease_owner<>p_lease_owner then raise exception 'idempotency key belongs to another lease owner'; end if;
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_token',v_lease.lease_token,
      'lease_version',v_lease.lease_version,'state',v_lease.state,'expires_at',v_lease.expires_at,'replayed',true);
  end if;
  if v_run.status not in ('created','running','paused','waiting_human_review')
     or v_run.state_version<>p_expected_run_state_version then raise exception 'run state/version conflict'; end if;
  if found and v_lease.state='active' and v_lease.expires_at>v_now then
    raise exception 'Run already has an active lease';
  end if;
  insert into public.question_factory_run_leases(run_id,lease_owner,lease_token,lease_version,state,
    acquired_at,heartbeat_at,expires_at,released_at,last_idempotency_key,last_event_type,updated_at)
  values(v_run.id,p_lease_owner,gen_random_uuid(),coalesce(v_lease.lease_version,0)+1,'active',v_now,v_now,
    v_now+pg_catalog.make_interval(secs=>p_ttl_seconds),null,p_idempotency_key,'RUN_LEASE_ACQUIRED',v_now)
  on conflict(run_id) do update set lease_owner=excluded.lease_owner,lease_token=excluded.lease_token,
    lease_version=excluded.lease_version,state='active',acquired_at=excluded.acquired_at,
    heartbeat_at=excluded.heartbeat_at,expires_at=excluded.expires_at,released_at=null,
    last_idempotency_key=excluded.last_idempotency_key,last_event_type=excluded.last_event_type,updated_at=excluded.updated_at
  returning * into v_lease;
  insert into public.question_factory_events(run_id,slot_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,null,'RUN_LEASE_ACQUIRED',v_run.status,v_run.status,
    'BOUNDED_WORKER_OWNERSHIP',pg_catalog.jsonb_build_object('lease_owner',p_lease_owner,
    'lease_version',v_lease.lease_version,'expires_at',v_lease.expires_at),'worker',p_lease_owner,p_idempotency_key)
    returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_token',v_lease.lease_token,
    'lease_version',v_lease.lease_version,'state',v_lease.state,'expires_at',v_lease.expires_at,
    'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_renew_run_lease(
  p_run_key uuid, p_lease_token uuid, p_expected_lease_version bigint,
  p_lease_owner text, p_ttl_seconds integer, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_event public.question_factory_events%rowtype; v_now timestamptz:=pg_catalog.now();
begin
  if p_expected_lease_version is null or p_expected_lease_version < 1 or p_ttl_seconds not between 30 and 900
     or nullif(pg_catalog.btrim(p_lease_owner),'') is null or nullif(pg_catalog.btrim(p_idempotency_key),'') is null
     or p_lease_token is null then raise exception 'invalid lease renewal input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,21));
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id for update;
  if not found then raise exception 'Run has no lease'; end if;
  if v_lease.last_idempotency_key=p_idempotency_key and v_lease.last_event_type='RUN_LEASE_RENEWED' then
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_version',v_lease.lease_version,
      'state',v_lease.state,'expires_at',v_lease.expires_at,'replayed',true); end if;
  if v_run.status not in ('created','running','paused','waiting_human_review') or v_lease.state<>'active'
     or v_lease.expires_at<=v_now or v_lease.lease_token<>p_lease_token
     or v_lease.lease_owner<>p_lease_owner or v_lease.lease_version<>p_expected_lease_version then
    raise exception 'lease ownership/version conflict or lease expired'; end if;
  update public.question_factory_run_leases set lease_version=lease_version+1,heartbeat_at=v_now,
    expires_at=v_now+pg_catalog.make_interval(secs=>p_ttl_seconds),updated_at=v_now,
    last_idempotency_key=p_idempotency_key,last_event_type='RUN_LEASE_RENEWED' where run_id=v_run.id returning * into v_lease;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,'RUN_LEASE_RENEWED',v_run.status,v_run.status,
    'LEASE_HEARTBEAT_ACCEPTED',pg_catalog.jsonb_build_object('lease_owner',p_lease_owner,
    'lease_version',v_lease.lease_version,'expires_at',v_lease.expires_at),'worker',p_lease_owner,p_idempotency_key)
    returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_version',v_lease.lease_version,
    'state',v_lease.state,'expires_at',v_lease.expires_at,'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_release_run_lease(
  p_run_key uuid, p_lease_token uuid, p_expected_lease_version bigint,
  p_lease_owner text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_event public.question_factory_events%rowtype; v_now timestamptz:=pg_catalog.now();
begin
  if p_expected_lease_version is null or p_expected_lease_version<1 or p_lease_token is null
     or nullif(pg_catalog.btrim(p_lease_owner),'') is null or nullif(pg_catalog.btrim(p_idempotency_key),'') is null
    then raise exception 'invalid lease release input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,21));
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id for update;
  if not found then raise exception 'Run has no lease'; end if;
  if v_lease.last_idempotency_key=p_idempotency_key and v_lease.last_event_type='RUN_LEASE_RELEASED' then
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_version',v_lease.lease_version,
      'state',v_lease.state,'released_at',v_lease.released_at,'replayed',true); end if;
  if v_lease.state<>'active' or v_lease.lease_token<>p_lease_token or v_lease.lease_owner<>p_lease_owner
     or v_lease.lease_version<>p_expected_lease_version then raise exception 'lease ownership/version conflict'; end if;
  update public.question_factory_run_leases set state='released',lease_version=lease_version+1,released_at=v_now,
    updated_at=v_now,last_idempotency_key=p_idempotency_key,last_event_type='RUN_LEASE_RELEASED'
    where run_id=v_run.id returning * into v_lease;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,'RUN_LEASE_RELEASED',v_run.status,v_run.status,
    'WORKER_OWNERSHIP_RELEASED',pg_catalog.jsonb_build_object('lease_owner',p_lease_owner,
    'lease_version',v_lease.lease_version,'released_at',v_lease.released_at),'worker',p_lease_owner,p_idempotency_key)
    returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'lease_version',v_lease.lease_version,
    'state',v_lease.state,'released_at',v_lease.released_at,'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_configure_run_budget(
  p_run_key uuid, p_expected_run_state_version bigint, p_generated_item_limit integer,
  p_asset_build_limit integer, p_technical_retry_limit integer, p_cost_limit_microunits bigint,
  p_actor_id text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_budget public.question_factory_run_budgets%rowtype;
  v_event public.question_factory_events%rowtype;
begin
  if p_expected_run_state_version is null or p_expected_run_state_version<0 or p_generated_item_limit<1
    or p_asset_build_limit<0 or p_technical_retry_limit<0 or p_cost_limit_microunits<0
    or nullif(pg_catalog.btrim(p_actor_id),'') is null or nullif(pg_catalog.btrim(p_idempotency_key),'') is null
    then raise exception 'invalid budget configuration'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,22));
  select * into v_run from public.question_factory_runs where run_key=p_run_key for update;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_event from public.question_factory_events where idempotency_key=p_idempotency_key;
  if found then
    select * into v_budget from public.question_factory_run_budgets where run_id=v_run.id;
    if v_event.run_id<>v_run.id or v_event.event_type<>'RUN_BUDGET_CONFIGURED' or not found then
      raise exception 'idempotency key belongs to another operation'; end if;
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'budget_version',v_budget.budget_version,'replayed',true);
  end if;
  if v_run.status not in ('created','running','paused','waiting_human_review')
     or v_run.state_version<>p_expected_run_state_version then raise exception 'run state/version conflict'; end if;
  if p_generated_item_limit>v_run.max_generated_items or p_asset_build_limit>p_generated_item_limit
     or p_technical_retry_limit>(v_run.max_generated_items*v_run.max_technical_retries) then
    raise exception 'budget exceeds immutable Run limits'; end if;
  insert into public.question_factory_run_budgets(run_id,generated_item_limit,asset_build_limit,
    technical_retry_limit,cost_limit_microunits,configured_by)
  values(v_run.id,p_generated_item_limit,p_asset_build_limit,p_technical_retry_limit,p_cost_limit_microunits,p_actor_id)
  on conflict(run_id) do nothing returning * into v_budget;
  if not found then raise exception 'Run budget is already configured and immutable'; end if;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,'RUN_BUDGET_CONFIGURED',v_run.status,v_run.status,
    'IMMUTABLE_LIMITS_SET',pg_catalog.jsonb_build_object('generated_item_limit',p_generated_item_limit,
    'asset_build_limit',p_asset_build_limit,'technical_retry_limit',p_technical_retry_limit,
    'cost_limit_microunits',p_cost_limit_microunits),'worker',p_actor_id,p_idempotency_key)
    returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'budget_version',v_budget.budget_version,
    'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_reserve_run_budget(
  p_run_key uuid, p_lease_token uuid, p_expected_budget_version bigint, p_work_type text,
  p_units integer, p_estimated_cost_microunits bigint, p_actor_id text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_budget public.question_factory_run_budgets%rowtype; v_res public.question_factory_budget_reservations%rowtype;
  v_event public.question_factory_events%rowtype; v_reserved boolean; v_reason text; v_now timestamptz:=pg_catalog.now();
begin
  if p_lease_token is null or p_expected_budget_version<1 or p_work_type not in ('generated_item','asset_build','technical_retry')
    or p_units<1 or p_estimated_cost_microunits<0 or nullif(pg_catalog.btrim(p_actor_id),'') is null
    or nullif(pg_catalog.btrim(p_idempotency_key),'') is null then raise exception 'invalid budget reservation'; end if;
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found then raise exception 'unknown Factory run'; end if;
  select * into v_res from public.question_factory_budget_reservations where idempotency_key=p_idempotency_key;
  if found then
    if v_res.run_id<>v_run.id or v_res.work_type<>p_work_type or v_res.units<>p_units
       or v_res.estimated_cost_microunits<>p_estimated_cost_microunits then
      raise exception 'idempotency key belongs to another reservation'; end if;
    return pg_catalog.jsonb_build_object('run_id',v_run.id,'reserved',v_res.reserved,
      'reason_code',v_res.reason_code,'budget_version',v_res.budget_version,'replayed',true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_key::text,22));
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id for update;
  if not found or v_lease.state<>'active' or v_lease.expires_at<=v_now or v_lease.lease_token<>p_lease_token
     or v_lease.lease_owner<>p_actor_id then raise exception 'active lease ownership required'; end if;
  select * into v_budget from public.question_factory_run_budgets where run_id=v_run.id for update;
  if not found then raise exception 'Run budget is not configured'; end if;
  if v_run.status not in ('created','running','paused','waiting_human_review')
     or v_budget.budget_version<>p_expected_budget_version then raise exception 'budget state/version conflict'; end if;
  v_reason := case
    when v_budget.cost_used_microunits+p_estimated_cost_microunits>v_budget.cost_limit_microunits then 'COST_LIMIT_EXHAUSTED'
    when p_work_type='generated_item' and v_budget.generated_item_used+p_units>v_budget.generated_item_limit then 'GENERATED_ITEM_LIMIT_EXHAUSTED'
    when p_work_type='asset_build' and v_budget.asset_build_used+p_units>v_budget.asset_build_limit then 'ASSET_BUILD_LIMIT_EXHAUSTED'
    when p_work_type='technical_retry' and v_budget.technical_retry_used+p_units>v_budget.technical_retry_limit then 'TECHNICAL_RETRY_LIMIT_EXHAUSTED'
    else 'BUDGET_RESERVED' end;
  v_reserved := v_reason='BUDGET_RESERVED';
  update public.question_factory_run_budgets set
    generated_item_used=generated_item_used+case when v_reserved and p_work_type='generated_item' then p_units else 0 end,
    asset_build_used=asset_build_used+case when v_reserved and p_work_type='asset_build' then p_units else 0 end,
    technical_retry_used=technical_retry_used+case when v_reserved and p_work_type='technical_retry' then p_units else 0 end,
    cost_used_microunits=cost_used_microunits+case when v_reserved then p_estimated_cost_microunits else 0 end,
    budget_version=budget_version+1,
    exhausted_reason=case when v_reserved then exhausted_reason else pg_catalog.jsonb_build_object(
      'reason_code',v_reason,'work_type',p_work_type,'requested_units',p_units,
      'requested_cost_microunits',p_estimated_cost_microunits,'observed_at',v_now) end,
    updated_at=v_now where run_id=v_run.id returning * into v_budget;
  insert into public.question_factory_budget_reservations(run_id,work_type,units,estimated_cost_microunits,
    reserved,reason_code,budget_version,actor_id,idempotency_key) values(v_run.id,p_work_type,p_units,
    p_estimated_cost_microunits,v_reserved,v_reason,v_budget.budget_version,p_actor_id,p_idempotency_key)
    returning * into v_res;
  insert into public.question_factory_events(run_id,event_type,from_state,to_state,reason_code,payload,
    actor_type,actor_id,idempotency_key) values(v_run.id,case when v_reserved then 'RUN_BUDGET_RESERVED' else 'RUN_BUDGET_EXHAUSTED' end,
    v_run.status,v_run.status,v_reason,pg_catalog.jsonb_build_object('work_type',p_work_type,'units',p_units,
    'estimated_cost_microunits',p_estimated_cost_microunits,'budget_version',v_budget.budget_version),
    'worker',p_actor_id,p_idempotency_key) returning * into v_event;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'reserved',v_reserved,'reason_code',v_reason,
    'budget_version',v_budget.budget_version,'event_id',v_event.id,'replayed',false);
end $$;

create function public.question_factory_reconcile_run(p_run_key uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_run public.question_factory_runs%rowtype; v_lease public.question_factory_run_leases%rowtype;
  v_budget public.question_factory_run_budgets%rowtype; v_total integer; v_active integer; v_approved integer;
  v_nonterminal integer; v_mapping integer; v_last_event bigint; v_issues jsonb:='[]'::jsonb;
begin
  select * into v_run from public.question_factory_runs where run_key=p_run_key;
  if not found then raise exception 'unknown Factory run'; end if;
  select count(*),count(*) filter(where state='active'),count(*) filter(where state='approved'),
    count(*) filter(where state not in ('active','rejected','cancelled')) into v_total,v_active,v_approved,v_nonterminal
    from public.question_factory_slots where run_id=v_run.id;
  select count(*) into v_mapping from public.question_factory_slots s join public.questions q
    on q.id=s.question_id and q.status='active' join public.question_factory_product_mappings pm
    on pm.run_id=s.run_id and pm.slot_id=s.id and pm.question_id=q.id and pm.mapping_version='question-product-mapping/v1'
    and pm.mapping_input->>'checksum'=pm.checksum where s.run_id=v_run.id and s.state='active';
  select * into v_lease from public.question_factory_run_leases where run_id=v_run.id;
  select * into v_budget from public.question_factory_run_budgets where run_id=v_run.id;
  select max(id) into v_last_event from public.question_factory_events where run_id=v_run.id;
  if v_run.active_count<>v_active then v_issues:=v_issues||'[{"code":"ACTIVE_COUNTER_DRIFT"}]'::jsonb; end if;
  if v_run.pipeline_ready_count<>v_approved then v_issues:=v_issues||'[{"code":"READY_COUNTER_DRIFT"}]'::jsonb; end if;
  if v_mapping<>v_active then v_issues:=v_issues||'[{"code":"ACTIVE_MAPPING_GAP"}]'::jsonb; end if;
  if v_run.status='completed' and (v_nonterminal<>0 or v_active<>v_run.target_active) then
    v_issues:=v_issues||'[{"code":"INVALID_COMPLETED_FACTS"}]'::jsonb; end if;
  if v_lease.run_id is not null and v_lease.state='active' and v_lease.expires_at<=pg_catalog.now() then
    v_issues:=v_issues||'[{"code":"LEASE_EXPIRED_RECLAIMABLE"}]'::jsonb; end if;
  if v_budget.run_id is not null and (v_budget.generated_item_used>v_budget.generated_item_limit
    or v_budget.asset_build_used>v_budget.asset_build_limit or v_budget.technical_retry_used>v_budget.technical_retry_limit
    or v_budget.cost_used_microunits>v_budget.cost_limit_microunits) then
    v_issues:=v_issues||'[{"code":"BUDGET_USAGE_EXCEEDS_LIMIT"}]'::jsonb; end if;
  return pg_catalog.jsonb_build_object('run_id',v_run.id,'run_key',v_run.run_key,'status',v_run.status,
    'state_version',v_run.state_version,'healthy',pg_catalog.jsonb_array_length(v_issues)=0,'issues',v_issues,
    'facts',pg_catalog.jsonb_build_object('slot_count',v_total,'active_count',v_active,'approved_count',v_approved,
      'nonterminal_count',v_nonterminal,'exact_active_mapping_count',v_mapping,'latest_event_id',v_last_event),
    'lease',case when v_lease.run_id is null then null else pg_catalog.jsonb_build_object('state',v_lease.state,
      'owner',v_lease.lease_owner,'version',v_lease.lease_version,'expires_at',v_lease.expires_at) end,
    'budget',case when v_budget.run_id is null then null else pg_catalog.jsonb_build_object('version',v_budget.budget_version,
      'generated',pg_catalog.jsonb_build_array(v_budget.generated_item_used,v_budget.generated_item_limit),
      'assets',pg_catalog.jsonb_build_array(v_budget.asset_build_used,v_budget.asset_build_limit),
      'retries',pg_catalog.jsonb_build_array(v_budget.technical_retry_used,v_budget.technical_retry_limit),
      'cost',pg_catalog.jsonb_build_array(v_budget.cost_used_microunits,v_budget.cost_limit_microunits),
      'exhausted_reason',v_budget.exhausted_reason) end);
end $$;

revoke all on function public.question_factory_claim_run(uuid,bigint,text,integer,text),
  public.question_factory_renew_run_lease(uuid,uuid,bigint,text,integer,text),
  public.question_factory_release_run_lease(uuid,uuid,bigint,text,text),
  public.question_factory_configure_run_budget(uuid,bigint,integer,integer,integer,bigint,text,text),
  public.question_factory_reserve_run_budget(uuid,uuid,bigint,text,integer,bigint,text,text),
  public.question_factory_reconcile_run(uuid) from public,anon,authenticated;
grant execute on function public.question_factory_claim_run(uuid,bigint,text,integer,text),
  public.question_factory_renew_run_lease(uuid,uuid,bigint,text,integer,text),
  public.question_factory_release_run_lease(uuid,uuid,bigint,text,text),
  public.question_factory_configure_run_budget(uuid,bigint,integer,integer,integer,bigint,text,text),
  public.question_factory_reserve_run_budget(uuid,uuid,bigint,text,integer,bigint,text,text),
  public.question_factory_reconcile_run(uuid) to service_role;

comment on table public.question_factory_run_leases is 'Bounded restart-safe worker ownership for Factory Runs.';
comment on table public.question_factory_run_budgets is 'Immutable per-Run workload and estimated-cost limits with atomic usage.';
comment on function public.question_factory_reconcile_run(uuid) is 'Read-only service-only reconciliation of Run counters, mappings, lease and budget facts.';

commit;
