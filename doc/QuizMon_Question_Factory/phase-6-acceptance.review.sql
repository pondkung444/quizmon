-- Phase 6 destructive-safe acceptance skeleton. Always run as one transaction and ROLLBACK.
-- Production verification on 2026-08-29 used this contract with 100 reservations.
begin;
set local statement_timeout='30s';

do $$
declare v_run_id bigint; v_claim jsonb; v_budget jsonb; v_result jsonb;
  v_token uuid; v_lease_version bigint; v_budget_version bigint; i integer;
begin
  insert into public.question_factory_runs(
    run_key,scope_key,status,profile_snapshot_id,blueprint_snapshot_id,target_active,
    preferred_batch_size,max_batch_size,max_generated_items,max_revisions_per_slot,
    max_technical_retries,created_by,started_at
  ) values (
    '60000000-0000-0000-0000-000000000001',
    'qf:v1|stage=lower_secondary|grade=9|subject=math|unit=phase6_acceptance',
    'running',25,25,1,1,1,120,2,3,'phase6-acceptance',now()
  ) returning id into v_run_id;

  v_claim:=public.question_factory_claim_run(
    '60000000-0000-0000-0000-000000000001',0,'worker-a',120,'phase6:claim:a');
  v_token:=(v_claim->>'lease_token')::uuid;
  v_lease_version:=(v_claim->>'lease_version')::bigint;

  begin
    perform public.question_factory_claim_run(
      '60000000-0000-0000-0000-000000000001',0,'worker-b',120,'phase6:claim:contended');
    raise exception 'contended claim unexpectedly succeeded';
  exception when others then
    if sqlerrm='contended claim unexpectedly succeeded' then raise; end if;
  end;

  v_budget:=public.question_factory_configure_run_budget(
    '60000000-0000-0000-0000-000000000001',0,100,10,10,1000000,
    'worker-a','phase6:budget:configure');
  v_budget_version:=(v_budget->>'budget_version')::bigint;

  for i in 1..100 loop
    v_result:=public.question_factory_reserve_run_budget(
      '60000000-0000-0000-0000-000000000001',v_token,v_budget_version,
      'generated_item',1,1000,'worker-a','phase6:reserve:'||i);
    if not (v_result->>'reserved')::boolean then raise exception 'reservation % rejected',i; end if;
    v_budget_version:=(v_result->>'budget_version')::bigint;
  end loop;

  v_result:=public.question_factory_reserve_run_budget(
    '60000000-0000-0000-0000-000000000001',v_token,v_budget_version,
    'generated_item',1,1000,'worker-a','phase6:reserve:exhaust');
  if (v_result->>'reserved')::boolean
     or v_result->>'reason_code'<>'GENERATED_ITEM_LIMIT_EXHAUSTED' then
    raise exception 'budget exhaustion gate failed';
  end if;
  if not (public.question_factory_reconcile_run(
    '60000000-0000-0000-0000-000000000001')->>'healthy')::boolean then
    raise exception 'reconciliation failed';
  end if;
end $$;

rollback;

-- Run separately after the rollback; every count must be zero.
select
  (select count(*) from public.question_factory_runs where run_key='60000000-0000-0000-0000-000000000001') fixture_runs,
  (select count(*) from public.question_factory_events where idempotency_key like 'phase6:%') fixture_events,
  (select count(*) from public.question_factory_budget_reservations where idempotency_key like 'phase6:%') fixture_reservations;
