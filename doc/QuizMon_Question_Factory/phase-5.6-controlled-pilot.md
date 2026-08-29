# Phase 5.6 — Controlled Pilot

**Status:** In progress — first real batch is waiting for Human Review
**Started:** 2026-08-29

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

- [Factory Office](https://quizmon-8zxk5p005-pon-d.vercel.app/admin/factory-office-preview)
- [Question Review Queue](https://quizmon-8zxk5p005-pon-d.vercel.app/admin/question-factory/review)

The reviewer may select each item or use random selection. Approval or revision acts on one exact candidate revision and mapping checksum. Draft publication and learner-visible activation remain separate explicit actions after review.

## Exit gate

Phase 5.6 is not complete until the user reviews the batch, requested revisions are resolved, approved candidates are deliberately published/activated, and final mapping/product/rollback evidence is recorded. No approval should be inferred from opening the review page.
