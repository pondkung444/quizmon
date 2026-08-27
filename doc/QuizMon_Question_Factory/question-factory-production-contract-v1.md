# QuizMon Question Factory v1
## Phase 4.0 — Production Contract Lock

**Status:** Draft for review  
**Purpose:** Lock the existing QuizMon production contracts before designing or applying any Question Factory database changes.

**Important:** This document is based on a read-only survey of the current production Supabase state.  
Phase 4.0 introduces **no database migration and no production write**.

---

# 1. Objective

Phase 4.0 defines what the Question Factory must preserve when integrating with the existing QuizMon product.

The Question Factory must adapt to the existing product contract instead of forcing the gameplay/product schema to change for Factory convenience.

Core rule:

> Product schema semantics remain stable. Factory metadata lives in a separate workflow layer.

---

# 2. Current Production Snapshot

At survey time:

```text
questions total: 3,663
active: 3,443
inactive: 220
draft: 0
pending_review: 0
```

Current `questions.status` constraint allows:

```text
active
inactive
draft
pending_review
```

This matches the Factory Contract and should be preserved.

---

# 3. Current Active Question Distribution

Production currently represents subjects as follows:

| Education scope | questions.subject | questions.branch | Active |
|---|---|---|---:|
| Junior Math | `math` | null | 1,010 |
| Junior Science | `science` | null | 1,033 |
| Senior Physics | `math` | `physics` | 400 |
| Senior Chemistry | `science` | `chemistry` | 400 |
| Senior Biology | `science` | `biology` | 600 |

This is a **product-level compatibility contract**.

Factory subject names do not have to equal `questions.subject`.

---

# 4. Product Mapping Adapter — REQUIRED

The Factory may use a semantically correct academic model:

```text
subject = physics
subject = chemistry
subject = biology
```

But product writes must map into the existing QuizMon schema.

Examples:

```yaml
factory:
  subject: physics

product:
  grade_band: senior
  subject: math
  branch: physics
```

```yaml
factory:
  subject: chemistry

product:
  grade_band: senior
  subject: science
  branch: chemistry
```

```yaml
factory:
  subject: biology

product:
  grade_band: senior
  subject: science
  branch: biology
```

Junior examples:

```yaml
factory:
  subject: math

product:
  grade_band: junior
  subject: math
  branch: null
```

```yaml
factory:
  subject: science

product:
  grade_band: junior
  subject: science
  branch: null
```

The Factory must never assume:

```text
Factory subject == questions.subject
```

---

# 5. Protected Product Field Semantics

The following `questions` fields are already part of production behavior and their meaning must not be silently changed.

## 5.1 `status`

Product meaning:

```text
active = learner-facing / usable by gameplay
inactive = preserved but not used by normal gameplay
draft = not ready for human review
pending_review = Factory/QC complete, awaiting human approval
```

Factory workflow states such as:

```text
authoring
qc_failed
asset_pending
revision_required
rejected
```

must not be stored in `questions.status`.

They belong in Factory workflow tables.

---

## 5.2 `grade_band`

Currently used by live question-selection logic.

Existing values include:

```text
junior
senior
```

Do not redefine these to education stages such as `lower_secondary` or `upper_secondary`.

Factory Profile education-stage values require explicit mapping.

---

## 5.3 `subject`

Production meaning currently includes:

```text
math
science
```

Senior Physics currently remains under `subject=math`.

Senior Chemistry/Biology remain under `subject=science`.

Do not change this meaning during Factory integration.

---

## 5.4 `branch`

Currently distinguishes senior subject branches:

```text
physics
chemistry
biology
```

Junior questions commonly use null.

This field is part of the Product Mapping Adapter.

---

## 5.5 `category`

`category` is already used by production learning logic.

A surveyed Dungeon Bonus function:

- reads learner performance through `quiz_attempts`
- joins `questions`
- groups weakness by `questions.category`
- selects active questions from weak category

Therefore:

> category is not merely descriptive metadata.

Changing category naming can alter learner-facing recommendation behavior.

Factory must preserve existing category semantics unless a separate product migration is explicitly designed.

---

## 5.6 `difficulty`

Already consumed by question content and exposed by some RPC results.

Factory may use a richer difficulty model internally, but Product Mapping must output a valid product difficulty compatible with existing QuizMon behavior.

Do not change product scale globally as part of Factory integration.

---

