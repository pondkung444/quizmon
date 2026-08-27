# Phase 4.2 — Product Mapping Adapter Contract (Question Factory v1)

Status: **Proposed contract — review required before implementation**  
Production snapshot: `monschool` (`wmndxiuqzrnqbhrznmfg`), surveyed read-only on 2026-08-27  
Scope: mapping a validated Factory slot into the existing `public.questions` product schema  
Database changes made during this phase: **none**

## 1. Decision summary

Question Factory must adapt to the existing QuizMon product model. It must not redefine the meaning of existing columns.

The adapter is a deterministic, versioned boundary:

```text
resolved profile + blueprint slot + validated question + approved asset
                              │
                              ▼
                 Product Mapping Adapter v1
                              │
                              ▼
                 public.questions-compatible row
```

The adapter must produce a candidate row, validate it, and save the complete mapping input/output snapshot in Factory history before any later publishing step writes to `public.questions`.

The central legacy mapping is:

| Factory semantic subject | `questions.grade_band` | `questions.subject` | `questions.branch` |
|---|---|---|---|
| `math` (lower secondary) | `junior` | `math` | `null` |
| `science` (lower secondary) | `junior` | `science` | `null` |
| `physics` (upper secondary) | `senior` | `math` | `physics` |
| `chemistry` (upper secondary) | `senior` | `science` | `chemistry` |
| `biology` (upper secondary) | `senior` | `science` | `biology` |

`physics` must never be written to `questions.subject`. This is deliberate legacy compatibility, not a taxonomy error to repair in v1.

## 2. Verified production contract

At survey time, `public.questions` contained 3,663 rows: 3,443 `active` and 220 `inactive`. No `draft` or `pending_review` rows existed.

### 2.1 Columns and database constraints

| Column | DB type / nullability | Verified constraint or convention |
|---|---|---|
| `id` | `bigint`, not null, identity | Product-generated identifier; Factory must not predict it |
| `subject` | `text`, not null | DB check: `math`, `science` |
| `category` | `text`, not null | No DB enum; operationally significant exact string |
| `difficulty` | `smallint`, not null, default 1 | DB check: integer 1–3 |
| `question_text` | `text`, not null | No empty-string DB check |
| `choices` | `jsonb`, not null | All 3,663 production rows are arrays of exactly four strings |
| `correct_index` | `smallint`, not null | Production convention is zero-based; all current values are in 0–3 |
| `explanation` | `text`, nullable | All current rows contain a non-empty explanation |
| `status` | `text`, not null, default `active` | DB check: `active`, `inactive`, `draft`, `pending_review` |
| `grade_band` | `text`, not null, default `junior` | DB check: `junior`, `senior` |
| `branch` | `text`, nullable | DB check: null, `physics`, `chemistry`, `biology` |
| `grade_level` | `text`, nullable | No DB constraint; current populated form is Thai, e.g. `ม.1`–`ม.3` |
| `chapter` | `text`, nullable | No DB constraint; exact Thai curriculum label where populated |
| `image_url` | `text`, nullable | Modern rows use a public Storage URL; 70 legacy rows use data URIs |
| `image_prompt` | `text`, nullable | Required by Adapter v1 when a new asset is present |
| `image_filename` | `text`, nullable | Current modern convention: `q{id}.svg` |
| `image_type` | `text`, nullable | DB check: null, `svg`, `webp` |

The database does **not** enforce all semantic cross-field invariants. The adapter must enforce them before publishing.

### 2.2 Indexes that expose current access patterns

- `(grade_band, subject, status, difficulty)`
- `(grade_band, branch, status, difficulty) WHERE branch IS NOT NULL`
- `(subject, category, difficulty)`

These indexes reinforce that `grade_band`, product `subject`, `branch`, `category`, `status`, and `difficulty` are runtime product fields, not free-form Factory metadata.

### 2.3 Referential and lifecycle constraints

- `quiz_attempts.question_id → questions.id ON DELETE CASCADE`
- `raid_boss_questions.question_id → questions.id`
- `raid_run_steps.quiz_question_id → questions.id`

Factory retirement must therefore map to `status='inactive'`. Deleting a published question is not a normal Factory workflow.

## 3. Adapter input contract

The adapter receives resolved, validated values; it must not infer missing curriculum semantics from question prose.

Minimum semantic input:

```yaml
mapping_version: question-product-mapping/v1
education_stage: lower_secondary | upper_secondary
grade: 7 | 8 | 9 | 10 | 11 | 12 | null
subject: math | science | physics | chemistry | biology
topic_id: stable_factory_topic_id
product_category_id: approved_registry_entry
difficulty: 1 | 2 | 3
question_text: non_empty_string
choices: [string, string, string, string]
correct_index: 0..3
explanation: non_empty_string
publication_intent: draft | pending_review
asset: null | approved_asset
```

`product_category_id` must resolve through a versioned mapping registry. The adapter must reject an unknown registry entry instead of manufacturing a new `category` string.

