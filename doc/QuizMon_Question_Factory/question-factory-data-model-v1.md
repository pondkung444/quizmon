# QuizMon Question Factory v1
## Phase 4.1 — Factory Data Model

**Status:** Draft for review  
**Depends on:**  
- `question-factory-contract-v1.md`
- `question-factory-orchestrator.md`
- `question-factory-production-contract-v1.md`
- `question-factory-profile-schema-v1.md`

**Purpose:** Design the Factory workflow data model without changing the existing `questions` product schema.

**Important:** This phase is design-only. No production migration is applied here.

---

# 1. Design Goals

The Factory data model must:

- remain separate from gameplay/product data
- preserve complete run/slot/QC/audit history
- support pause/resume/reconcile
- support idempotency
- support Blueprint/Profile version pinning
- support legacy questions
- support human review
- support future automation
- avoid overloading the `questions` table
- allow Factory implementation to evolve independently

---

# 2. Core Tables

Recommended v1 tables:

```text
question_factory_runs
question_factory_slots
question_factory_events
question_factory_reviews
question_factory_assets
question_factory_profile_snapshots
question_factory_blueprint_snapshots
question_factory_product_mappings
```

### External curriculum registry dependency — Phase 4.7 update

`public.curriculum_chapters` is a product/curriculum reference registry used to resolve the chapter selected by a Factory Profile and Blueprint. It is not a ninth Factory workflow table and does not share Run/Slot/Event lifecycle semantics.

Factory must snapshot the resolved registry identity and fields into immutable profile/blueprint and product-mapping history. A Run must not depend on a later live edit of a curriculum row to reinterpret what it was asked to produce.

The registry-to-Factory boundary is:

```text
curriculum_chapters approved row
  → stable chapter/unit key + resolved curriculum fields
  → immutable profile/blueprint snapshot
  → slots
  → immutable product-mapping snapshot
  → questions-compatible fields
```

The production registry's initial audit and required identity/uniqueness hardening are recorded in `phase-4.2-product-mapping-contract.md` and `question-factory-scope-key-v1.md`.

Optional future tables:

```text
question_factory_workers
question_factory_metrics
question_factory_legacy_mappings
```

v1 should avoid unnecessary fragmentation, but the audit model must remain explicit.

---

# 3. `question_factory_runs`

Represents one production objective.

Example:

> Fill M.1 Decimal & Fractions coverage to target.

Suggested fields:

```text
id uuid pk
run_key text unique
status text

profile_snapshot_id uuid
blueprint_snapshot_id uuid
product_mapping_snapshot_id uuid

target_min_active int
preferred_batch_size int
max_batch_size int

max_generated_items int
max_revision_per_item int
max_asset_regeneration int
max_technical_retry int

coverage_scope_key text

started_at timestamptz
paused_at timestamptz null
completed_at timestamptz null
cancelled_at timestamptz null
failed_at timestamptz null

created_at timestamptz
updated_at timestamptz

created_by uuid/text nullable
notes text nullable
```

---

# 4. Run Status

Allowed v1 states:

```text
created
auditing
blueprint_pending
ready
running
waiting_human_review
paused
completed
cancelled
failed
```

Do not reuse `questions.status` values for Factory Run state.

---

# 5. `coverage_scope_key`

Purpose:
prevent overlapping Runs from accidentally producing for the same scope.

Example:

```text
thai_basic_education_2551_rev2560:
lower_secondary:
3:
math:
similarity
```

or stable hashed form.

Recommended unique partial constraint conceptually:

```text
only one write-producing active run per coverage_scope_key
```

Implementation details deferred to Phase 4.4.

---

# 6. `question_factory_slots`

Represents atomic Blueprint production slots.

Suggested fields:

```text
id uuid pk
run_id uuid fk

slot_key text
slot_index int

status text

learning_objective_id text
topic_id text null
subtopic_id text null

cognitive_demand text null
question_archetype text null
difficulty_value text/int/jsonb
representation_type text
answer_type text
choice_count int null

slot_spec jsonb

question_id bigint null

author_attempt_count int
revision_count int
asset_revision_count int
replacement_count int

current_author_version text null
current_question_qc_version text null
current_asset_builder_version text null
current_asset_qc_version text null

created_at timestamptz
updated_at timestamptz
closed_at timestamptz null
```

`slot_spec` preserves the exact materialized specification even if profile structures later evolve.

---

# 7. Slot Status

Suggested states:

```text
unassigned
authoring
author_complete
question_qc
question_revision
question_rejected
asset_pending
asset_building
asset_qc
asset_revision
ready_for_review
human_revision
human_rejected
active
closed
blocked
```

Exact allowed transitions should be enforced by application/service logic first; database-level transition enforcement may come later.

---

# 8. Slot and Question Relationship

A Slot may produce multiple candidate attempts over time, but only one current product question should normally represent the accepted candidate.

Therefore:

```text
slot.question_id
```

is the current product record link.

Historical rejected/replaced attempts must still be preserved through events/reviews/payloads.

Do not assume one Slot always equals one immutable question_id throughout all revisions unless the chosen implementation guarantees that.

---

# 9. Candidate Persistence Strategy

Two viable strategies:

## Option A — Reuse one product question row through revisions

Pros:
- fewer product rows
- simple question_id continuity

Cons:
- harder to preserve exact historical candidate versions

## Option B — Keep product question only for current accepted candidate; store historical candidate payloads in Factory layer

Pros:
- clean `questions`
- full history in Factory

Recommended v1:

> Option B

Factory review/event records preserve candidate payload snapshots.

The product `questions` row is the current learner-facing candidate state, not the full editing history.

---

# 10. `question_factory_events`

Immutable append-only audit log.

Suggested fields:

```text
id uuid pk
run_id uuid fk
slot_id uuid null fk
question_id bigint null

event_type text
actor_type text
actor_id text null
actor_version text null

operation_id text null
reason_code text null
details jsonb

created_at timestamptz
```

Events must never be updated in normal operation.

---

# 11. Event Types

Recommended initial vocabulary:

```text
RUN_CREATED
RUN_PAUSED
RUN_RESUMED
RUN_CANCELLED
RUN_FAILED

AUDIT_STARTED
AUDIT_COMPLETE

BLUEPRINT_CREATED
BLUEPRINT_LOCKED
BLUEPRINT_REVISED

SLOT_CREATED
SLOT_ASSIGNED

AUTHOR_STARTED
AUTHOR_COMPLETE
AUTHOR_BLOCKED

QUESTION_QC_PASS
QUESTION_QC_REVISE
QUESTION_QC_REJECT

QUESTION_REVISION_STARTED
QUESTION_REVISED
QUESTION_REPLACEMENT_CREATED

ASSET_BUILD_STARTED
ASSET_CREATED
ASSET_BUILD_BLOCKED

ASSET_QC_PASS
ASSET_QC_REGENERATE
ASSET_QC_REJECT

ITEM_READY_FOR_REVIEW
HUMAN_APPROVED
HUMAN_REVISION_REQUESTED
HUMAN_REJECTED

QUESTION_ACTIVATED
QUESTION_DEACTIVATED

COVERAGE_RECOUNTED
RUN_COMPLETED

RECONCILIATION_STARTED
RECONCILIATION_DRIFT_FOUND
RECONCILIATION_COMPLETE

TECHNICAL_RETRY
```

---

# 12. Event Immutability

Events are audit records.

Rules:
- insert-only
- no edit
- no delete in normal workflow
- corrections create a new event

This preserves traceability.

---

# 13. `question_factory_reviews`

Stores structured reviewer decisions.

Suggested fields:

```text
id uuid pk
run_id uuid fk
slot_id uuid fk
question_id bigint null

review_type text
reviewer_type text
reviewer_version text null

decision text
severity_summary text null
issues jsonb
evidence jsonb null

candidate_snapshot jsonb null
human_note text null

review_round int
created_at timestamptz
```

---

# 14. Review Types

```text
question_qc
asset_qc
human_review
```

Possible future:
```text
curriculum_review
duplicate_review
security_review
```

---

# 15. Review Decisions

Question QC:

```text
PASS
REVISE
REJECT
```

Asset QC:

```text
PASS
REGENERATE
REJECT_ASSET
```

Human:

```text
APPROVE
REQUEST_REVISION
REJECT
```

Do not overload one decision vocabulary across different review types without `review_type`.

---

# 16. Why Reviews Separate from Events

Events answer:

> What happened?

Reviews answer:

> What judgment was made and why?

Example:

```text
QUESTION_QC_REVISE
```

event references a detailed `question_factory_reviews` row containing:
- issues
- evidence
- candidate snapshot

This keeps event log concise but audit detail rich.

---

# 17. `question_factory_assets`

Tracks generated representation revisions.

Suggested fields:

