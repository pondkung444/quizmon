# Phase 5.1 — Existing-bank Audit and Deterministic Blueprint

**Status:** Implementation complete; no real Run created

## Outcome

Phase 5.1 adds a server-only, read-only bank audit and a pure deterministic Blueprint builder:

- `src/lib/questionFactory/bankAuditServer.ts` resolves the approved curriculum row, queries the exact product tuple, and snapshots active/pipeline/inactive/image/difficulty/category evidence;
- `src/lib/questionFactory/blueprint.ts` calculates the minimum active coverage gap and allocates immutable Slots with largest-remainder weighted distribution;
- the output Slots are directly compatible with the Phase 5.0 atomic initialization contract.

No question text is generated, no `questions` row is written, and no real Factory Run is created in this phase.

## Audit boundary

Matching is exact on resolved `grade_band + grade_level + subject + branch + chapter`. Numeric registry IDs and client labels are not trusted. Grandfathered null-metadata rows are deliberately not pulled into a modern curriculum scope.

The audit distinguishes:

- `active` — learner-ready coverage;
- `pipelineReady` — active + draft + pending review;
- inactive inventory;
- active/pipeline counts by difficulty;
- category variants and image presence.

The current product table does not contain reliable `learning_objective`, `cognitive_demand`, or `question_archetype` fields. The snapshot marks those dimensions unavailable instead of inferring them from prose or category labels.

## Production evidence — 2026-08-28

- 95 curriculum chapters audited by the same null-safe product tuple;
- 82 chapters have at least one exact active match; 13 have zero;
- 3,442 active questions match an approved modern curriculum tuple;
- the remaining one active question is the already-documented grandfathered null-metadata Senior Biology row;
- no Factory draft/pending rows currently exist, so active and pipeline totals are both 3,442;
- pilot evidence for `cc_a20910939a299b40d99910af` (ม.1 Math, ทศนิยมและเศษส่วน): 10 active, difficulty 1=3 and 2=7, no image.

## Deterministic allocation

The Blueprint receives only pinned/versioned inputs: scope, Profile identity, audit checksum, minimum-active target, resource ceiling, and approved weighted mixes. It computes:

```text
required_new_active = max(0, minimum_active - audited_active)
```

Each configured dimension uses largest-remainder allocation with declaration order as the final tie-breaker. Slots use stable keys `slot_0001...slot_N`, positive ordinals, `single_choice`, and explicit objective/difficulty/representation values. The complete normalized Blueprint receives a SHA-256 checksum.

Repeated construction with byte-equivalent inputs produced byte-equivalent Slots and checksum. The regression fixture `active=10`, `minimumActive=20`, difficulty weights `25/50/25` produced 10 Slots distributed `3/5/2`.

## Phase 5.0 correction discovered by integration

`target_active` is the whole-bank goal; Slots represent only the audited coverage gap. The initial Phase 5.0 RPC incorrectly required slot count to equal `target_active`. Because the earlier smoke used equal values, it did not expose this semantic error.

Corrective migration `20260828130000_fix_question_factory_create_run_slot_gap.sql` (production history `20260828112248_fix_question_factory_create_run_slot_gap`) now requires at least one Slot and caps Slots by `max_generated_items`, while persisting `planned_gap_slots` in `coverage_summary`. Production regression passed with target 20 and 10 Slots/11 initialization events, followed by rollback to empty Factory tables.

## Exit gate

- exact registry-scoped audit is read-only and explicit about unavailable metadata;
- same pinned inputs produce the same locked Blueprint;
- slot count represents the audited gap rather than the whole-bank target;
- invalid weights, difficulty, objective IDs, representations and resource ceilings fail closed;
- no production question or Factory Run was created.

Phase 5.2 may now consume one approved Blueprint Slot at a time for the Author → Question QC text loop.
