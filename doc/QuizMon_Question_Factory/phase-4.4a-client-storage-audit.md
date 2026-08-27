# Phase 4.4a — Production Client and Storage Caller Audit

Status: **Superseded by Phase 4.4b implementation; no production changes**  
Prepared: 2026-08-27  
Production target: `monschool` (`wmndxiuqzrnqbhrznmfg`)

## 1. Purpose

This audit resolves as much as possible of the two compatibility blockers identified in Phase 4.4:

1. whether authenticated clients read `public.questions` directly; and
2. whether the current anonymous `question-images` uploader can be identified.

The evidence was collected read-only from recent production API logs and the public QuizMon repository. No database, policy, grant, bucket, object, or application file was changed.

## 2. Confirmed direct production reads

Recent production Data API logs confirm authenticated direct REST reads against `/rest/v1/questions`. Observed shapes include:

```text
HEAD questions
  select=id
  subject=math
  category=<category>
  status=active
  grade_band in (senior)

GET questions
  select=id,subject,category
  id in (<question ids>)
  grade_band in (senior)

GET questions
  select=id,category,subject
  id in (<question ids>)
  grade_band in (senior)
```

The latter two observed request shapes did **not** include `status=active`. Their ID-based metadata projection is consistent with application flows that resolve subject/category information for already-referenced question IDs, such as historical attempt, mission, weakness, or analytics processing.

### Consequence

The draft migration `002_questions_active_read_policy.review.sql` could not be applied safely based on logs alone. The later full source audit in Phase 4.4b established that server/admin reads already cover missions, statistics, calendars, Dungeon, Raid, and analytics. The only authenticated historical base-table caller was the feedback server action, which has now been changed to perform an ownership-bounded server read.

This does not prove that learners should receive unrestricted access to non-active question content. It proves that the application currently combines two requirements on the same table boundary:

- active question content for gameplay; and
- limited metadata lookup for questions already referenced by the learner's history.

Those requirements need separate access paths before the base-table policy can be tightened safely.

## 3. Recommended RLS compatibility design

Keep the current `questions` read policy temporarily. Before replacing it, select and test one of these designs:

1. **Preferred:** active-only base-table reads plus a narrow server/RPC path that returns only the required historical metadata for question IDs legitimately referenced by the current user's records.
2. Store immutable subject/category/grade snapshots with attempts or derived analytics so historical views no longer need non-active product rows.
3. Route all affected historical/analytics lookups through a trusted server action and remove the direct client dependency.

Do not create a broad public view that merely bypasses the active-only rule, and do not expose answer, explanation, choices, or other question content through the historical metadata path.

## 4. Claude commit evidence

The public repository commit `3b80f67a7a4c7aa1af080c72e23ced3273e6e305`, co-authored by Claude, changes three files:

- `src/app/quiz/actions.ts` — selects and maps `image_url`;
- `src/components/QuizClient.tsx` — conditionally renders the image; and
- `src/types/quiz.ts` — adds the nullable image field.

The commit message and comments explicitly describe the then-current pilot image as a data URI and Supabase Storage as a future external-URL option. The change contains display support, not an upload implementation.

### Conclusion about the uploader

It is plausible that Claude participated elsewhere in the image workflow, but this commit does **not** show Claude uploading the 20 Storage objects or using the anonymous Storage policy. The current uploader therefore remains unidentified.

The object records' `owner=null` state is consistent with an unauthenticated or otherwise non-user-owned upload path, but it does not identify a person, tool, API key, or script. Recent API logs did not cover the earlier object-creation window and therefore could not attribute those uploads.

## 5. Migration impact

| Draft migration | Current disposition |
|---|---|
| `001_question_factory_core.review.sql` | Remains additive and reviewable; this audit found no new compatibility blocker to its schema design. |
| `002_questions_active_read_policy.review.sql` | Compatibility implementation completed in Phase 4.4b; deployment order remains mandatory. |
| `003_question_images_remove_anon_writes.review.sql` | Trusted uploader implemented in Phase 4.4b; requires a real service-authority smoke test before policy removal. |

## 6. Next evidence required

- Locate the exact source callers for the observed ID-based `questions` reads and record which fields and empty-row behavior each flow requires.
- Exercise historical attempts containing an inactive question in a safe environment.
- Identify the tool/script/session that created the 20 `question-images` objects, or replace the upload workflow and prove the legacy anonymous path is no longer needed.
- Test service-only upload, overwrite, public read, and cache behavior before removing anonymous Storage policies.

## 7. Decision lock

This audit's blockers were carried forward and resolved at implementation level by Phase 4.4b. Until that implementation is deployed and verified:

- do not apply migration `002`;
- do not apply migration `003`;
- do not treat Claude's image-display commit as uploader attribution; and
- do not allow new Factory draft/pending questions to rely on the current learner-visible `questions` boundary.
