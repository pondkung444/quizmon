# QuizMon Question Factory v1
## Phase 2.1 — `question-factory-orchestrator` Skill

**Status:** Draft for review  
**Depends on:** `question-factory-contract-v1.md`  
**Role:** Factory Manager / deterministic state-machine controller  
**Scope:** Coordination only — does not author, solve, review, or publish questions by itself

---

# 1. Purpose

`question-factory-orchestrator` is the central coordination skill for QuizMon Question Factory v1.

Its job is to:

- initialize and control Factory Runs
- pin immutable profile and blueprint versions to each run
- audit the live question bank
- calculate coverage gaps
- create Blueprint Slots
- route each slot to the correct worker/reviewer
- enforce independent QC gates
- manage revision and replacement loops
- coordinate asset generation and asset QC
- move qualified items to `pending_review`
- pause and wait for human decisions
- process human approve / revise / reject actions
- activate only after explicit human approval
- recount coverage
- finish a run only when both quantity and coverage requirements are satisfied
- maintain idempotency, audit logs, and resumable state

The Orchestrator must behave primarily as a deterministic workflow controller.

> It is a state machine, not a content-generation agent.

---

# 2. Hard Boundaries

The Orchestrator MUST NOT:

- author question content
- rewrite question content directly
- calculate or verify the correct answer itself
- judge curriculum correctness itself
- judge question quality itself
- generate diagrams/images itself
- judge image correctness itself
- bypass Question QC
- bypass Asset QC
- change `pending_review → active` without a valid human approval event
- silently alter a frozen Blueprint
- silently switch Curriculum Profile versions mid-run
- mark a run complete from question count alone

All content decisions must be delegated to specialized workers/reviewers.

---

# 3. Source-of-Truth Separation

The Orchestrator must treat the system as three separate truth domains.

## 3.1 Product Question Bank

`questions` is the source of truth for questions that exist in QuizMon.

Typical product states:

```text
draft
pending_review
active
inactive
```

## 3.2 Factory Workflow

Factory workflow tables are the source of truth for:

- current run state
- slot state
- worker attempts
- revision history
- QC results
- human review history
- event history

## 3.3 Curriculum / Content Profile

The versioned Curriculum Profile + Blueprint is the source of truth for:

> what the Factory is supposed to produce

These three domains must not be treated as interchangeable.

---

# 4. Run Input Contract

A new Factory Run must include a normalized Run Request.

Example:

```yaml
run_request:
  profile_id: thai_math_m1_decimal_fraction
  profile_version: 1.0

  target:
    type: coverage_target
    minimum_active: 80

  batch_policy:
    preferred_size: 10
    max_size: 20

  review_policy:
    human_required: true

  quality_policy:
    duplicate_check: true
    independent_question_qc: true
    independent_asset_qc: true

  limits:
    max_generated_items: 120
    max_revision_per_item: 2
    max_technical_retry: 3
```

Fields such as grade, subject, answer type, choice count, and difficulty scale must come from the Profile, not from assumptions inside the Orchestrator.

---

# 5. Version Pinning — HARD RULE

When a Run starts, the Orchestrator must pin:

```text
profile_id
profile_version
blueprint_id
blueprint_version
```

These versions remain fixed for that Run unless an explicit Blueprint Revision Event occurs.

If a curriculum profile is updated while a Run is active:

- the current Run keeps its pinned version
- new Runs may use the newer version

This prevents one Run from producing different batches under different rules without traceability.

---

# 6. Run Lifecycle

Supported Run states:

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

Recommended state progression:

```text
created
  ↓
auditing
  ↓
blueprint_pending
  ↓
ready
  ↓
running
  ↓
waiting_human_review
  ↓
running
  ↓
completed
```

Runs may also transition to:

```text
paused
cancelled
failed
```

All state changes must create an event record.

---

# 7. Run Initialization

When a Run is created, the Orchestrator must:

1. validate the requested Profile exists
2. pin Profile version
3. check whether an overlapping active Run already holds the same coverage scope
4. acquire a `coverage_scope_lock`
5. create the Run record
6. begin audit

Example coverage lock:

```text
curriculum_system
+ education_stage
+ grade
+ subject
+ chapter/topic/profile scope
```

The exact lock granularity may vary by Profile.

