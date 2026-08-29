# Phase 5.5 — End-to-End Dry Run

**Status:** complete on 2026-08-29  
**Scope:** disposable production verification only; no persistent Run, question activation or Storage object

## Verification design

Phase 5.5 uses two complementary boundaries:

1. `migrations/verify_question_factory_phase_5_5.review.sql` calls the real production RPC chain inside one transaction and always ends with `ROLLBACK`.
2. The protected GitHub `production-smoke-test` environment runs byte validation, deterministic Office projection and real Storage API upload/download/authorization/removal checks without exposing secrets locally.

The SQL harness deliberately uses transaction-local `storage.objects` metadata only to satisfy existing database Storage guards. It never claims to test bytes. Real bytes and cleanup are covered by the separate Storage API smoke.

## Full-flow evidence

The production transaction passed this sequence:

```text
RUN_CREATED → RUN_STARTED → SLOT_PLANNED
→ AUTHOR_STARTED → AUTHOR_COMPLETE
→ QUESTION_QC_REVISE → QUESTION_REVISED → QUESTION_QC_PASS
→ ASSET_CREATED → ASSET_QC_REGENERATE
→ ASSET_CREATED → ASSET_QC_PASS
→ HUMAN_APPROVED → PRODUCT_DRAFT_CREATED
→ ASSET_PROMOTED → QUESTION_ACTIVATED
→ ROLLBACK
```

Assertions covered:

- create/start and every publish-side mutation are exact-replay safe;
- stale state is rejected by optimistic version checks;
- Question QC revision increments and reconstructs the expected current state/event;
- failed asset revision remains immutable before a new revision is registered;
- Image QC regeneration resumes from `asset_build`;
- Human approval binds the exact question revision, mapping checksum and asset revision/checksum;
- only one draft question and immutable product mapping are created;
- promotion binds the canonical image tuple;
- activation produces the exact 14-event Slot history and final counters;
- reconnect checkpoints reconstruct revision, asset recovery and pre-activation states from persisted facts;
- final rollback leaves zero Factory, question and Storage fixture residue.

## Office reconstruction

`scripts/verify-question-factory-office-projection.mjs` reruns projections from cloned persisted inputs at five checkpoints and requires byte-for-byte equivalent output. It covers Question revision, asset regeneration, Human Review arrival, pre-activation Publisher work and successful activation.

## Storage trust boundary

The protected workflow validates:

- SVG/WebP byte guards and negative cases;
- service-only private staging upload and download;
- anonymous denial;
- exact checksum after download;
- cleanup through the Storage API and a follow-up absence probe.

The final workflow run URL is recorded after the protected run completes.

## Exit decision

Phase 5.5 passes when the SQL transaction, Office projection and protected Storage workflow all pass and production residue remains zero. The next phase is 5.6 Controlled Pilot, which requires a separately approved real curriculum scope and batch; this dry run does not authorize it.
