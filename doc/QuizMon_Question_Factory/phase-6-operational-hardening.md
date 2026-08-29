# Phase 6 — Operational Hardening

**Status:** In progress — guarded Run completion and operational health are deployed/verified
**Started:** 2026-08-29

## Objective

Turn the verified v1 content pipeline into a restart-safe operating system: explicit terminal lifecycle, observable bottlenecks, bounded scheduling/concurrency/cost, and tested recovery runbooks. Human approval and explicit activation remain mandatory.

## Delivery slices

| Slice | Outcome | Status |
|---|---|---|
| 6.0 — Terminal Run lifecycle | Service-only optimistic/idempotent Run completion with exact terminal Slot and product-mapping checks | Complete |
| 6.1 — Operational observability | Run health summary, stale/bottleneck detection, counters and actionable Office/admin views | Complete |
| 6.2 — Scheduling and concurrency | Bounded leases/claims, one open scope, retry ownership and safe restart behavior | Next |
| 6.3 — Cost and workload limits | Enforced per-Run generation/asset/retry budgets with visible exhaustion reasons | Pending |
| 6.4 — Recovery and acceptance | Reconciliation/runbooks plus load, security, recovery and cost exit tests | Pending |

## 6.0 — Guarded Run completion

Repository migration: `supabase/migrations/20260829053734_question_factory_complete_run.sql`

Production migration history: `20260829053952_question_factory_complete_run`

`question_factory_complete_run` is `SECURITY INVOKER`, service-role-only and guarded by:

- exact `run_key`, `status=running` and expected Run `state_version`;
- a per-Run transaction advisory lock;
- zero non-terminal or approved Slots;
- exact `active Slot count = target_active`;
- persisted Run counters matching Slot facts;
- every active Slot linking an active product question and exact immutable product mapping;
- one globally unique idempotency key and consistent replay evidence.

On success it atomically sets `status=completed`, increments Run state version, records terminal counts in `coverage_summary`, sets `completed_at`, and appends `RUN_COMPLETED`.

## Production verification

Run `27` was the first guarded completion:

| Check | Result |
|---|---:|
| Pre-completion status/version | `running@v1` |
| Stale-version negative test | Rejected; zero event residue |
| Anonymous execute privilege | false |
| Authenticated execute privilege | false |
| Service-role execute privilege | true |
| Completion result | `completed@v2` |
| Active / pipeline-ready counters | 10 / 0 |
| Terminal / rejected / cancelled Slots | 10 / 0 / 0 |
| Completion event | `RUN_COMPLETED` event `195` |
| Same-key replay | `replayed=true`; one completion event total |
| Active questions / immutable mappings | 10 / 10 |
| Factory assets | 0 |

Security and performance advisors were run after deployment. The new function has an immutable empty `search_path`, no anonymous/authenticated execute grant and introduced no function-specific advisor finding. Pre-existing project-wide advisor notices remain outside this slice and must be triaged rather than silently attributed to this migration.

## 6.1 — Operational observability

Factory Office now derives a read-only health model from persisted Run, Slot and Event facts. The reader uses the latest event across the whole Run, so run-level facts such as `RUN_COMPLETED` are no longer hidden by a focused Slot event.

The health panel reports:

- completion readiness and terminal/non-terminal counts;
- persisted counter drift against exact Slot facts;
- blocked Slots and Run errors as critical signals;
- retry and revision pressure;
- the largest/oldest non-terminal bottleneck;
- state-aware stale thresholds: 30 minutes for active text pipeline work, 60 minutes for planned/asset work, 2 hours for approved publication work, 4 hours for author revision, and 24 hours for Human Review.

The evaluator is a pure deterministic module with verification scenarios for healthy completion, completion readiness, counter drift, stale Human Review and blocked/retry pressure. The Office panel remains observational and cannot advance state.

Production preflight against Run `27` returned `completed@v2`, terminal/active Slots 10/10, zero non-terminal/approved/blocked/retry/revision pressure, counters 10 active and 0 ready, and latest event `RUN_COMPLETED` `195`. Expected health is `healthy`, completion `completed`, and no bottleneck.

## Next gate

Phase 6.2 should add bounded worker ownership/leases and safe restart semantics without weakening the existing one-open-scope, optimistic state-version or idempotency contracts.
