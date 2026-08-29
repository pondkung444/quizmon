# Phase 7 — Production Orchestration and Command Center

**Status:** Complete
**Completed:** 2026-08-29

## Outcome

Question Factory v1 now has an admin intake and control plane at `/admin/factory-office-preview`. An authorized admin can select an approved canonical curriculum/category mapping, define the learning objective, item count, difficulty distribution and cost budget, then atomically create, start and budget one Run. The system never approves, publishes or activates content automatically.

Repository migration: `supabase/migrations/20260829065524_question_factory_phase_7_command_center.sql`

Production migration: `20260829070652_question_factory_phase_7_command_center`

Worker runtime migration: `20260829071534_question_factory_phase_7_worker_runtime`

## Contracts

- `question_factory_runs_one_open_global_idx` permits only one `created`, `running`, `paused` or `waiting_human_review` Run across the Factory. UI preflight disables intake when blocked; the database index remains the final concurrent/double-submit guard.
- `question_factory_command_run(jsonb)` holds a global transaction advisory lock and atomically creates snapshots, Run and Slots, starts the Run, and configures its immutable budget. A failed step rolls back the entire command.
- `question_factory_control_run` provides optimistic/idempotent pause, resume and cancel. Pause/cancel release active worker ownership. Cancel is refused after product mapping or activation and terminally cancels unfinished Slots.
- `question_factory_next_work_order` requires an active unexpired lease and deterministically prioritizes QC/revision before new authoring. It only returns a work order; existing Author, Question QC, Asset and Review transitions remain the mutation authority.
- Supabase Cron invokes `/api/cron/question-factory` once per minute. Each bounded invocation claims/releases a lease and processes one work order. The Gemini Author and independent Gemini QC calls return strict JSON that is revalidated by the existing candidate/QC contracts; generation reserves budget first and exact legacy duplicates are forced to revision.
- When no processable Slot remains and at least one item is awaiting review, `question_factory_mark_waiting_review` atomically moves the Run to `waiting_human_review`. The worker stops there.
- Command Center uses service-only server code and rechecks `ADMIN_EMAILS` inside every Server Action.

## Production acceptance

A rollback-only synthetic Run passed:

- atomic command creation/start/budget configuration and same-command replay;
- second open Run rejection on a different scope;
- lease claim and deterministic `START_AUTHORING` work order;
- pause with lease release, resume and cancel;
- idempotent cancel replay;
- anonymous/authenticated execute denial for all three new RPCs;
- zero fixture Run/Event residue after rollback;
- Run 27 unchanged at `completed@v2`, healthy, with 10/10 exact active mappings.

Targeted lint and the full Next.js production build passed. Supabase security/performance advisors returned no finding for the new functions or global index.

## v1 boundary

This is the final Question Factory v1 phase. The scheduled text-only worker executes the schema-validated Author/QC loop until Slots reach Human Review. Human approval, draft publication and activation remain explicit separate decisions. Visual/asset-bearing commands are not exposed by the v1 Command Center.
