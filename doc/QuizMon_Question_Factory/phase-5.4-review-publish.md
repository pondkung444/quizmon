# Phase 5.4 — Human Review, Product Mapping and Publish

**Status:** In progress — deterministic Product Mapping Candidate and read-only Human Review queue implemented; no product write enabled

## Safety boundary

Phase 5.4 is split so an approval cannot accidentally become an active gameplay question:

1. **5.4a — Review candidate:** reconstruct the latest QC-passed question and exact approved asset revision, resolve curriculum/category mappings and generate one checksum-bearing Product Mapping Candidate.
2. **5.4b — Human decision:** approve, request a targeted revision, or reject the exact candidate checksum with append-only review/event evidence and optimistic Slot versioning.
3. **5.4c — Draft publication:** after approval only, insert `questions.status='draft'` and its immutable `question_factory_product_mappings` row atomically and idempotently.
4. **5.4d — Asset promotion:** copy verified bytes to the canonical product filename, attach the complete image tuple atomically, then verify public bytes/checksum.
5. **5.4e — Activation:** activate only the fully published, still-approved mapping checksum through a separate audited transition.

No step may create a question directly as `active`. No Factory metadata is added to `questions`.

## Product-mapping candidate contract

`productMapping.ts` now fails closed unless all of these agree:

- immutable Blueprint Slot and latest question candidate;
- Factory stage, grade and semantic subject;
- resolved `curriculum_chapters` snapshot and checksum;
- versioned exact category mapping entry and stable topic ID;
- approved asset presence/revision/checksum when the question requires an asset;
- legacy product route, including Senior Physics → `subject=math, branch=physics`;
- four choices, zero-based answer index, difficulty 1–3 and non-empty explanation.

The output is a canonical `questions` draft payload plus an approved staging-asset reference and SHA-256 checksum. Image columns remain all-null in the draft candidate because `q{id}.svg|webp` cannot be known until the product ID exists.

## Mapping-table timing decision

The existing baseline intentionally makes `question_factory_product_mappings.question_id` non-null, unique and immutable. Therefore it cannot store a pre-publication row without weakening the schema. Human review instead records the exact Product Mapping Candidate checksum/evidence. After approval, the draft question and immutable mapping row will be created in one transaction. This preserves the eight-table baseline and prevents orphan or duplicate product questions.

## Current verification

The deterministic harness covers the verified Senior Physics legacy route and rejects product subject leakage, wrong branch, wrong topic, wrong grade, blank category and a missing approved asset. Production tables and Storage are not written by this increment.

The admin-only review route `/admin/question-factory/review` now loads `pending_human_review` Slots server-side, reconstructs the latest immutable candidate evidence, signs only the exact QC-passed private asset for a short preview window, and supports selecting each item or randomly choosing a different queued item. Decision buttons remain deliberately disabled until the Human Review mutation RPC passes its database smoke matrix.

## Remaining exit gates

- lock the versioned category registry source used by real Profiles;
- service-only Human Review RPC with replay, stale-version and targeted-revision tests;
- atomic/idempotent draft + mapping insertion;
- verified asset promotion and compensation behavior;
- separate activation RPC and rollback smoke proving no product residue;
- permission/advisor checks and trusted production workflow evidence.