The goal is to prevent accidental double-production of the same coverage scope.

---

# 8. Existing Bank Audit

Before Blueprint construction, the Orchestrator must audit the current bank.

Audit inputs should include:

- active questions
- pending_review questions
- draft Factory questions associated with relevant Runs
- inactive questions when useful for reuse analysis
- learning objective metadata
- cognitive demand
- archetype
- representation
- difficulty
- duplication/template clusters where available

The audit must distinguish:

```text
active_coverage
pipeline_coverage
```

Example:

```text
Active: 65
Pending review: 15

active_quantity = 65
pipeline_ready_quantity = 80
```

The Factory must never report the target as achieved until required questions are actually `active`.

---

# 9. Blueprint Handling

## 9.1 Blueprint Required Before Authoring

No question slot may be sent to an Author before a Blueprint is available and locked.

## 9.2 Blueprint Structure

A Blueprint should specify required distribution across dimensions such as:

- learning_objective
- topic / subtopic
- cognitive_demand
- question_archetype
- difficulty
- representation_type
- answer_type
- optional subject-specific dimensions

## 9.3 Blueprint Versioning

Blueprints must be immutable after locking.

Changes require:

```text
BLUEPRINT_REVISION_REQUESTED
→ Blueprint vN+1 created
→ revision reason logged
→ remaining unfilled slots regenerated/rebalanced
```

Already active questions must not be silently remapped to make metrics appear complete.

---

# 10. Blueprint Slot Model

The fundamental production unit is a **Blueprint Slot**, not “one random question”.

Example:

```yaml
slot_id: run42-slot017

learning_objective: LO_03
topic: proportional_reasoning
cognitive_demand: analyze
question_archetype: application
difficulty: 3
representation_type: none
answer_type: single_choice
```

The Author’s job is to produce a question that satisfies the slot.

If the question is rejected:

> the slot remains unfilled

The Orchestrator requests a replacement for the same slot.

This prevents rejection/retry from changing the intended coverage distribution.

---

# 11. Slot Lifecycle

Suggested slot states:

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
```

Not all slots use every state.

For a no-image question:

```text
unassigned
→ authoring
→ author_complete
→ question_qc
→ ready_for_review
→ active
```

For an image question:

```text
unassigned
→ authoring
→ author_complete
→ question_qc
→ asset_pending
→ asset_building
→ asset_qc
→ ready_for_review
→ active
```

---

# 12. Author Routing

For each unfilled slot:

1. build Author Input Package
2. include pinned Profile context
3. include exact Blueprint Slot
4. include relevant existing-bank examples for duplicate avoidance
5. include authoring skill version
6. create idempotency key
7. invoke Author worker
8. validate Author output schema
9. persist result
10. route to Question QC

Example operation key:

```text
RUN42-SLOT017-AUTHOR-V1
```

If the same operation is retried technically, it must not create a second question unintentionally.

---

# 13. Question QC Routing

Question QC receives:

- candidate question
- slot specification
- relevant curriculum/profile rules
- subject QC profile
- relevant existing-bank context
- QC skill version

Allowed QC outcomes:

```text
PASS
REVISE
REJECT
```

The Orchestrator must not reinterpret QC content judgment.

It only routes based on the structured result.

---

# 14. Revision Logic

## 14.1 REVISE

When QC returns `REVISE`:

1. increment revision_count
2. log QC issues
3. send candidate + issues back to Author
4. Author revises
5. route revised version to independent QC again

Default:

```text
max_revision_per_item = 2
```

## 14.2 Revision Limit Reached

If the revision limit is exceeded:

```text
candidate → rejected
slot → unfilled
replacement authoring request created
```

The replacement must still target the same Blueprint Slot.

## 14.3 REJECT

When QC returns `REJECT` immediately:

- do not patch the rejected item indefinitely
- retain it for audit
- create replacement for the slot

---

# 15. Asset Routing

Only questions with `Question QC = PASS` may enter Asset Routing.

The Orchestrator reads `representation_type`.

Examples:

```text
none
svg_geometry
svg_graph
svg_scientific_diagram
svg_circuit
svg_structure
table
equation
webp_real_image
```

Routing examples:

```text
none → ready_for_review

svg_* → Image/Diagram Builder

webp_real_image → Raster Asset Builder

