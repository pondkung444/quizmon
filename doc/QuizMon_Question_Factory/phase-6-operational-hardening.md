# Phase 6 — Operational Hardening

**Status:** Complete — all production acceptance gates passed
**Started:** 2026-08-29

## Objective

Turn the verified v1 content pipeline into a restart-safe operating system: explicit terminal lifecycle, observable bottlenecks, bounded scheduling/concurrency/cost, and tested recovery runbooks. Human approval and explicit activation remain mandatory.

## Delivery slices

| Slice | Outcome | Status |
|---|---|---|
| 6.0 — Terminal Run lifecycle | Service-only optimistic/idempotent Run completion with exact terminal Slot and product-mapping checks | Complete |
| 6.1 — Operational observability | Run health summary, stale/bottleneck detection, counters and actionable Office/admin views | Complete |
| 6.2 — Scheduling and concurrency | Bounded leases/claims, one open scope, retry ownership and safe restart behavior | Complete |
| 6.3 — Cost and workload limits | Enforced per-Run generation/asset/retry budgets with visible exhaustion reasons | Complete |
| 6.4 — Recovery and acceptance | Reconciliation/runbooks plus load, security, recovery and cost exit tests | Complete |

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

## 6.2–6.4 — Controls and acceptance

Repository migration: `supabase/migrations/20260829061308_question_factory_phase_6_controls.sql`

Production migration history: `20260829063935_question_factory_phase_6_controls`

Production adds service-only, RLS-protected lease, budget and reservation facts. Claims have 30–900 second TTLs, rotated UUID tokens, monotonic versions, per-Run advisory locks and safe expired-lease takeover. Renew/release require exact owner, token and version. Budget limits are immutable, cannot exceed the Run's existing hard limits, and reservations atomically require an active lease plus the expected budget version. Rejected reservations persist an exhaustion reason without consuming usage.

`question_factory_reconcile_run` is read-only and checks exact counters, active product mappings, terminal consistency, expired leases and budget bounds. Factory Office displays lease ownership, usage/limits and exhaustion reason. Recovery procedures are in [phase-6-recovery-runbook.md](phase-6-recovery-runbook.md); the rollback-only harness is [phase-6-acceptance.review.sql](phase-6-acceptance.review.sql).

Production acceptance used a synthetic Run inside a transaction and rolled it back. It passed active-lease contention rejection, renewal, expired-lease takeover with token rotation, 100 sequential atomic reservations, exact limit exhaustion, exhaustion replay without double consumption, reconciliation healthy/drift detection, release/replay, and a final zero-residue check. Run `27` remained `completed@v2`, reconciled healthy with 10 exact active mappings, and received no lease/budget mutation.

All six new RPCs deny anonymous/authenticated execution and allow service role only. RLS is enabled on all three new public tables. Security and performance advisors were run after deployment. They reported no Phase 6-specific warning/error; expected informational notices remain for service-only RLS tables without public policies and newly created indexes whose production usage counters start at zero. Existing project-wide warnings remain outside this phase.

## Exit gate

Phase 6 is complete. The next product phase may schedule workers against these contracts, but must not bypass lease, budget, optimistic-version, idempotency, Human approval or explicit activation gates.
