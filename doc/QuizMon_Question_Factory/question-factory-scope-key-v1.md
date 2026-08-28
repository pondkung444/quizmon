# Question Factory Scope Key Contract v1

Status: **Locked for Factory v1**

## Purpose

`question_factory_runs.scope_key` is the canonical lock identity for one learner-content coverage unit. It prevents two open runs from producing overlapping content for the same stage, grade, Factory-semantic subject, and unit.

It is not a batch name, profile version, blueprint version, date, or projection of the legacy `questions` taxonomy.

## Canonical format

```text
qf:v1|stage={stage}|grade={grade}|subject={subject}|unit={unit_id}
```

Pilot example:

```text
qf:v1|stage=lower_secondary|grade=7|subject=math|unit=decimals_and_fractions
```

Senior example:

```text
qf:v1|stage=upper_secondary|grade=11|subject=physics|unit=kinematics
```

## Allowed combinations

| Stage | Grade | Factory subject |
|---|---|---|
| `lower_secondary` | `7`, `8`, `9` | `math`, `science` |
| `upper_secondary` | `10`, `11`, `12` | `physics`, `chemistry`, `biology` |

The subject is always the Factory semantic. For example, Physics uses `subject=physics`; its legacy product projection to `questions.subject=math` and `questions.branch=physics` belongs only to Product Mapping Adapter v1.

## Unit identifier

`unit_id` is a stable English machine identifier:

- lowercase ASCII letters and digits;
- single underscores between segments;
- 1–64 characters;
- no Thai display label, whitespace, hyphen, version, date, or batch number.

The shared application builder trims the input, lowercases it, converts whitespace/hyphens to underscores, collapses repeated underscores, and then validates it. Persisted keys must already be canonical; the database never silently rewrites them.

## Lock granularity

Factory v1 permits one Run to own exactly one `stage + grade + subject + unit` scope. A multi-unit production request must create separate Runs.

Broad keys that omit `unit`, such as an entire grade or subject, are invalid. This avoids hierarchical overlap that the exact partial unique index cannot detect.

Profile, blueprint, mapping, and worker versions are intentionally excluded. Changing those versions does not make simultaneous production for the same learner-content scope safe.

## Enforcement

- Application code must construct keys only through `buildQuestionFactoryScopeKey()`.
- Database validation rejects malformed, non-canonical, overlong, or semantically incompatible keys.
- The existing partial unique index allows only one open Run per canonical key across `created`, `running`, `paused`, and `waiting_human_review`.
- A future format change requires a new prefix such as `qf:v2`; v1 meaning must never be changed in place.
