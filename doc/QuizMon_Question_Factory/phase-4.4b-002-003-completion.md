# Phase 4.4b — Questions Read and Storage Write Hardening

Status: **Deployed, applied, and verified in production**
Prepared: 2026-08-28  
Production target: `monschool` (`wmndxiuqzrnqbhrznmfg`)

## Outcome

The compatibility work required before migrations 002 and 003 was deployed, and both migrations were applied and verified in production.

### 002 — active-only learner reads

A complete source audit found that gameplay, missions, topic statistics, calendars, Dungeon, Raid, and admin analytics already read `questions` through the trusted server/admin client. The only authenticated historical base-table read was `getRecentWrongQuestions()` in the feedback server action.

That action now:

1. authenticates the user;
2. reads the user's own incorrect `quiz_attempts` through RLS;
3. derives at most three unique question IDs; and
4. uses the server-only admin client to fetch only `id`, `question_text`, and `category` for those proven-owned history IDs.

This preserves feedback for questions that later become inactive without exposing non-active rows through the learner's direct Data API authority.

The generated repository migration replaces the legacy policy with:

```text
authenticated SELECT → status = active
anon SELECT/write authority → revoked
authenticated direct write authority → revoked
service role → unchanged
```

### 003 — service-only product image writes

A trusted operator uploader now exists at `scripts/upload-question-image.mjs`. It:

- loads the service key only from server-local `.env.local`;
- validates a positive question ID and confirms the question exists;
- accepts only PNG, JPEG, WebP, or SVG;
- enforces the current 5 MiB bucket limit locally;
- writes only to `question-images` using `q{question_id}.{ext}`;
- refuses replacement by default;
- requires explicit `--replace` for upsert; and
- supports `--dry-run` without credentials or network writes.

The generated repository migration verifies the exact surveyed bucket and policy state, then removes only:

- `question-images anon insert`; and
- `question-images anon update`.

The bucket remains public for downloads. The service authority continues to upload through the supported Storage API and bypasses Storage RLS as documented by Supabase.

## Files implemented

Application/source checkout:

- `work/quizmon/src/app/feedback/actions.ts`
- `work/quizmon/scripts/upload-question-image.mjs`
- `work/quizmon/package.json`
- `work/quizmon/supabase/migrations/20260827170634_secure_questions_active_reads.sql`
- `work/quizmon/supabase/migrations/20260827170648_remove_question_images_anon_writes.sql`

The migration files were created with `supabase migration new`, not invented manually.

## Verification completed

- Targeted ESLint: passed.
- Whole-project TypeScript `--noEmit`: passed.
- Uploader dry-run against a local SVG: passed; resolved bucket, `q3555.svg`, MIME, byte size, replacement flag, and dry-run state correctly.
- Production policies and grants were re-read before finalizing migration preconditions.
- Production migration history records `20260827172644_secure_questions_active_reads` and `20260827172916_remove_question_images_anon_writes`.
- Authenticated reads return active questions only; ordinary client writes remain unavailable.
- Anonymous Storage upload/update fails, public image download remains available, and the trusted service uploader path remains available.

## Deployment order completed

1. Review and deploy the `getRecentWrongQuestions()` application change.
2. Smoke-test feedback selection for recent wrong questions.
3. Apply migration `20260827170634_secure_questions_active_reads.sql`.
4. Verify authenticated users can read active questions but receive no draft/pending/inactive rows; verify gameplay and feedback.
5. Configure the trusted uploader environment on an approved operator/worker host.
6. Test one non-destructive new object upload through the trusted uploader and verify its public URL.
7. Apply migration `20260827170648_remove_question_images_anon_writes.sql`.
8. Verify anonymous upload and update fail while public download and service upload still succeed.
9. Run Supabase security/performance advisors.

All steps above were completed in order. Keep this sequence as the rollback/audit reference.

## Remaining boundary

002 and 003 are closed. The remaining operational boundary is the private Factory staging bucket and trusted human-review/publish path required before the first real Factory run.
