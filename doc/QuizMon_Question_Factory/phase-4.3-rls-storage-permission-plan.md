# Phase 4.3 — RLS / Storage / Permission Plan

Status: **Implemented security baseline — migrations and private staging gate verified in production**
Production snapshot: `monschool` (`wmndxiuqzrnqbhrznmfg`), surveyed read-only on 2026-08-27  
Database or Storage changes made during this phase: **none**

## 1. Decision summary

Question Factory v1 must be a trusted server/service workflow. Learner clients must not directly create, edit, review, publish, retire, or inspect Factory records and non-active questions.

Recommended target:

```text
Learner client
  ├─ read active product questions only
  └─ no Factory or asset-write authority

Trusted Factory worker (server-side service role)
  ├─ Factory tables
  ├─ non-active product question writes
  ├─ private staging assets
  └─ approved asset promotion

Human reviewer
  └─ authenticated review UI → trusted server action → audited decision
```

The service-role key must remain server-side and must never enter a browser, mobile application, public repository, model prompt, generated asset, or client-visible environment variable.

## 2. Verified production state

### 2.1 `public.questions`

- RLS is enabled but not forced.
- The only policy is `read questions` for `SELECT` with `auth.role() = 'authenticated'`.
- The policy applies to the `public` role and uses the deprecated `auth.role()` predicate.
- It does not filter `status='active'`; any authenticated client with table access can read `inactive`, `draft`, and `pending_review` rows.
- `anon`, `authenticated`, and `service_role` currently have broad table grants, including SELECT/INSERT/UPDATE/DELETE. RLS currently blocks client writes because there is no matching write policy, but the grants are broader than required.
- Gameplay RPCs surveyed in Phase 4.2 generally filter `active` when selecting new questions, but RLS is the safety boundary for any direct Data API query.

### 2.2 Storage

The only bucket is `question-images`:

- public downloads enabled;
- 5 MiB limit;
- allowed MIME types: PNG, JPEG, WebP and SVG;
- 20 current objects, all SVG and named `q{id}.svg`;
- all 20 object records have `owner=null`.

Current `storage.objects` policies:

| Policy | Role | Operation | Condition |
|---|---|---|---|
| `question-images anon insert` | `anon` | INSERT | bucket is `question-images` |
| `question-images anon update` | `anon` | UPDATE | bucket is `question-images` |

This means an unauthenticated client has an upload/overwrite authorization path for the product asset bucket. A public bucket only needs to provide public downloads; it does not need anonymous writes.

The current UPDATE path also lacks a corresponding object SELECT policy required by documented Storage upsert behavior, so it is both over-authorized in intent and incomplete as a dependable controlled upload path.

### 2.3 `public.curriculum_chapters` — Phase 4.7 update

The curriculum registry has RLS enabled and a `SELECT` policy with `using (true)` for `anon` and `authenticated`. Phase 4.7 revoked INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER table grants and all registry-sequence privileges from both roles, leaving SELECT only. An actual `SET LOCAL ROLE anon` SELECT returned all 95 rows and an anonymous INSERT failed with permission denied. `service_role` remains the trusted maintenance authority.

This read-public/write-service boundary is acceptable for non-sensitive curriculum labels, provided that:

- no future client write policy is added without a separate authorization review;
- Factory resolves registry rows server-side before creating immutable snapshots;
- client-supplied numeric IDs or labels are treated only as lookup input, never as trusted mapping output;
- Data API exposure remains intentional rather than relying on changing project defaults;
- schema hardening is represented by `supabase/migrations/20260828104722_curriculum_chapters_registry_bridge.sql` and production history `20260828105201_curriculum_chapters_registry_bridge`;
- the post-migration security advisor reports no `curriculum_chapters` finding.

## 3. Threats to prevent

1. Learners viewing draft/pending questions and answers before approval.
2. Anonymous or ordinary authenticated users uploading or overwriting question assets.
3. A public asset being replaced after human approval without a Factory revision/event.
4. A client directly promoting a question to `active` or retiring/deleting it.
5. Factory tables leaking prompts, QC evidence, reviewer notes, provider metadata, or internal errors.
6. A compromised browser obtaining the service-role key.
7. Public `SECURITY DEFINER` publishing functions becoming unintended API endpoints.
8. Permission changes breaking existing QuizMon question loading or public image display.

