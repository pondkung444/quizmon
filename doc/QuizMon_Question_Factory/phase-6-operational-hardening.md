# Phase 6 — Operational Hardening

**Status:** In progress — guarded Run completion is deployed and verified
**Started:** 2026-08-29

## Objective

Turn the verified v1 content pipeline into a restart-safe operating system: explicit terminal lifecycle, observable bottlenecks, bounded scheduling/concurrency/cost, and tested recovery runbooks. Human approval and explicit activation remain mandatory.

## Delivery slices

| Slice | Outcome | Status |
|---|---|---|
| 6.0 — Terminal Run lifecycle | Service-only optimistic/idempotent Run completion with exact terminal Slot and product-mapping checks | Complete |
| 6.1 — Operational observability | Run health summary, stale/bottleneck detection, counters and actionable Office/admin views | Next |
| 6.2 — Scheduling and concurrency | Bounded leases/claims, one open scope, retry ownership and safe restart behavior | Pending |
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

## Next gate

Phase 6.1 should expose a server-derived operational health model: open/stale Runs, Slot bottlenecks, counter drift, retry/revision pressure and completion readiness. The view must remain observational; state transitions continue through guarded service-only RPCs.