```text
id uuid pk
run_id uuid fk
slot_id uuid fk
question_id bigint fk

asset_revision int
representation_type text

filename text
content_type text
storage_url text
bytes int null

generation_prompt text null
structured_asset_spec jsonb null

asset_standard_id text null
asset_standard_version text null

builder_version text null

status text

created_at timestamptz
superseded_at timestamptz null
```

---

# 18. Asset Status

Suggested:

```text
created
qc_pass
qc_failed
superseded
blocked
```

Product `questions.image_url` should point only to the currently approved asset when applicable.

---

# 19. Asset Revision Policy

Factory must retain old asset metadata even when a new asset replaces it.

Do not lose:
- original prompt
- revision number
- old URL
- QC outcome

Whether old physical files remain in Storage is a separate retention policy.

---

# 20. `question_factory_profile_snapshots`

Stores resolved Profile snapshots used by Runs.

Suggested fields:

```text
id uuid pk
profile_id text
profile_version text

resolved_profile jsonb

source_hash text null
created_at timestamptz
```

A Run points to this immutable snapshot.

---

# 21. Why Snapshot Profiles

Profile inheritance can change later.

Run history must still answer:

> Which exact resolved Profile rules did this Run use?

Therefore store the materialized resolved Profile, not only a pointer to mutable config.

---

# 22. `question_factory_blueprint_snapshots`

Stores immutable Blueprint versions.

Suggested fields:

```text
id uuid pk
run_id uuid fk

blueprint_id text
blueprint_version int/text

blueprint_json jsonb
revision_reason text null

created_at timestamptz
supersedes_id uuid null
```

Run points to current pinned snapshot.

Blueprint revisions create a new row.

---

# 23. Blueprint Revision Behavior

When Blueprint changes:

- existing active questions remain
- filled slots remain historically linked
- unfilled remaining slots may be rebalanced
- prior blueprint remains immutable
- revision reason is mandatory

---

# 24. `question_factory_product_mappings`

Stores resolved Product Mapping snapshot.

Suggested fields:

```text
id uuid pk

mapping_profile_id text
mapping_profile_version text

factory_scope jsonb
product_mapping jsonb

created_at timestamptz
```

Example:

```json
{
  "factory_scope": {
    "subject": "physics",
    "education_stage": "upper_secondary"
  },
  "product_mapping": {
    "grade_band": "senior",
    "subject": "math",
    "branch": "physics"
  }
}
```

---

# 25. Why Product Mapping Snapshot

Current product taxonomy may change later.

Historical Runs must remain explainable.

A mapping snapshot answers:

> Why did this Physics question get written as `subject=math, branch=physics`?

---

# 26. Candidate Snapshot Storage

To preserve rejected/revised versions without bloating `questions`, structured candidate snapshots may live in:

```text
question_factory_reviews.candidate_snapshot
```

or events/details.

Recommended:
- reviews store candidate being judged
- author completion event stores author output metadata
- accepted current candidate is written to `questions`

This is enough for v1 auditability without creating a separate candidate table.

---

# 27. Optional Future `question_factory_candidates`

If v1 review shows candidate history becoming complex, add:

```text
question_factory_candidates
```

later.

Do not create it prematurely unless actual workflow needs it.

Possible future fields:
```text
candidate_id
slot_id
revision
payload
author_version
status
created_at
```

---

# 28. Legacy Question Coverage

Existing 3,663 product questions mostly have no Factory Run/Slot.

They must remain valid.

Factory audit may map them through a future table:

```text
question_factory_legacy_mappings
```

Possible fields:

```text
question_id
profile_id
learning_objective_id
topic_id
cognitive_demand
question_archetype
mapping_source
mapping_confidence
reviewed_by
```

This table is optional and should not be required for Phase 4 migration.

---

# 29. Idempotency Model

Every repeatable worker operation must have a stable `operation_id`.

Examples:

```text
run42:slot017:author:v1
run42:slot017:question-qc:v1
run42:slot017:asset-build:r2
```

Recommended database uniqueness:

```text
unique(operation_id)
```

where applicable in event/operation records.

If the same successful operation is received again:
- reuse existing result
- do not duplicate insert

---

# 30. Where to Enforce Idempotency

Recommended:
- Orchestrator service logic
- database unique constraints for critical operation identifiers

Do not rely on LLM/worker memory.

---

# 31. Run Limits

Persist Run guardrails in `question_factory_runs`.

Examples:

```text
max_generated_items
max_revision_per_item
max_asset_regeneration
max_technical_retry
```