## 4. Target permissions for Factory tables

Keep the eight Phase 4.1 tables in `public` for pragmatic service-role Data API access, but treat them as server-only resources:

- enable RLS on every Factory table;
- explicitly revoke all privileges from `anon` and `authenticated`;
- grant only the operations actually required to `service_role`;
- create no learner/client RLS policies;
- do not expose Factory tables through a public view;
- do not enable Realtime publication for Factory tables in v1;
- avoid `SECURITY DEFINER` as a permission workaround.

RLS remains defense in depth; the service role bypasses it. The real controls are server-only key custody, explicit grants, and the absence of client policies.

If a future human-review UI needs direct authenticated access, do not relax all tables. Add a dedicated reviewed API/server action or a narrow security-invoker projection after a staff authorization model is approved. Ordinary `authenticated` membership alone is not staff authorization.

## 5. Target permissions for `questions`

### 5.1 Read policy

Recommended learner policy:

```text
TO authenticated
USING (status = 'active')
```

Replace the deprecated `auth.role()` predicate with a role-targeted policy. Do not grant ordinary clients a second policy that can see non-active rows.

### 5.2 Write permissions

- `anon`: no INSERT, UPDATE, DELETE or TRUNCATE authority.
- `authenticated`: no direct INSERT, UPDATE, DELETE or TRUNCATE authority.
- `service_role`: required product write operations from trusted server only.
- Human approval is submitted to a trusted server action that records the Factory review/event and performs the status transition transactionally.

Routine retirement is `active → inactive`. Product deletion is an exceptional administrative operation outside the Factory workflow.

### 5.3 Mandatory compatibility audit before tightening reads

Do not change the current policy until the application code and live behavior prove that learner-facing direct queries either already filter `active` or remain correct when RLS supplies only active rows.

The later Phase 4.4a audit confirmed authenticated direct production reads. Some ID-based metadata reads do not filter `status=active`, so replacing the base-table policy as originally proposed would risk hiding subject/category metadata for inactive questions referenced by historical activity. The policy must be redesigned around a narrow historical-metadata access path before tightening the base table. See [`phase-4.4a-client-storage-audit.md`](phase-4.4a-client-storage-audit.md).

At minimum verify:

- normal practice/quiz question loading;
- admin/reviewer screens, if any;
- Dungeon and Raid flows;
- any count/coverage query executed with an authenticated user token;
- any direct `.from('questions')` REST/SDK call;
- behavior for inactive questions already referenced by historical attempts.

## 6. Target Storage architecture

Use two trust zones.

### 6.1 Private staging bucket: `question-factory-assets`

Purpose: candidate and revision assets before final approval/promotion.

- `public=false`;
- trusted server/service uploads only;
- no `anon` or ordinary `authenticated` INSERT/UPDATE/DELETE policies;
- human review receives short-lived signed URLs from a trusted server;
- path includes immutable run/slot/asset revision identity, not only question ID;
- retain checksum, MIME, dimensions and QC result in `question_factory_assets`.

### 6.2 Public product bucket: `question-images`

Purpose: approved assets referenced by active product questions.

- retain `public=true` so existing URLs and gameplay rendering continue to work;
- remove anonymous write policies only after confirming no current frontend depends on them;
- writes occur exclusively through the trusted Storage API using service authority;
- final object name remains `q{question_id}.svg` or `.webp`;
- product metadata update and activation occur only after final object upload is verified;
- replacement requires a new Factory asset revision, QC and audited promotion;
- do not modify `storage.objects` rows directly with SQL.

### 6.3 Promotion sequence

```text
approved private asset revision
  → trusted worker uploads/copies final object through Storage API
  → verify object exists, MIME/size/checksum match
  → attach complete image tuple to non-active question
  → record promotion event
  → human-reviewed status transition to active
```

If final filenames remain stable and an approved asset is replaced, CDN cache behavior must be verified. A versioned public path is safer for immutable caching, but changing the existing `q{id}.ext` convention is deferred unless Phase 4.4 confirms the application can accept it.

## 7. Human-review authorization

