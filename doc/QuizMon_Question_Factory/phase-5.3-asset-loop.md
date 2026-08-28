# Phase 5.3 — Private Asset Builder → Image QC Loop

**Status:** In progress — validation, revision/QC RPCs and Storage existence guard deployed; trusted real-object smoke rerun pending

## Silent-failure policy

Storage success is not asset validity. Factory must independently verify bytes before upload and after signed download. A DB row, object metadata, declared MIME type, HTTP 2xx response, or visually plausible thumbnail is never sufficient evidence by itself.

The first Phase 5.3 increment adds `assetValidation.ts` and a deterministic negative-test harness. It enforces:

- non-empty and at most 5 MiB;
- exact MIME/extension pairing (`svg`/`image/svg+xml`, `webp`/`image/webp`);
- actual SVG root or WebP RIFF/WEBP/chunk signatures;
- exact WebP RIFF byte length and decoded dimensions;
- positive dimensions, at most 4096 per side and 16,777,216 pixels;
- SVG numeric `viewBox`, valid UTF-8, no DOCTYPE/entity/script/foreignObject/event handler;
- no external, embedded-data or external-CSS references;
- SHA-256 computed from actual bytes.

## Regression matrix passed locally

A valid 120×80 SVG passed with dimensions, byte size and checksum. The following failed closed:

1. empty file;
2. MIME/extension mismatch;
3. SVG bytes declared as WebP;
4. SVG script;
5. SVG event handler;
6. external href;
7. DOCTYPE;
8. missing viewBox;
9. oversized dimensions;
10. truncated WebP.

The trusted production Storage workflow now runs this matrix before network access, validates the upload bytes before sending, validates downloaded signed-preview bytes again, and compares the two SHA-256 values. Cleanup remains mandatory in `finally` and denial remains verified by effect.

## Remaining exit gates

- canonical revision path and `upsert=false` upload;
- exact post-upload download/hash verification before DB registration;
- cleanup when upload succeeds but DB registration fails;
- atomic asset row + Slot state + Event registration;
- Image QC tied to exact asset revision/checksum;
- regeneration/pass/reject, stale revision, replay and revision-race tests;
- malicious SVG/WebP and orphan-object cleanup production smoke;
- confirmation that no product-bucket write occurs before Phase 5.4 approval/publish.

## Persistence increment

Production now has service-only `question_factory_register_asset` and `question_factory_record_asset_qc` RPCs. Registration requires canonical revision order/path, immutable Slot representation, verified metadata and optimistic Slot state. Image QC can PASS to human review, REGENERATE to asset build, or REJECT terminally, and must reference the exact latest built revision and checksum. Asset row, Slot state and Event change atomically.

Migration evidence:

- repository `20260828121258_question_factory_asset_loop.sql`; production `20260828121544_question_factory_asset_loop`;
- repository `20260828121610_question_factory_asset_storage_guard.sql`; production `20260828121643_question_factory_asset_storage_guard`.

A DB trigger additionally rejects phantom asset rows unless `storage.objects` contains the exact private bucket/path with matching size and MIME metadata. SQL smoke proved a nonexistent object cannot create an asset row/event or advance the Slot. The trusted Storage workflow now covers the complementary failure window: upload and byte verification succeed, DB registration intentionally fails for an unknown Run, then compensating Storage deletion is verified by effect.

Phase 5.3 must remain open until every gate above passes. No real Factory image should be produced before then.