## 4. Deterministic field mapping

### 4.1 Curriculum and routing fields

| Product field | Mapping rule | Failure condition |
|---|---|---|
| `grade_band` | `lower_secondary → junior`; `upper_secondary → senior` | Unsupported stage |
| `subject` | Use the table in section 1 | Unsupported stage/subject pair |
| `branch` | Junior subjects → `null`; Physics/Chemistry/Biology → same branch value | Junior with non-null branch; Senior science specialization without branch |
| `category` | Exact `product_category` from approved registry entry | Missing/unknown mapping; blank value |
| `grade_level` | Lower secondary grade 7/8/9 → `ม.1`/`ม.2`/`ม.3`; upper secondary v1 → `null` | Junior grade absent or outside 7–9 |
| `chapter` | Junior Math: exact approved Thai chapter label; Junior Science v1: `null`; all Senior v1: `null` | Unregistered Junior Math chapter |

The Senior `category` label remains the current product taxonomy and includes its legacy level prefix:

- Physics: `ฟิสิกส์ ม.6 — {approved topic}`
- Chemistry: `เคมี ม.4-6 — {approved topic}`
- Biology: `ชีวะ ม.4-6 — {approved topic}`

These strings must come from the registry, including spelling, punctuation, and spacing. They must not be constructed from a translated topic title at runtime.

### 4.2 Question, answer, and status fields

| Product field | Adapter v1 rule |
|---|---|
| `difficulty` | Copy integer 1–3 after Factory calibration/QC |
| `question_text` | Copy validated non-empty text |
| `choices` | Serialize exactly four non-empty strings as a JSON array, preserving order |
| `correct_index` | Copy zero-based index; verify `0 <= index < choices.length` |
| `explanation` | Require and copy a non-empty explanation even though DB permits null |
| `status` | New Factory output may enter only as `draft` or `pending_review`; Adapter v1 must never create directly as `active` |
| `created_at` | Omit from insert payload and let the DB default apply |
| `id` | Omit from insert payload and let identity generation apply |

The production table currently contains only four-choice questions. Although Factory Core may model 3/4/5 choices for future products, this adapter version accepts exactly four. Supporting another choice count requires a new mapping-contract version plus end-to-end client/RPC verification.

### 4.3 Image fields

For a question without an asset, all four image fields must be `null`.

For a question with an approved asset:

| Product field | Adapter v1 rule |
|---|---|
| `image_url` | Permanent HTTPS URL in the `question-images` Storage bucket; never a data URI/Base64 value |
| `image_prompt` | Non-empty final generation/build specification used for the approved revision |
| `image_filename` | `q{question_id}.svg` or `q{question_id}.webp` after the product ID exists |
| `image_type` | `svg` or `webp`, matching filename extension and actual MIME type |

Because the filename convention requires the generated product ID, asset publication is a staged operation: create the non-active question, obtain `id`, publish the approved asset under its final name, then attach all four image fields atomically. A question must not become `active` while its required asset tuple is incomplete.

The 70 existing data-URI rows are grandfathered legacy data only. They are not valid output from Adapter v1 and are outside this phase's cleanup scope.

## 5. Category registry requirements

The mapping registry is versioned and immutable once referenced by a Factory run. Each entry should contain at least:

```yaml
id: stable_mapping_id
mapping_version: question-product-mapping/v1
factory:
  education_stage: upper_secondary
  subject: physics
  topic_id: waves_and_sound
product:
  grade_band: senior
  subject: math
  branch: physics
  category: "ฟิสิกส์ ม.6 — คลื่นและเสียง"
  grade_level: null
  chapter: null
```

Rules:

1. Matching uses stable IDs, never fuzzy matching on Thai labels.
2. A run stores the resolved registry entry as an immutable snapshot.
3. Renaming or reclassifying a category creates a new registry version; it does not silently rewrite old snapshots or published questions.
4. Coverage and weakness analytics count by the exact product `category`, so accidental label variants are breaking data changes.
5. A new category requires an explicit product-taxonomy review before Factory can publish it.

## 6. Legacy mappings observed in production

### Junior

- Junior Math uses `subject=math`, `branch=null`. Of 1,080 rows, 980 have both `grade_level` and `chapter`; 100 legacy active rows for `สถิติเบื้องต้น` have both null.
- Junior Science uses `subject=science`, `branch=null`. All 1,183 rows have `chapter=null`; 988 active rows have `grade_level`, while 45 active and 150 inactive legacy rows do not.
- Adapter v1 does not copy these omissions forward: a new Junior item requires a resolvable grade. Junior Science keeps `chapter=null` until a separate taxonomy migration is approved.

### Senior

- Physics: 400 active rows use `grade_band=senior`, `subject=math`, `branch=physics`.
- Chemistry: 400 active rows use `grade_band=senior`, `subject=science`, `branch=chemistry`.
- Biology: 600 active rows use `grade_band=senior`, `subject=science`, `branch=biology`.
- All 1,400 Senior rows currently have `grade_level=null` and `chapter=null`; topic routing is carried by exact `category` strings.