table/equation → structured renderer or supported asset worker
```

The Orchestrator must not assume all visual representations are images.

---

# 16. Asset Builder Routing

Asset Builder Input Package should contain:

```yaml
question_id:
question_text:
representation_type:
image_prompt:
asset_standard_version:
profile_context:
```

Asset output should include:

```yaml
question_id:
filename:
asset_url:
asset_type:
representation_type:
generation_prompt:
```

For QuizMon images:

- filename based on question_id
- uploaded to Supabase Storage
- DB stores URL/reference only
- Base64 must not be used as persistent `image_url`

---

# 17. Asset QC Routing

Asset QC receives:

- question
- generated asset
- generation prompt
- asset standard
- representation requirements

Allowed outcomes:

```text
PASS
REGENERATE
REJECT_ASSET
```

## PASS

Move slot toward human review.

## REGENERATE

Return specific asset issues to Builder and regenerate.

Asset regeneration should also have configurable limits.

## REJECT_ASSET

Route back to Orchestrator for representation reassessment.

Example:

> The question does not actually need an image.

Or:

> The requested representation is structurally inconsistent with the question.

---

# 18. Machine Validation Gate

Before a question can become `pending_review`, run deterministic validation.

Examples:

- required fields exist
- answer structure matches Profile
- correct_index is in range
- `needs_image=true` implies valid asset URL
- persistent image_url is not Base64/data URI
- image filename matches question_id
- image_prompt exists when required
- expected representation metadata exists
- status transition is legal
- question belongs to current Run/Slot
- both QC gates have PASS when required

Only after validation succeeds may the Orchestrator mark the item:

```text
ready_for_review
```

and the product question:

```text
draft → pending_review
```

---

# 19. Human Review Handling

Human review has precedence over all agent decisions.

Priority:

```text
Human Decision
> Reviewer Decision
> Author Output
```

Supported Human actions:

```text
APPROVE
REQUEST_REVISION
REJECT
```

## APPROVE

The Orchestrator validates the approval event, then allows:

```text
pending_review → active
```

## REQUEST_REVISION

The item returns to a revision path with the human note attached.

Even if all agents previously passed it, human feedback wins.

## REJECT

The item is retained for audit.

If its Blueprint Slot is still required:

> create a replacement item for the same slot

---

# 20. Batch Human Review

Human may review an entire batch at once.

Example:

```text
Approve all except q7
```

The Orchestrator must convert batch actions into individual item-level review events.

Each question retains its own:

- approval result
- reviewer note
- timestamp

---

# 21. Dynamic Batch Sizing

Batch size is policy-driven, not fixed.

Inputs:

```text
preferred_batch_size
max_batch_size
remaining_slots
representation_complexity
current_rejection_rate
human_review_backlog
```

Example behavior:

- simple text MCQ → batch 15–20
- mixed standard questions → batch 10
- diagram-heavy physics → batch 5
- image-heavy biology → batch 3–5
- only 3 remaining slots → batch 3

Before every batch:

```text
recount
→ calculate remaining slots
→ generate only needed slots
```

This prevents over-production.

---

# 22. Coverage Recount

After human-approved items become active:

1. query current production truth
2. remap active questions against pinned Blueprint
3. update quantity metrics
4. update coverage metrics
5. determine remaining slots

Keep at least two progress metrics:

```text
quantity_progress
coverage_progress
```

Example:

```text
quantity_progress = 80 / 80
coverage_progress = 92%
```

In this case the Run is **not complete**.

The Orchestrator may produce more than the minimum quantity if necessary to close coverage gaps.

---

# 23. Run Completion

A Run can transition to `completed` only when:

1. minimum active target reached
2. required learning objective coverage reached
3. required cognitive mix is within tolerance
4. required archetype mix is within tolerance
5. required representation mix is within tolerance
6. required difficulty mix is within tolerance when configured
7. no required Blueprint Slots remain unresolved
8. no required human-review replacement remains outstanding

Completion must be a deterministic rules check.

---

# 24. Pause / Resume

The Factory must support long-running workflows.

A Run may be paused manually or automatically.

On Resume:

1. reload pinned Profile/Blueprint
2. load current Factory state
3. reconcile with live Product DB
4. restore locks
5. identify incomplete operations
6. resume only from valid state

Do not start a new audit from scratch in a way that loses history.

---

# 25. Reconciliation

The Orchestrator must provide a reconciliation procedure.

Purpose:

compare:

```text
Factory expected state
vs
Product DB actual state
vs
Asset storage state
```

Examples of drift:

- Factory says pending_review but product DB says inactive
- Factory says asset uploaded but URL returns missing
- human manually activated a question outside Factory

Reconciliation should:

- detect drift
- report drift
- record reconciliation event

It must not silently overwrite human/manual changes without policy.

---

# 26. Technical Retry Policy

Technical failures include:

- DB timeout
- Storage upload failure
- worker invocation failure
- network/service failure

Default:

```text
max_technical_retry = 3
```

Retry must use the same idempotency key.

A technical retry must never be interpreted as a request for a brand-new content item.

---

# 27. Content Failure vs Technical Failure

These must remain separate.

## Technical Failure

```text
same operation
same intended output
retry
```

## Content Failure

```text
QC_REVISE
QC_REJECT
HUMAN_REVISION
HUMAN_REJECT
```

Content failures go through revision/replacement logic, not infrastructure retry logic.

---

# 28. Limits and Guardrails

Each Run should support resource limits.

Example:

```yaml
limits:
  max_generated_items: 120
  max_revision_per_item: 2
  max_asset_regeneration: 2
  max_technical_retry: 3