For v1, prefer a server-maintained reviewer allowlist or immutable authorization data controlled by administrators. Do not authorize with user-editable metadata.

Every review action records:

- authenticated reviewer ID;
- decision and note;
- exact question and asset revisions reviewed;
- previous/new state;
- timestamp and idempotency key.

Approval must fail closed if the candidate changed after the reviewer loaded it. Human approval must not silently approve a newer content or asset revision.

## 8. No public publishing RPC in v1

Do not add a generic public `SECURITY DEFINER` function such as `publish_question(question_id)`. Public functions receive EXECUTE for `PUBLIC` by default unless explicitly revoked, and security-definer code can bypass RLS.

Preferred v1 implementation:

- trusted server/service role performs a narrow transaction;
- transaction validates expected slot/question/asset revisions and current states;
- Factory review, event, product mapping and product status update succeed or roll back together;
- idempotency prevents duplicate activation or duplicate question insertion.

If a database function becomes necessary later, keep it outside exposed API schemas where possible, pin `search_path`, perform explicit caller/staff checks, revoke EXECUTE from `PUBLIC`, `anon`, and ordinary `authenticated`, and grant only to the intended trusted role.

## 9. Rollout order

No permission should be changed ad hoc. Phase 4.4 migration review should order work as follows:

1. Audit and document all direct question reads and current asset upload callers.
2. Establish the trusted worker/key-custody path.
3. Create and test server-only Factory tables and grants.
4. Create the private staging bucket through the supported Storage API.
5. Test signed review access and service-only upload/promotion.
6. Replace the questions read policy with active-only access in a safe environment and run compatibility tests.
7. Revoke unnecessary client write grants on `questions`.
8. Remove anonymous write policies from `question-images` only after upload dependency verification.
9. Test existing public image URLs and all gameplay paths.
10. Run Supabase security/performance advisors and read-only verification.

Changes to question RLS and existing Storage policies should be separately reversible migration steps so a compatibility failure can be rolled back without removing the new Factory model.

## 10. Verification matrix

| Actor | Expected result |
|---|---|
| `anon` reads `questions` | denied/no rows according to product requirement; no draft exposure |
| authenticated learner reads active question | allowed |
| authenticated learner reads inactive/draft/pending question | denied/no row |
| anon/authenticated inserts or updates question | denied |
| anon/authenticated uploads/overwrites product asset | denied |
| anon/authenticated accesses private staging object directly | denied |
| reviewer requests signed staging preview through trusted server | allowed for exact authorized revision |
| service worker creates Factory state and non-active product row | allowed |
| service worker promotes approved asset through Storage API | allowed and verified |
| public client loads existing approved product image URL | allowed |
| retry of publish operation | idempotent; no duplicate question/event/asset |
| stale reviewer approval | rejected |
| Dungeon/Raid selection | active questions only; unchanged routing behavior |

## 11. Explicit non-goals

- No production policy, grant, bucket or object change in Phase 4.3.
- No cleanup of 70 legacy Base64 question images.
- No broad audit/remediation of unrelated public `SECURITY DEFINER` RPCs.
- No introduction of client-side service keys.
- No direct SQL mutation of `storage.objects` or `storage.buckets`.
- No automatic activation.

The production security advisor was also run read-only. It reports multiple existing warnings, including public/authenticated execution of `SECURITY DEFINER` functions and mutable function `search_path` settings. Those findings reinforce the rule against adding a public Factory publishing RPC, but remediation of unrelated existing functions is a separate security project and must not be bundled into the Factory migration without dependency review. See the [Supabase database linter guidance](https://supabase.com/docs/guides/database/database-linter).

## 12. Official references

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design)
- [Secure configuration of Supabase products](https://supabase.com/docs/guides/security/product-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

## 13. Acceptance decisions required

Before Phase 4.4 can draft migration SQL, reviewers must approve:

1. Factory tables are server/service-only with no learner policies.
2. Learners may read only `active` questions.
3. Existing authenticated/direct question reads will be audited before policy replacement.
4. Factory uses a private staging bucket and promotes approved assets to the existing public bucket.
5. Anonymous write access to `question-images` will be removed after dependency verification.
6. Human approval runs through a trusted server action and is revision-bound.
7. No generic public publishing RPC or automatic activation is introduced in v1.