# 6. Current Curriculum Metadata Reality

## Junior Math

Junior Math has meaningful adoption of:

```text
grade_level
chapter
```

Examples:
- ม.1 — จำนวนเต็ม
- ม.1 — ทศนิยมและเศษส่วน
- ม.3 — ความคล้าย
- ม.3 — วงกลม
- ม.3 — อัตราส่วนตรีโกณมิติ

This mapping should be preserved.

---

## Junior Science

`grade_level` is populated for substantial groups.

However, `chapter` remains largely null in the surveyed production set.

Factory must not assume existing Junior Science questions have complete chapter metadata.

---

## Senior Physics / Chemistry / Biology

Current senior content largely uses:

```text
category
```

as the primary curricular topic label.

Examples include:
- ฟิสิกส์ ม.6 — คลื่นและเสียง
- ฟิสิกส์ ม.6 — ไฟฟ้า
- เคมี ม.4-6 — กรด-เบส
- เคมี ม.4-6 — สมดุลเคมี
- ชีวะ ม.4-6 — พันธุศาสตร์
- ชีวะ ม.4-6 — ระบบร่างกายมนุษย์

`grade_level` and `chapter` are currently null for much of this senior bank.

Therefore Factory audit/migration logic must tolerate legacy metadata incompleteness.

---

# 7. Factory Metadata Must Remain Separate

Do not add every Factory concept directly into `questions`.

Factory-only metadata includes:

```text
profile_id
profile_version
blueprint_id
blueprint_version
blueprint_slot
learning_objective
cognitive_demand
question_archetype
representation_type
reasoning_template
author_version
revision_count
question_qc_result
question_qc_issues
asset_qc_result
asset_qc_issues
human_review_note
factory_run_id
```

These belong in dedicated Factory tables.

The product `questions` table should remain focused on learner/gameplay content.

---

# 8. Product Write Boundary

The Factory may eventually write to `questions`, but only product-compatible fields.

Typical fields include:

```text
question_text
choices
correct_index
explanation

difficulty
grade_band
subject
branch
category
grade_level
chapter

status

image_url
image_prompt
image_filename
image_type
```

Exact column availability and nullability must be re-checked immediately before migration implementation.

No write must rely only on historical documentation.

---

# 9. Active-Only Coverage Rule

Factory production coverage must distinguish:

```text
active coverage
pipeline coverage
```

Example:

```text
65 active
15 pending_review
```

means:

```text
active coverage = 65
pipeline-ready = 80
```

Run completion must use active product truth.

`pending_review` must not count as learner-ready content.

---

# 10. Product Dependencies on `questions`

Production currently contains foreign-key relationships from at least:

```text
quiz_attempts.question_id → questions.id
raid_boss_questions.question_id → questions.id
raid_run_steps.quiz_question_id → questions.id
```

`quiz_attempts.question_id` currently uses:

```text
ON DELETE CASCADE
```

This makes destructive deletion particularly risky.

Factory default policy:

> Do not delete product questions as normal workflow.

Use:

```text
inactive
```

for retirement unless a separately reviewed data migration requires deletion.

---

# 11. Live Question Selection Dependencies

Read-only survey confirmed live functions select questions using existing product fields.

## Dungeon Bonus

Uses:
- `status = active`
- `grade_band`
- weak `category`

## Raid Boss

Uses:
- `status = active`
- `grade_band`
- random selection

Therefore Factory integration must not alter these contracts without separate product review.

---

# 12. RLS Contract and Risk

Current `questions` table has Row Level Security enabled.

Surveyed SELECT policy allows authenticated users to read questions.

The policy itself does not guarantee:

```text
status = active
```

for every direct query.

This creates a possible future risk:

> once Factory begins storing many `draft` and `pending_review` rows in `questions`, a learner-facing direct query that forgets to filter status could expose unpublished content.

Phase 4 requirement:

Before production Factory use:
- audit direct client queries to `questions`
- determine whether each learner-facing read filters `status='active'`
- then decide whether RLS needs tightening

Do not change RLS during Phase 4.0.

---

# 13. Storage Contract

Current bucket:

```text
question-images
```

Surveyed properties:

```text
public = true
file size limit = 5 MB
allowed MIME:
- image/png
- image/jpeg
- image/webp
- image/svg+xml
```

This supports the planned Factory representations.

---

# 14. Storage Security Caution