These must survive pause/resume.

---

# 32. Reconciliation Data

Reconciliation should compare:

```text
Run/Slot expected state
questions actual status
approved asset actual reference
storage object presence
human review outcome
```

Drift is recorded as events.

Do not maintain a separate duplicate “current truth” table unless necessary.

---

# 33. Current State vs Event Sourcing

Recommended v1 pattern:

```text
current state columns
+ append-only events
```

not pure event sourcing.

Example:
- `runs.status` gives fast current lookup
- events give historical explanation

This is simpler and practical for v1.

---

# 34. Transactions

Important transitions should be transactional where possible.

Example Human Approve flow:

```text
verify human approval
→ update questions.status = active
→ update slot.status = active
→ insert HUMAN_APPROVED event
→ insert QUESTION_ACTIVATED event
```

Should commit atomically where implementation permits.

---

# 35. Human Review Ownership

Human review record should preserve:

```text
reviewer identity/reference
decision
note
timestamp
```

Even if current implementation has one owner/operator.

Do not hardcode a single person forever.

---

# 36. Actor Model

`actor_type` may include:

```text
orchestrator
author
question_qc
asset_builder
asset_qc
human
system
```

`actor_id` can be nullable for automated components.

`actor_version` preserves skill/model version.

---

# 37. Run Summary Metrics

Runs should persist or derive:

```text
initial_active_count
current_active_count
generated_count
qc_pass_count
qc_revise_count
qc_reject_count
asset_required_count
asset_pass_count
pending_review_count
human_approved_count
human_rejected_count
```

Recommendation:

> derive from events/slots where practical rather than storing many mutable counters initially.

Only persist counters if performance requires it.

---

# 38. Coverage State

Coverage may be stored as latest JSON snapshot on Run for convenience:

```text
latest_coverage_snapshot jsonb
latest_coverage_at timestamptz
```

But source should remain:
- active questions
- Profile/Blueprint mapping

Coverage snapshot is cache, not ultimate truth.

---

# 39. Coverage Snapshot Example

```json
{
  "active_quantity": 65,
  "minimum_target": 80,
  "coverage_percent": 76,
  "learning_objectives": {
    "LO_01": {"active": 5, "target": 5},
    "LO_02": {"active": 7, "target": 10}
  },
  "cognitive_mix": {
    "apply": 42,
    "analyze": 18
  }
}
```

---

# 40. Index Strategy

Likely useful indexes:

```text
question_factory_runs(status)
question_factory_runs(coverage_scope_key)

question_factory_slots(run_id, status)
question_factory_slots(question_id)

question_factory_events(run_id, created_at)
question_factory_events(slot_id, created_at)
question_factory_events(operation_id)

question_factory_reviews(slot_id, review_type, created_at)

question_factory_assets(question_id, asset_revision)
```

Exact indexes deferred to Phase 4.4 after query patterns are finalized.

---

# 41. Foreign Key Strategy

Recommended:

```text
slots.run_id → runs.id
events.run_id → runs.id
events.slot_id → slots.id
reviews.run_id → runs.id
reviews.slot_id → slots.id
assets.run_id → runs.id
assets.slot_id → slots.id
```

Links to `questions.id` should normally use:

```text
ON DELETE RESTRICT / NO ACTION
```

not cascade.

Factory history should not disappear if product data is accidentally changed.

---

# 42. Delete Policy

Factory workflow records should not be physically deleted during normal operation.

Use:
- completed
- cancelled
- superseded
- inactive references

Retention/archive policy can come later.

---

# 43. RLS Intent

Factory tables should not be learner-readable/writable by default.

Desired security direction:

```text
learner/client:
  no direct Factory access

server/service:
  controlled read/write

admin/operator:
  reviewed management access
```

Exact RLS policies are Phase 4.3.

---

# 44. Product Question Draft Visibility

Because `questions` can contain `draft/pending_review`, Factory implementation must ensure learner-facing reads cannot expose them.

This is not solved solely by Factory tables.

Phase 4.3 must audit:
- RLS
- direct client queries
- RPC filters

---

# 45. JSONB vs Columns

Use columns for fields frequently queried/routed on:

```text
status
run_id
slot_id
question_id
event_type
review_type
decision
representation_type
```

Use JSONB for:
- resolved Profile
- Blueprint
- slot_spec
- issues
- evidence
- structured asset spec
- coverage snapshot

Do not put everything in JSONB.

---

# 46. Schema Naming