Existing rows that violate the stricter Adapter v1 rules remain valid legacy product data. They do not need fabricated Factory history and must not be automatically normalized by this adapter.

## 7. RPC and gameplay dependencies

The survey found six public database functions that directly depend on `questions`:

| Function | Dependency that the adapter must preserve |
|---|---|
| `start_dungeon_bonus` | Selects only `active`; filters by user `grade_band`; prefers exact weak `category`; returns question/answer fields |
| `choose_raid_path` | Computes weakness through `quiz_attempts → questions.category`; selects `active` by `grade_band` and category |
| `start_raid_boss` | Selects random `active` questions by `grade_band` |
| `answer_raid_boss` | Reads `correct_index` and `explanation` |
| `submit_raid_obstacle_answer` | Reads zero-based `correct_index` |
| `collect_pet_with_stats_snapshot` / `get_pet_branch_counts` | Attribute performance using `coalesce(branch, subject)` or `branch` |

Consequences:

- `category` is an analytics/routing key, not merely display copy.
- `branch` determines Senior subject specialization and pet progression attribution.
- `grade_band` controls question eligibility for dungeon and raid flows.
- Publishing with an incorrect `active` status can immediately expose the question to gameplay.
- Answer indexes and choice order must never be transformed independently.

No public view referencing `questions` was found at survey time.

## 8. Validation and rejection rules

Before a candidate can leave the adapter, all of the following must pass:

1. The mapping version and registry entry exist and match the resolved profile snapshot.
2. The stage/subject combination maps exactly to an allowed `grade_band/subject/branch` tuple.
3. `category` equals the registry value byte-for-byte after normal serialization; no trim-based repair is allowed at publication time.
4. Junior output has `branch=null`; Senior output has the expected non-null specialization.
5. Required Junior grade and Junior Math chapter mappings resolve.
6. Difficulty is an integer from 1 to 3.
7. Question text, all four choices, and explanation are non-empty.
8. Choices are four JSON strings; `correct_index` is zero-based and within bounds.
9. Initial status is `draft` or `pending_review`, never `active`.
10. Image fields are either all null or form a complete, internally consistent approved tuple.
11. The output contains no Factory-only metadata fields.

Failures must be explicit (`UNMAPPED_SUBJECT`, `UNMAPPED_CATEGORY`, `INVALID_GRADE`, `INVALID_CHAPTER`, `INVALID_CHOICES`, `INVALID_CORRECT_INDEX`, `INCOMPLETE_ASSET`, etc.) and must not be repaired through guessed defaults.

## 9. Factory metadata that must not enter `questions`

Keep these in Factory tables/snapshots only:

- learning objective and curriculum provenance
- cognitive demand and question archetype
- blueprint slot and coverage accounting
- profile/blueprint/mapping versions
- generation prompts other than the approved product image prompt
- candidates, revisions, QC evidence, review judgments, and event history
- run/slot identifiers and model/provider metadata

The product row remains a compact gameplay projection; Factory history remains the production/audit system.

## 10. Publishing boundary and idempotency

Phase 4.2 defines mapping only; it does not authorize a production write. A later publishing service should:

1. Load immutable profile, blueprint, and product-mapping snapshots.
2. Generate and validate the candidate product row.
3. Use a Factory-side unique product mapping for the slot so retries cannot create duplicate questions.
4. Insert only in a non-active state.
5. Attach an approved asset if required.
6. Promote to `active` only through a separate reviewed transition.
7. Retire by setting `inactive`, never by routine deletion.

Do not rely on DB column defaults for semantic decisions. The adapter must send `grade_band`, `subject`, `branch`, `category`, `difficulty`, and initial `status` explicitly.

## 11. Known risks outside this phase

- The current `questions` SELECT policy allows authenticated users to read all statuses; it does not filter to `active`. Before Factory creates persistent drafts, Phase 4.3 must audit direct client queries and choose whether to tighten RLS or enforce a safe read boundary.
- Existing Storage permissions and asset-upload authority require a separate Phase 4.3 review.
- There are no DB checks enforcing choice shape, correct-index bounds, or cross-field stage/subject/branch validity. Adapter validation is therefore mandatory; DB hardening, if desired, belongs to a reviewed migration phase.
- `category` taxonomy changes can fragment weakness analytics and should be treated as versioned product changes.

## 12. Acceptance criteria for Phase 4.2

This contract is ready to proceed only when reviewers approve all of the following:

- the five subject mappings in section 1;
- exact-category registry ownership and change process;
- Junior grade/chapter policy and Senior null policy;
- four-choice, zero-based answer contract for v1;
- non-active-only initial publication;
- staged asset naming/publication flow;
- grandfathering of legacy rows without backfill or automatic normalization.

After approval, the next deliverable is Phase 4.3 (RLS / Storage / Permission Plan). No production schema or data should be changed as part of approving this document.
