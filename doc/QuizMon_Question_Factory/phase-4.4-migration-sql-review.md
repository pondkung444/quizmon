# Phase 4.4 — Migration SQL Review

Status: **001/002/003 applied and verified in production**
Prepared: 2026-08-27  
Production target: `monschool` (`wmndxiuqzrnqbhrznmfg`)  
Production migrations:

- `20260827173713_question_factory_core`
- `20260827173827_question_factory_core_fk_indexes`
- `20260827172644_secure_questions_active_reads`
- `20260827172916_remove_question_images_anon_writes`

## 1. Deliverables

- [`001_question_factory_core.review.sql`](migrations/001_question_factory_core.review.sql) — eight Factory tables, constraints, indexes, RLS and least-privilege grants.
- [`002_questions_active_read_policy.review.sql`](migrations/002_questions_active_read_policy.review.sql) — separately deployable active-only learner read policy and client write-grant reduction.
- [`003_question_images_remove_anon_writes.review.sql`](migrations/003_question_images_remove_anon_writes.review.sql) — separately deployable removal of anonymous Storage write policies.
- [`verify_question_factory_phase_4.review.sql`](migrations/verify_question_factory_phase_4.review.sql) — read-only post-change catalog/data checks.

The `.review.sql` files remain immutable review artifacts. Executable migration-history files are stored under `supabase/migrations/`. Migration 001 required one additive follow-up index migration after the production performance advisor identified four composite foreign keys without a matching column order.

## 2. Core schema decisions

The Phase 4.1 eight-table baseline is preserved:

| Table | Mutation model |
|---|---|
| `question_factory_runs` | current state; SELECT/INSERT/UPDATE by service role |
| `question_factory_slots` | current state; SELECT/INSERT/UPDATE by service role |
| `question_factory_assets` | asset revision/promotion state; SELECT/INSERT/UPDATE by service role |
| `question_factory_events` | append-only ledger; SELECT/INSERT only |
| `question_factory_reviews` | immutable judgment/evidence rows; SELECT/INSERT only |
| `question_factory_profile_snapshots` | immutable; SELECT/INSERT only |
| `question_factory_blueprint_snapshots` | immutable; SELECT/INSERT only |
| `question_factory_product_mappings` | immutable one-slot/one-product projection; SELECT/INSERT only |

All tables use sequential `bigint identity` primary keys and timezone-aware timestamps. JSONB is constrained to the expected top-level object/array type. Text states use checks so adding a state requires an explicit migration.

## 3. Referential behavior

- All Factory internal foreign keys use `ON DELETE RESTRICT`.
- Links to `public.questions` also use `ON DELETE RESTRICT`; no Factory relationship can cascade-delete product or audit data.
- Every foreign-key access path has an index or a leftmost matching unique/composite index.
- A slot is unique by both `(run_id, slot_key)` and `(run_id, ordinal)`.
- One product question can map to only one Factory slot in v1.
- Legacy questions remain valid without a Factory mapping.

## 4. Concurrency and idempotency

- A partial unique index permits only one open run per `scope_key` across `created`, `running`, `paused`, and `waiting_human_review`.
- Runs and slots contain `state_version` for optimistic concurrency control by the worker.
- Events and reviews require globally unique idempotency keys.
- Asset revisions are unique per slot.
- Run/slot/event indexes follow the planned equality-first and time/order access patterns.

The worker must update current state with an expected `state_version` predicate and increment it in the same statement. The schema supplies the field but does not hide concurrency inside a public RPC.

## 5. Permissions and RLS

- RLS is enabled on all Factory tables.
- No `anon` or `authenticated` policies are created.
- All automatically broad table/sequence privileges are revoked from `anon` and `authenticated`.
- `service_role` receives only the operations required by the table's mutation model.
- No trigger function, view or `SECURITY DEFINER` function is introduced.
- Factory tables are not forced-RLS because the trusted service role intentionally bypasses RLS; least-privilege grants and key custody are the operative controls.

## 6. Deliberately separated migrations

The `questions` RLS change and Storage policy cleanup are not bundled with the core tables. Either may break an undiscovered client dependency, while core Factory table creation is additive.

Each security migration contains catalog preconditions matching the production state surveyed in Phase 4.2/4.3. If production drifts, it aborts rather than dropping an unfamiliar policy.

The private `question-factory-assets` bucket is **not** created by SQL. Supabase recommends treating Storage tables as read-only and using the Storage API. Bucket creation/configuration and a service-only upload/promotion test are Phase 4.5 operational steps after approval.

## 7. Review findings and open blockers

### Closed A — direct client query audit

Production logs confirmed authenticated direct reads. The later complete source audit found only one historical authenticated base-table caller: the feedback server action. Phase 4.4b changed it to derive IDs through the user's RLS-protected attempts and fetch metadata through the trusted server. The application compatibility change and migration 002 are deployed and verified. See [`phase-4.4b-002-003-completion.md`](phase-4.4b-002-003-completion.md).

### Closed B — current asset upload caller

The former uploader no longer needs attribution. Phase 4.4b added a service-authority uploader with validation, safe replacement defaults, and dry-run support. Migration 003 is applied and anonymous writes are verified blocked while public reads continue to work.

### Follow-up C — human-review authorization path

The schema intentionally does not add reviewer access. Phase 4.5 needs a concrete trusted server/operator path before real runs begin. Ordinary authenticated users must not receive Factory table access.

This follow-up does not block the now-complete core schema migration, but it does block a real Factory run and human publication flow.

## 8. Rollback position

Rollback is migration-specific:

- `002`: restore the exact surveyed legacy `read questions` policy and any revoked client write grants only if the application truly depended on them. This weakens security and is emergency-only.
- `003`: restore anonymous Storage writes only as an emergency compatibility rollback; replace the uploader promptly.
- `001`: do not casually drop Factory tables after production runs exist. Before first real run, an empty-schema rollback may drop tables in reverse dependency order. After data exists, prefer a forward fix and preserve audit history.

No executable destructive rollback script is included in Phase 4.4 to prevent accidental loss of Factory history.

## 9. Required review checklist

- [x] State lists cover the canonical v1 database transitions; finer worker milestones are represented by events.
- [x] JSONB snapshot boundaries are sufficient for the v1 core schema.
- [ ] `scope_key` normalization must be locked before the first real run.
- [x] Product mapping remains one slot → one question in v1.
- [x] Service grants match the immutable/current-state mutation split and passed a transactional service-role smoke test.
- [x] Direct client question reads are audited; the sole historical authenticated caller has a server-side compatibility fix.
- [x] A trusted replacement Storage uploader is implemented; attribution of the former uploader is no longer required.
- [ ] Trusted reviewer/server action is selected.
- [ ] Private staging bucket configuration is approved.
- [x] Core migration passed a transactional service-role smoke test; all inserted verification rows were rolled back.
- [x] Security and performance advisors were reviewed after migration; the four composite-FK index findings were fixed by `question_factory_core_fk_indexes`.
- [x] Read-only verification returned eight RLS-enabled tables, zero client grants/policies, expected service grants, zero Factory rows, and an unchanged 3,663-question count.

## 10. Phase boundary

The database migration portion of Phase 4.5 is complete. The trusted reviewer path, normalized `scope_key`, and private staging bucket remain operational prerequisites for the first real Factory run.
