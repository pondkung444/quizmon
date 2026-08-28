# Question Factory Scope Key Contract v1

Status: **Format and curriculum registry binding locked for Factory v1; Phase 4.7 complete**

## Purpose

`question_factory_runs.scope_key` is the canonical lock identity for one learner-content coverage unit. It prevents two open runs from producing overlapping content for the same stage, grade, Factory-semantic subject, and unit.

It is not a batch name, profile version, blueprint version, date, or projection of the legacy `questions` taxonomy.

## Canonical format

```text
qf:v1|stage={stage}|grade={grade}|subject={subject}|unit={unit_id}
```

Pilot example:

```text
qf:v1|stage=lower_secondary|grade=7|subject=math|unit=cc_a20910939a299b40d99910af
```

Senior example:

```text
qf:v1|stage=upper_secondary|grade=11|subject=physics|unit=cc_0123456789abcdef01234567
```

The Senior value above illustrates the key shape only; a real Run must use a `chapter_key` resolved from the production registry.

## Allowed combinations

| Stage | Grade | Factory subject |
|---|---|---|
| `lower_secondary` | `7`, `8`, `9` | `math`, `science` |
| `upper_secondary` | `10`, `11`, `12` | `physics`, `chemistry`, `biology` |

The subject is always the Factory semantic. For example, Physics uses `subject=physics`; its legacy product projection to `questions.subject=math` and `questions.branch=physics` belongs only to Product Mapping Adapter v1.

## Unit identifier

`unit_id` is a stable ASCII machine identifier. For QuizMon production v1 it is the registry `chapter_key` (`cc_` followed by 24 lowercase SHA-256 hex characters):

- lowercase ASCII letters and digits;
- single underscores between segments;
- 1–64 characters;
- no Thai display label, whitespace, hyphen, version, date, or batch number.

The shared application builder trims the input, lowercases it, converts whitespace/hyphens to underscores, collapses repeated underscores, and then validates it. Persisted keys must already be canonical; the database never silently rewrites them.

### Binding to `curriculum_chapters`

The scope `unit_id` must resolve to exactly one approved `public.curriculum_chapters` row for the stage, grade and Factory-semantic subject after product-subject mapping.

Production now has a unique, non-null `chapter_key` on every one of its 95 rows. The server resolver in `src/lib/questionFactory/curriculumChapterServer.ts` binds that key to exactly one compatible stage/grade/subject route before a Run. Do not use the numeric `curriculum_chapters.id` as `unit_id`, derive identity from row order, or transliterate the Thai chapter label at runtime.

For traceability, snapshots may store the environment-local row `id` alongside the stable `unit_id` and resolved chapter fields. The stable key owns cross-environment identity; the numeric ID only proves which local row was resolved.

## Lock granularity

Factory v1 permits one Run to own exactly one `stage + grade + subject + unit` scope. A multi-unit production request must create separate Runs.

Broad keys that omit `unit`, such as an entire grade or subject, are invalid. This avoids hierarchical overlap that the exact partial unique index cannot detect.

Profile, blueprint, mapping, and worker versions are intentionally excluded. Changing those versions does not make simultaneous production for the same learner-content scope safe.

## Enforcement

- Application code must construct keys only through `buildQuestionFactoryScopeKey()`.
- Database validation rejects malformed, non-canonical, overlong, or semantically incompatible keys.
- The existing partial unique index allows only one open Run per canonical key across `created`, `running`, `paused`, and `waiting_human_review`.
- A future format change requires a new prefix such as `qf:v2`; v1 meaning must never be changed in place.