```

Future extensions:

```text
max_model_cost
max_asset_cost
max_runtime
```

If a limit is reached:

- pause or fail the Run safely
- report reason
- do not continue generating indefinitely

---

# 29. Concurrency Control

Overlapping Runs must not accidentally fill the same coverage gap independently.

The Orchestrator should enforce a `coverage_scope_lock`.

Default behavior:

```text
one active write-producing Run per coverage scope
```

Future versions may allow concurrent Runs only when non-overlapping Blueprint Slots can be proven.

---

# 30. Event Model

Every meaningful transition produces an event.

Recommended event vocabulary:

```text
RUN_CREATED
RUN_PAUSED
RUN_RESUMED
RUN_CANCELLED

AUDIT_STARTED
AUDIT_COMPLETE

BLUEPRINT_CREATED
BLUEPRINT_LOCKED
BLUEPRINT_REVISION_REQUESTED
BLUEPRINT_REVISED

SLOT_CREATED
SLOT_ASSIGNED

AUTHOR_STARTED
AUTHOR_COMPLETE

QUESTION_QC_PASS
QUESTION_QC_REVISE
QUESTION_QC_REJECT

QUESTION_REVISION_STARTED
QUESTION_REVISED
QUESTION_REPLACEMENT_CREATED

ASSET_BUILD_STARTED
ASSET_CREATED

ASSET_QC_PASS
ASSET_QC_REGENERATE
ASSET_QC_REJECT

ITEM_READY_FOR_REVIEW
HUMAN_APPROVED
HUMAN_REVISION_REQUESTED
HUMAN_REJECTED

QUESTION_ACTIVATED

COVERAGE_RECOUNTED
RUN_COMPLETED

RECONCILIATION_STARTED
RECONCILIATION_DRIFT_FOUND
RECONCILIATION_COMPLETE

TECHNICAL_RETRY
RUN_FAILED
```

An event bus is not required in v1.

But the workflow model should be event-oriented from the beginning.

---

# 31. Event Record Contract

Example:

```json
{
  "event_id": "evt_...",
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "question_id": 4120,
  "event_type": "QUESTION_QC_REVISE",
  "actor_type": "question_qc",
  "actor_version": "question-qc-v1",
  "reason_code": "DISTRACTOR_WEAK",
  "details": {
    "issues": ["..."]
  },
  "created_at": "..."
}
```

Every state transition must be explainable by one or more events.

---

# 32. Idempotency

All external or repeatable operations must have stable idempotency keys.

Recommended format:

```text
{run_id}:{slot_id}:{operation}:{version}
```

Examples:

```text
run42:slot017:author:v1
run42:slot017:question-qc:v1
run42:slot017:asset-build:v2
```

Before executing an operation, check whether a successful result already exists for the same key.

---

# 33. Orchestrator Output to Human

The Orchestrator should summarize, not dump internal logs.

Example:

```text
Run #42 — M.1 Decimal & Fractions

Active coverage: 36 / 80
Coverage completeness: 44%

