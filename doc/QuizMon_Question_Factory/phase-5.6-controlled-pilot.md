# Phase 5.6 — Controlled Pilot

**Status:** Complete — first real batch passed Human Review, Draft publication and explicit Activation
**Started:** 2026-08-29
**Completed:** 2026-08-29

## Approved scope

- Subject: คณิตศาสตร์
- Grade: ม.3
- Curriculum chapter: `กราฟของฟังก์ชันกำลังสอง`
- Product category: `ฟังก์ชันกำลังสอง/พาราโบลา`
- Batch: 10 text-only single-choice questions
- Difficulty distribution: 3 easy, 4 medium, 3 hard
- Publication policy: human review required; no automatic draft publication or activation

## Production identity

- Run ID: `27`
- Run key: `7caadaf2-b08b-4d3e-a5f1-4cf424cd11cc`
- Scope key: `qf:v1|stage=lower_secondary|grade=9|subject=math|unit=cc_6ec94863a615f997c2e8666a`
- Curriculum chapter key: `cc_6ec94863a615f997c2e8666a`
- Category mapping: `pcm_6a1d446ac588b5d20ef824b7`
- Topic ID: `pt_e6f0415e84bbcec343022119`

The reviewed operational SQL is [pilots/2026-08-29-m3-parabola-10.review.sql](pilots/2026-08-29-m3-parabola-10.review.sql). It creates only Factory snapshots, Run, Slots and append-only evidence, then stops every Slot at `pending_human_review`.

## Verification evidence

The post-create read-only verification returned:

| Check | Result |
|---|---:|
| Total Slots | 10 |
| Review-ready Slots at state version 3 | 10 |
| Curriculum chapter resolved | 10 |
| Product category mapping resolved | 10 |
| Candidate/immutable Slot contract matched | 10 |
| Exact legacy question-text duplicates | 0 |
| Product question links | 0 |

All questions are text-only, so this pilot creates no staging or product Storage object.

## Corrected pre-review issue

The first attempt used a human-readable `unit=parabola`. The Review Queue correctly failed mapping closed because `scope.unit` is the canonical `curriculum_chapter_key`. Before any human review, product write or asset write, Run `26` and only its dependent Factory evidence were removed after exact precondition checks; the residue count was zero. Run `27` was then created with the canonical chapter key and passed all mapping checks above.

## Human-review handoff

- [Factory Office](https://quizmon.xyz/admin/factory-office-preview)
- [Question Review Queue](https://quizmon.xyz/admin/question-factory/review)

The reviewer approved all 10 exact candidate revisions. The Review Queue gained guarded multi-select approval in commit `887d4ec`; each selected Slot still executes the original service-only Human Review RPC with its own state-version, mapping-checksum and idempotency guards. No approval was inferred from opening the page.

## Publication and activation evidence

The user separately authorized Product Draft publication and learner-visible Activation. Each batch operation ran in one outer transaction while preserving the per-Slot service-only RPC guards; any Slot failure would have rolled back the whole batch.

| Check | Result |
|---|---:|
| Human approvals / `HUMAN_APPROVED` events | 10 / 10 |
| Product Draft questions | `3672`–`3681` |
| Product mappings | `9`–`18` |
| `PRODUCT_DRAFT_CREATED` events | 10 |
| Active Slots at state version 6 | 10 |
| Active product questions | 10 |
| `QUESTION_ACTIVATED` events | 10 |
| Exact mapping checksum matches | 10 |
| Exact mapping-output/product-row matches | 10 |
| Canonical chapter/category route matches | 10 |
| Unexpected external exact duplicates | 0 |
| Factory assets / matching Storage objects | 0 / 0 |
| Run 26 residue across Factory tables | 0 |

Activation event IDs `185`–`194` show monotonic counters from `active_count=1, pipeline_ready_count=9` through `active_count=10, pipeline_ready_count=0`. Run `27` has no error and retains `status=running`, `state_version=1`: the current v1 contract recalculates counters during Activation but does not yet provide a guarded terminal Run transition. Phase 6 Operational Hardening owns that lifecycle closure; production was not updated ad hoc.

## Exit gate

Passed on 2026-08-29. The user reviewed and approved all candidates, separately authorized Draft publication and Activation, and the final mapping/product/event/residue audit passed. Phase 6 Operational Hardening is next.