Recommended prefix:

```text
question_factory_
```

This clearly separates Factory infrastructure from gameplay tables.

Avoid generic names such as:
```text
runs
items
events
```

---

# 47. Minimal v1 Table Set

If we want the smallest robust v1, use:

```text
question_factory_runs
question_factory_slots
question_factory_events
question_factory_reviews
question_factory_assets
question_factory_profile_snapshots
question_factory_blueprint_snapshots
question_factory_product_mappings
```

Eight tables.

This is the recommended baseline.

---

# 48. Why Eight Tables Is Acceptable

Each table has a distinct durable responsibility:

```text
runs       = objective/current run state
slots      = atomic production state
events     = immutable history
reviews    = structured judgments
assets     = representation versions
profiles   = pinned rules
blueprints = pinned coverage plan
mappings   = product compatibility
```

Combining them would either:
- overload JSON blobs
- lose queryability
- lose audit clarity

---

# 49. What Does NOT Go in Factory Tables

Learner attempts remain:

```text
quiz_attempts
```

Gameplay question content remains:

```text
questions
```

Dungeon/Raid data remains unchanged.

Factory should not duplicate learner behavior data.

---

# 50. Example Run Trace

```text
question_factory_runs
  run_42

question_factory_profile_snapshots
  thai_math_m1_decimal_fraction@1.0.0

question_factory_blueprint_snapshots
  bp_42@1

question_factory_product_mappings
  junior_math_mapping@1

question_factory_slots
  slot_017

question_factory_events
  AUTHOR_COMPLETE
  QUESTION_QC_REVISE
  QUESTION_REVISED
  QUESTION_QC_PASS
  ITEM_READY_FOR_REVIEW
  HUMAN_APPROVED
  QUESTION_ACTIVATED

question_factory_reviews
  QC round 1
  QC round 2
  Human approval

questions
  q4120 status=active
```

---

# 51. Failure Example

If Storage upload fails:

```text
slot.status = asset_building
event = TECHNICAL_RETRY
```

Retry with same operation_id.

No new slot.
No new question.

After max retry:
```text
run may pause/fail safely
```

---

# 52. Replacement Example

If QC rejects candidate:

```text
review = REJECT
event = QUESTION_QC_REJECT
slot remains required
replacement_count += 1
new Author operation for same slot
```

Coverage does not drift.

---

# 53. Human Reject Example

If Human rejects:

```text
review_type = human_review
decision = REJECT
slot = human_rejected
```

If Blueprint still requires slot:

```text
replacement candidate generated for same slot
```

The prior question should not become active.

---

# 54. Acceptance Criteria for Phase 4.1

The Data Model passes only if it can support:

1. one Run with 80 target active questions
2. Profile pinned during Run
3. Blueprint revised mid-Run
4. same Slot revised twice
5. rejected candidate replaced without changing coverage
6. SVG asset regenerated twice
7. Human approval per question
8. batch approval converted to per-item records
9. pause/resume
10. technical retry without duplicate question
11. overlapping Run lock via scope key
12. current-state lookup without replaying all events
13. complete audit history
14. legacy questions with no Factory Run
15. future product taxonomy remapping
16. migration without modifying existing 3,663 questions

---

# 55. Locked Decisions for 4.1

Recommended to lock:

1. Use current-state tables plus append-only events.
2. Atomic production unit is `question_factory_slots`.
3. Keep `questions` as product data only.
4. Preserve exact Profile/Blueprint/Product Mapping snapshots.
5. Store structured reviewer decisions separately from event log.
6. Track asset revisions independently.
7. Use Product Mapping snapshots to bridge Factory semantics and legacy QuizMon schema.
8. Do not require a candidate table in v1.
9. Do not require legacy-mapping table in initial migration.
10. Use server-side authorization for Factory tables.
11. Prefer non-destructive retention.
12. Use JSONB only for complex versioned payloads, not core routing fields.

---

# 56. Proposed Next Step — Phase 4.2

Phase 4.2 should define the **Product Mapping Adapter** in detail:

```text
Factory Profile
→ Product Mapping Profile
→ validated questions payload
```

It should lock:
- education-stage → grade_band
- subject → subject/branch
- grade → grade_level
- chapter/topic → chapter/category
- difficulty mapping
- answer format compatibility
- image field mapping
- legacy senior compatibility

No production change should occur until 4.2, 4.3, and 4.4 are reviewed.

---

**Phase 4.1 Status:** Ready for human review