Current surveyed Storage policies permit:

```text
anon INSERT
anon UPDATE
```

for the `question-images` bucket.

Question Factory should not assume this is the desired long-term production security model.

Recommended future direction:

> Factory asset writes should use a controlled server/service workflow.

However:

- current frontend dependencies must be audited
- security tightening must be a separate reviewed change
- do not remove current policies blindly

---

# 15. Question Image Contract

New Factory-generated question assets should follow:

```text
Storage object
→ public/durable URL
→ questions.image_url
```

For SVG:

```text
filename = q{question_id}.svg
image_type = svg
```

For raster:

```text
filename = q{question_id}.webp
image_type = webp
```

`image_prompt` must be preserved for regeneration/debug.

---

# 16. Legacy Image Technical Debt

At survey time:

```text
Storage URL images: 20
legacy data URI/Base64 images: 70
```

Recent question work demonstrates the new Storage URL workflow works.

Legacy Base64 migration is:

```text
technical debt
```

not a prerequisite for Factory Phase 4.

Do not mix legacy cleanup into Factory schema migration unless separately approved.

---

# 17. Status Transition Contract

Allowed product-state transitions for Factory v1:

```text
new question
→ draft
→ pending_review
→ active
```

Human rejection/rework may send content back through Factory workflow while the product question remains controlled.

Retirement:

```text
active → inactive
```

Reactivation, if supported later:

```text
inactive → active
```

must require explicit reviewed policy.

---

# 18. Human Publish Boundary

Factory agents may prepare:

```text
draft → pending_review
```

only after all required QC gates pass.

For v1:

```text
pending_review → active
```

requires explicit Human Approval.

This product transition must never occur from Author/QC/Builder self-approval.

---

# 19. Legacy Questions Contract

Existing active questions that were created before Question Factory:

- remain valid product records
- do not need synthetic Factory histories
- may be audited/mapped for coverage
- should not be rewritten simply to conform to new Factory metadata

If Factory needs curriculum metadata for them, use a legacy mapping/import process in the Factory layer.

---

# 20. Factory Coverage Audit Against Legacy Data

Coverage audit must support two classes:

```text
Factory-native questions
Legacy questions
```

Factory-native items have complete Factory metadata.

Legacy items may require inferred or curated mapping.

Inference must not silently modify the question itself.

Confidence/source should be preserved when legacy metadata is mapped.

---

# 21. Product Mapping Contract

Before a Factory candidate can be inserted into `questions`, the Product Mapping Adapter must produce a normalized payload.

Example:

```yaml
factory_profile:
  education_stage: upper_secondary
  grade: 11
  subject: physics
  chapter: electric_current

product_mapping:
  grade_band: senior
  subject: math
  branch: physics
  category: "..."
  grade_level: null
  chapter: null
```

The exact category/grade/chapter mapping must come from an approved Product Mapping Profile.

The Orchestrator must not invent it at insert time.

---

# 22. Mapping Must Be Versioned

Product Mapping rules should be versioned.

Example:

```text
product_mapping_profile_id
product_mapping_profile_version
```

Reason:

Future cleanup may change senior schema conventions.

Historical Runs must remain explainable.

---

# 23. No Product-Schema Refactor Inside Factory Migration

Phase 4 must not opportunistically refactor:

- `subject`
- `branch`
- `category`
- grade naming
- senior taxonomy

even if a cleaner schema seems preferable.

A product-schema normalization is a separate migration project.

Question Factory should use an adapter layer.

---

# 24. Write Authorization Boundary

Future Factory database writes should be server-side / privileged.

Do not design Factory workflow around learner/client authorization.

Learners should not be able to:
- create Factory Runs
- author questions
- update QC states
- move `draft → pending_review`
- move `pending_review → active`
- overwrite question assets

Exact role/service architecture is Phase 4.3 work.

---

# 25. Required Pre-Migration Survey

Immediately before any Factory DDL migration, re-check:

```text
questions columns
questions constraints
questions indexes
questions triggers
questions RLS policies
questions grants
foreign keys to questions

storage bucket config
storage policies

existing Factory-named tables/functions
current migration state where accessible
```

Production truth at migration time overrides older notes.

---

# 26. Required Pre-Write Validation

Before the first Factory-produced question is written:

```text
[ ] profile pinned
[ ] blueprint pinned
[ ] product mapping pinned
[ ] mapping validates against questions constraints
[ ] category mapping approved
[ ] status starts as draft
[ ] answer schema valid
[ ] image rules satisfied if applicable
[ ] no conflicting question id
[ ] write path is server-authorized
```

---

# 27. Read-Only Verification After Future Migration

After Phase 4.5 migration, Phase 4.6 must verify without changing product data:

- Factory tables exist
- constraints exist
- indexes exist
- RLS exists as designed
- no `questions` rows changed unexpectedly
- active question count unchanged
- inactive count unchanged
- Dungeon/Raid dependent functions still resolve
- FKs remain valid
- question selection queries still use active product data

---

# 28. Production Invariants

The following must remain true after Factory integration.

## Invariant 1

Existing active questions remain usable.

## Invariant 2

Factory metadata changes must not affect gameplay selection unless a question is explicitly activated/deactivated.

## Invariant 3

`questions.status='active'` remains the learner-ready truth.

## Invariant 4

Existing category-based weakness logic remains functional.

## Invariant 5

Existing senior subject representation remains compatible.

## Invariant 6

No Factory retry creates duplicate product questions.

## Invariant 7

No technical Factory failure accidentally activates a question.

## Invariant 8

No Factory migration deletes attempt history.

## Invariant 9

Assets referenced by active questions remain accessible.

## Invariant 10

Human approval remains required for Factory v1 publication.

---

# 29. Phase 4 Subphase Plan

Based on the production survey, Phase 4 is divided into:

## 4.0 — Production Contract Lock

This document.

No production changes.

## 4.1 — Factory Data Model

Design:
- runs
- items/slots
- events
- revisions/QC payloads
- profile snapshots/references
- idempotency

No migration yet.

## 4.2 — Product Mapping Adapter

Design mappings from:
- Factory Profile
to:
- current `questions` schema

No migration yet.

## 4.3 — RLS / Storage / Permission Plan

Audit:
- Factory table access
- learner isolation
- service write role
- question draft visibility
- asset write permissions

No security changes until reviewed.

## 4.4 — Migration SQL Review

Produce exact DDL migration proposal.

Review:
- rollback strategy
- constraints
- indexes
- RLS
- compatibility

Do not apply until Human Approval.

## 4.5 — Apply Migration

Apply only approved migration.

No question production in same step.

## 4.6 — Read-Only Verification

Verify production integrity after migration.

---

# 30. Explicit Out-of-Scope Items

Phase 4.0 does not solve:

- legacy Base64 migration
- normalization of senior `subject`
- senior chapter backfill
- Junior Science chapter backfill
- category redesign
- learner Skill model
- adaptive question delivery
- full Question Factory UI
- automatic active publishing
- current Storage-policy hardening

These may become separate work items later.

---

# 31. Acceptance Criteria for Phase 4.0

Phase 4.0 is acceptable only if the future Data Model can satisfy all of the following:

1. Factory Physics profile can write a product-compatible Physics question without changing `questions.subject` semantics.
2. Junior Math continues using current `grade_level/chapter`.
3. Legacy Senior questions with null chapter remain valid.
4. Dungeon weak-category selection still works.
5. Raid active-question selection still works.
6. Draft/pending Factory questions cannot accidentally become gameplay questions.
7. Factory workflow metadata does not pollute product status.
8. Historical legacy questions can count toward coverage without fabricated Factory history.
9. Product question deletion is not required for normal Factory operation.
10. Asset generation can use existing Storage while allowing future security hardening.
11. Migration can be added without rewriting the 3,663 existing questions.
12. Future product-schema cleanup remains possible without rewriting Factory Core.

---

# 32. Locked Decisions

The following decisions are locked for Phase 4 design unless explicitly reopened:

1. Keep Factory workflow separate from product question state.
2. Preserve current product semantics for `status`, `grade_band`, `subject`, `branch`, and `category`.
3. Introduce a Product Mapping Adapter rather than refactoring `questions`.
4. Count only `active` questions as production coverage.
5. Avoid destructive question deletion as normal workflow.
6. Keep legacy question support first-class.
7. Do not require legacy Base64 cleanup before Factory launch.
8. Treat RLS/draft visibility as a mandatory audit item before Factory production.
9. Treat Storage write security as a reviewed future security change, not an incidental Factory migration.
10. Re-survey production immediately before applying any DDL.

---

**Phase 4.0 Status:** Ready for human review
