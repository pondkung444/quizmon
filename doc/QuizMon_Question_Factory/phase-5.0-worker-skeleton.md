# Phase 5.0 — Minimal Factory Worker Skeleton

**Status:** Complete — initialization and first optimistic state transition deployed and smoke-verified

## Scope

Phase 5.0 establishes the restart-safe persistence boundary that later workers use. It does not generate question content, upload assets, write product `questions`, activate content, or advance a slot beyond `planned`.

The first increment consists of:

- `supabase/migrations/20260828120000_question_factory_create_run.sql` — service-only atomic initialization RPC;
- `src/lib/questionFactory/runLifecycleServer.ts` — server-only validated caller and canonical snapshot/request checksums;
- the existing Office reader — read-only projection of the persisted Run, Slots and Events.

Production migration history:

- `20260828110822_question_factory_create_run` (repository: `20260828120000_question_factory_create_run.sql`);
- `20260828111336_question_factory_start_run` (repository: `20260828123000_question_factory_start_run.sql`).

Supabase assigned the production history timestamps when applying the reviewed repository migrations.

## Initialization transaction

One call creates or reuses immutable profile and blueprint snapshots, creates one Run, creates every planned Slot, and appends `RUN_CREATED` plus one `SLOT_PLANNED` event per slot. All writes commit together or all roll back.

The caller supplies a stable UUID `runKey` when retrying. The RPC serializes the key with a transaction advisory lock and stores a checksum of the full normalized request in the `RUN_CREATED` event. A retry with the same key and checksum returns the existing Run; reuse of the key for different input fails closed.

The database's partial unique scope index remains the authority preventing two open Runs for the same scope.

## Security boundary

- Function execution is revoked from `public`, `anon` and `authenticated`.
- Only `service_role` receives EXECUTE.
- The function uses invoker rights and an empty `search_path`; all referenced objects are schema-qualified.
- Clients cannot supply snapshot IDs, Run IDs, Slot IDs, event IDs, or current-state counters.
- No service credential may enter client code or browser requests.

## First optimistic transition

`question_factory_start_run` transitions only `created → running`. It requires the caller's expected `state_version`, increments that version, records `started_at`, and appends `RUN_STARTED` in the same transaction. A stable event idempotency key makes an exact retry return the existing result without another event; a stale version or invalid source state fails closed.

## Deployment smoke matrix — passed 2026-08-28

The migration was applied only after the empty-table/function preflight. The following tests then passed against production. Valid data was created inside an explicit transaction and rolled back; the failure cases used statement/subtransaction rollback.

| Test | Expected result |
|---|---|
| valid initialization | one Run, N Slots, N+1 events, pinned snapshot pair |
| exact retry with same `runKey` | same Run ID, `replayed=true`, no extra rows/events |
| same `runKey`, changed request | rejected, no mutation |
| overlapping open scope with different `runKey` | rejected by open-scope unique index |
| duplicate slot key or ordinal | rejected before writes |
| slot count differs from target | rejected before writes |
| incompatible/malformed scope | rejected by server/DB contract |
| anonymous/authenticated RPC call | permission denied |
| downstream constraint failure after snapshot attempts | entire initialization rolls back, including snapshots |
| Office reload after success | reconstructs `created` Run and planned Slots from persisted truth |

Observed evidence:

- valid transaction: 1 Run, 2 planned Slots, 3 events (`RUN_CREATED` + 2 `SLOT_PLANNED`);
- exact replay returned the same Run with `replayed=true` and retained three events;
- changed-request replay, overlapping scope, duplicate slot key, slot-count mismatch, malformed scope and invalid limits all failed closed;
- `anon` received an actual `permission denied`; privilege inspection showed EXECUTE false for `anon`/`authenticated` and true for `service_role`;
- after rollback/failed calls all five Factory initialization tables remained empty: profile snapshots, blueprint snapshots, Runs, Slots and Events;
- security advisor returned no finding for `question_factory_create_run`.

## Exit gate

Phase 5.0 passed. Initialization is atomic and restart-safe, and the first transition proves the required optimistic current-state-plus-event pattern. Its smoke evidence was `created → running`, `state_version 0 → 1`, exactly one `RUN_STARTED`, exact replay without duplication, stale-version rejection, client EXECUTE denial, and 0/0/0 Runs/Slots/Events after rollback.

Phase 5.1 may now implement the existing-bank audit and deterministic locked Blueprint using these persistence primitives.
