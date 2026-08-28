# Phase 5.2 — Author → Question QC Text Loop

**Status:** Complete — deployed and rollback-smoke-verified; no product question created

## Outcome

Phase 5.2 implements the text-only Slot state machine:

```text
planned → authoring → question_qc
                       ├─ author_revision → question_qc
                       ├─ rejected
                       ├─ pending_human_review  (representation=none)
                       └─ asset_build           (asset required)
```

Every transition uses the expected Slot `state_version`, updates current state and appends one factual event in the same transaction. Candidate revisions and QC evidence live in append-only event payloads; this phase never writes `questions` or Storage.

## Repository implementation

- `src/lib/questionFactory/textCandidate.ts` — machine validation for four-choice Product Adapter v1 candidates and PASS/REVISE/REJECT evidence;
- `src/lib/questionFactory/textLoopServer.ts` — server-only Author/QC operations that load the immutable Slot before validation;
- `supabase/migrations/20260828133000_question_factory_transition_text_slot.sql` — allowed-transition, optimistic concurrency and idempotency RPC;
- `supabase/migrations/20260828134500_question_factory_enforce_revision_limit.sql` — DB trigger enforcing each Run's revision ceiling even if application validation is bypassed.

Production histories are `20260828115331_question_factory_transition_text_slot` and `20260828115514_question_factory_enforce_revision_limit`.

## Candidate invariants

- exactly four non-empty distinct choices;
- zero-based `correctIndex` within 0–3;
- non-empty question, explanation, reasoning template and Author version;
- objective, topic, difficulty, cognitive demand, archetype and representation exactly equal the immutable Blueprint Slot;
- `needsAsset` and `assetPrompt` agree with representation;
- revision is the next revision permitted by Slot history.

QC PASS contains no issues. REVISE/REJECT require issues; every REVISE issue requires an actionable repair. QC does not rewrite the candidate secretly.

## Production smoke evidence — 2026-08-28

A three-Slot disposable Run was executed inside an explicit rollback transaction:

- Slot 1: Author → QC → REVISE → revised candidate → PASS → `pending_human_review`;
- Slot 2: Author → QC → PASS → `asset_build`;
- Slot 3: Author → QC → REJECT → `rejected`;
- 16 total initialization/run/text events and exactly two `QUESTION_QC_PASS` events;
- exact transition replay returned `replayed=true` without duplication;
- stale state/version transition was rejected without mutation;
- a second revision on a Run limited to one revision was rejected by the DB trigger, leaving state `question_qc`, version 4 and revision count 1;
- `anon` and `authenticated` have no RPC EXECUTE; `service_role` does;
- after rollback, Runs/Slots/Events remained 0/0/0.

Pure contract tests also accepted a valid candidate/PASS and rejected out-of-range `correctIndex` plus evidence-free REVISE.

## Exit gate

The text loop is restart-safe, revision-limited, evidence-bearing and unable to bypass immutable Slot requirements through the server API. Phase 5.3 may now implement private asset revisions and Image Builder → Image QC transitions for Slots that end text QC in `asset_build`.