Current batch
Generated: 12

Question QC
Pass: 10
Revision: 1
Rejected: 1

Assets
Required: 3
Asset QC passed: 3

Pending human review: 10
```

Detailed logs should remain available for debugging.

---

# 34. Deterministic vs AI Responsibilities

## Must be deterministic/rule-based

- state transitions
- counts
- slot tracking
- coverage arithmetic
- retry policy
- revision limits
- idempotency
- lock handling
- batch sizing policy
- machine validation
- completion checks
- reconciliation bookkeeping

## May use AI/judgment workers

- curriculum interpretation
- Blueprint proposal
- question authoring
- question quality reasoning
- subject-specific correctness review
- semantic image review

The Orchestrator should consume structured results from these workers rather than replacing their roles.

---

# 35. Worker Result Envelope

All worker skills should eventually return a standard envelope.

Example:

```json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "worker_type": "question_qc",
  "worker_version": "question-qc-v1",
  "operation_id": "run42:slot017:question-qc:v1",
  "status": "success",
  "decision": "PASS",
  "payload": {},
  "issues": [],
  "created_at": "..."
}
```

This envelope allows the Orchestrator to route workers consistently.

---

# 36. Failure Handling Rules

The Orchestrator must fail safely.

It must stop/pause rather than guess when:

- pinned Profile cannot be loaded
- Blueprint version is missing
- item state is impossible
- duplicate operation results conflict
- human decision conflicts with data state
- coverage cannot be reconciled
- required reviewer result is missing
- critical resource limit exceeded

Uncertain workflow state must never be resolved by silently publishing content.

---

# 37. Required Audit Fields

At minimum, the Orchestrator must preserve enough information to answer:

> Where did this question come from and why was it published?

Required trace chain:

```text
Run
→ Profile version
→ Blueprint version
→ Blueprint Slot
→ Author version
→ Author output
→ Revision history
→ Question QC decisions
→ Asset generation history
→ Asset QC decisions
→ Human decision
→ Activation event
```

---

# 38. Orchestrator Skill Inputs

Normalized Skill input:

```yaml
action: start_run | continue_run | resume_run | pause_run | process_human_review | reconcile_run

run_id: optional

run_request: optional
human_decisions: optional
```

The Skill must validate which fields are required for each action.

---

# 39. Orchestrator Skill Outputs

Example:

```json
{
  "run_id": "run_42",
  "run_state": "waiting_human_review",

  "progress": {
    "active": 36,
    "minimum_target": 80,
    "coverage_percent": 44
  },

  "current_batch": {
    "slots": 12,
    "qc_passed": 10,
    "revision": 1,
    "rejected": 1,
    "assets_required": 3,
    "assets_passed": 3,
    "pending_review": 10
  },

  "next_action": "WAIT_HUMAN_REVIEW",
  "warnings": []
}
```

---

# 40. Acceptance Criteria for Phase 2.1

The Orchestrator Skill is considered valid only if it can handle all of the following without changing the core workflow:

1. Primary Science, 3 choices, image-heavy
2. Junior Math, 4 choices, diagram optional
3. Senior Physics, calculations + graphs + circuits
4. Senior Chemistry, equations + structures + experimental data
5. Senior Biology, diagrams + real images + data interpretation
6. a Run paused halfway and resumed
7. one rejected question replaced without shifting coverage
8. a Profile updated during an active Run
9. technical retry after DB/Storage failure without duplicate insertion
10. quantity target reached but Blueprint coverage incomplete
11. human rejection overriding agent PASS
12. two overlapping Runs attempting to write to the same scope

If any of these requires hardcoding a specific grade/subject, the Orchestrator design fails acceptance.

---

# 41. Locked Design Principles for This Skill

1. Orchestrator is a state machine, not a content agent.
2. Blueprint Slot is the atomic production unit.
3. Profile and Blueprint are version-pinned per Run.
4. Author and reviewers remain independent.
5. Human approval has highest precedence.
6. Active coverage counts only `active`.
7. Quantity and coverage are separate metrics.
8. Every transition is event-backed.
9. External operations are idempotent.
10. Runs are resumable and reconcilable.
11. Concurrency is controlled by coverage scope.
12. Failure must stop safely rather than guess.

---

**Phase 2.1 Status:** Ready for human review
