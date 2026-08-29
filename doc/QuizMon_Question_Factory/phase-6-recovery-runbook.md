# Phase 6 Recovery Runbook

Use only service-role server code. Never repair Factory state with ad-hoc updates in production.

## Worker stopped or timed out

1. Run `question_factory_reconcile_run(run_key)` and inspect the latest Run event.
2. If the lease is active and unexpired, the current owner must renew or release it. Do not steal it.
3. If `LEASE_EXPIRED_RECLAIMABLE` is reported, claim with a new owner, a new idempotency key and the current Run `state_version`. The claim rotates the token and increments `lease_version`.
4. Resume only from persisted Slot/Event facts. Never infer completion from an HTTP response or an open admin page.

## Version conflict

Reload Run, lease and budget facts. A stale Run, lease or budget version means another operation won. Reconcile first, then either replay the original idempotency key or issue a genuinely new operation with the observed version.

## Budget exhausted

`RUN_BUDGET_EXHAUSTED` is a deliberate stop, not a technical retry. Preserve `exhausted_reason`; do not increase immutable limits or edit usage counters. Review the Run and start a separately approved Run if more work is required.

## Counter or mapping drift

Stop scheduling. Reconciliation codes `ACTIVE_COUNTER_DRIFT`, `READY_COUNTER_DRIFT`, `ACTIVE_MAPPING_GAP` or `INVALID_COMPLETED_FACTS` block terminal trust. Compare Slots, questions, immutable mappings and events. Repair only through a reviewed migration/RPC with explicit evidence and a second production reconciliation.

## Release and handoff

Release with the exact token, owner and expected lease version. A release is idempotent. The next worker must claim with a new idempotency key and must configure/use the existing immutable budget; it cannot reset usage.

## Required post-recovery checks

- reconciliation is healthy or only reports the explicitly understood reclaimable expired lease;
- event sequence contains one event per idempotency key;
- budget usage did not change on a rejected/replayed reservation;
- no anonymous/authenticated function execution privilege exists;
- acceptance fixtures leave zero Run, lease, budget, reservation or event residue.
