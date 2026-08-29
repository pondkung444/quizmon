# Phase 5.4 — Human Review, Product Mapping and Publish

**Status:** In progress — authoritative category registry, deterministic Product Mapping Candidate and guarded Human Review decisions implemented; no product write enabled

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

The admin-only review route `/admin/question-factory/review` now loads `pending_human_review` Slots server-side, reconstructs the latest immutable candidate evidence, signs only the exact QC-passed private asset for a short preview window, and supports selecting each item or randomly choosing a different queued item.

The service-only `question_factory_record_human_review` RPC is now applied in production. It binds a decision to the exact question revision, Product Mapping Candidate checksum and—when required—the latest QC-passed asset revision/checksum. It updates current Slot state and appends one Human Review row plus one factual event atomically. Production rollback smoke passed for approve, exact replay, text revision, reject, stale-version conflict and the text-only/asset-target guard. The smoke transaction left zero fixture runs; `anon` and `authenticated` cannot execute the RPC, while `service_role` can.

Production now has the service-only immutable `question_factory_category_registry`. Its initial 85 approved `chapter_key + topic_id → exact product category` mappings are derived only from the 3,512 legacy questions that exactly match `curriculum_chapters`; 13 chapters with no exact legacy evidence remain unmapped and fail closed. Three chapters legitimately expose two category/topic mappings, proving that category cannot be stored as one field on the chapter row.

The review loader now resolves the current scope chapter and registry topic server-side and builds the complete checksum-bearing Product Mapping Candidate. Decision buttons are enabled only for a successfully resolved item. The Server Action re-authenticates the configured admin, reloads the queue item instead of trusting browser payload, records approve/revise/reject through the service-only RPC and revalidates the queue. Unmapped items show the mapping error and remain non-actionable.

A corrective migration also locks Human Review to `candidate.revision = slot.author_revision + 1`. Production rollback smoke proves revision zero is rejected for an initial candidate, revision one is accepted, and no fixture remains.

Phase 5.4c draft publication is now implemented as the service-only `question_factory_publish_draft` RPC. It accepts only the exact candidate JSON/checksum recorded by the successful Human Review, locks the approved Slot/version, verifies the current question revision and latest QC-passed asset reference when applicable, then creates the `questions.status='draft'` row, immutable `question_factory_product_mappings` row, Slot product link and factual event atomically. Every product image field remains null at this gate and the Slot remains `approved`; activation is impossible here.

The admin review route now retains approved Slots with no `question_id` as a separate “waiting for Draft” queue state. Creating a Product Draft requires an explicit second button and Server Action after Human approval. Production rollback smoke passed initial draft creation, semantic replay, altered-candidate rejection and stale-version rejection, with zero question/run residue afterward.

Phase 5.4d asset promotion is complete. The server downloads the QC-passed private staging object, repeats MIME/dimension/safety/checksum validation, uploads without overwrite to the canonical public path `question-images/q{question_id}.svg|webp`, downloads and verifies the destination, and only then calls the service-only `question_factory_promote_asset` RPC. The RPC requires the exact approved Slot/version, immutable product mapping, mapped draft question, latest asset revision/checksum, canonical public Storage row and an empty product image tuple. It atomically fills all four image fields, records the asset public path/state and appends `ASSET_PROMOTED`. Retries accept an existing destination only after exact byte verification; failures remove only an object uploaded by that attempt through the Storage API. Text-only drafts skip this gate and remain all-null.

The review page now keeps approved mapped drafts visible and labels the complete sequence: waiting for Draft, waiting for image promotion, and ready for Activation. Production rollback smoke passed initial promotion, exact replay, altered checksum rejection, stale-version rejection, complete image tuple binding and promoted asset state, with zero Factory fixture residue. `anon` and `authenticated` cannot execute the RPC; `service_role` can. No activation occurs in this phase.

Phase 5.4e activation is complete. The explicit admin action requires a confirmation checkbox, re-authenticates the current admin and reloads the queue server-side. The service-only `question_factory_activate_draft` RPC locks the running Run and approved Slot, requires the exact immutable mapping checksum and original Human approval evidence, compares every non-image product field to the immutable mapping output, and then applies a representation-specific final gate. Text-only drafts must retain an all-null image tuple. Visual drafts must reference the latest promoted asset, exact approved revision/checksum, complete matching product image tuple and an existing canonical `question-images` Storage object. Only then does one transaction set `questions.status='active'`, set the Slot to `active`, recalculate Run active/ready counters and append `QUESTION_ACTIVATED`.

Production rollback smoke passed text-only activation, visual activation, exact replay, wrong mapping checksum rejection, incomplete visual tuple rejection, stale-version rejection and counter/state assertions. The function is security-invoker with an empty search path; `anon` and `authenticated` cannot execute it, while `service_role` can. All smoke fixtures and Storage metadata were rolled back. Phase 5.4 is now complete.

## Remaining exit gates

- add an admin taxonomy workflow for the 13 intentionally unmapped curriculum chapters before Profiles may target them;
- require Profile/Blueprint builders to select the registry `topic_id` rather than accept arbitrary topic strings;
- run the positive visual-asset Human Review branch through the trusted Storage smoke path;
- verified asset promotion and compensation behavior;
- Phase 5.5: full end-to-end dry run using disposable output, including interruption/retry and Office reconstruction;
- permission/advisor checks and trusted production workflow evidence.
