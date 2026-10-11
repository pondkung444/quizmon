# Qmon Farm phase 3 — school upgrades and teams (2026-10-12)

Development is isolated in `codex/qmon-farm-school-teams`, stacked on phase 2. Original checkout changes are untouched. No production database migrations or real account progress writes have been performed.

Schools 2–4 upgrade the existing school plot. Construction checkpoints alternate randomized floor and path boards; the locked floor starter and rotated path endpoints are persisted server-side. Wrong answers retain the board and deadline. The new submit response returns the current draft revision so editing can continue after a wrong answer. Draft writes and answer submission are serialized in the client, with request IDs reused after an uncertain response.

The queue supports leader and helper selection, helper withdrawal, team changes, pausing and resuming. Its status separates the next help checkpoint from final finishing. Paused, puzzle and ready jobs occupy slots until placement/upgrade confirmation. Offline finishing frees Qmon when the due time passes, while the ready project still occupies a slot. Adventure selection excludes farm leaders and helpers; database triggers remain the final mutual-exclusion guard. Daily/PvP/Raid behavior is unchanged.

Owner-scoped reads use a verified session. Privileged team reads are restricted to that owner's project IDs. The existing school/garden save remains authoritative, and installations without the additive tables keep their legacy pet selection. Catalogue rows remain disabled until the final reviewed release.

Validation performed with synthetic data only:

- 38 farm TypeScript tests passed, including 1,000 generated boards per construction type, privacy, invalid layouts, queue capacity and busy-pet filtering.
- 8 server authorization/idempotency tests passed.
- 91 isolated PGlite database checks passed, including schools 2–4 prerequisites, leader stages, helpers, Adventure conflict, original plot, offline completion and one-time rewards. Subject sessions and legacy school/garden tests remain in this suite.
- 21 browser checks passed for randomized floor/path boards at 320×568, 375×667 and 844×390. Screenshots inspected. A collapsed embedded path board was found and fixed without changing the existing full-screen layout.
- 21 team browser checks passed at the same three viewport sizes: helper cap, Adventure exclusion, helper removal, pause, new leader selection and resume. Commands in this UI test are synthetic mocks. PostgreSQL 17 CI is pending until the PR run.
- TypeScript and lint passed locally. The committed revision must also pass CI.

Mock UI commands are separate from SQL integration tests. Mock previews require both development mode and `FARM_PREVIEW=true`; production renders notFound. No real account playthrough has been performed.

Remaining before phase 4: finish team browser checks, review the new UI/serialization code, create and attach the phase 3 PR, confirm CI, and record the exact PR/head/test results in the Notion plan. School 3/4 prerequisite records are synthetic fixtures; actual complete place progression is rechecked in phase 6. Artwork for upgraded school levels belongs to phase 7. Production publication needs user approval, followed by the agreed real trial of at least two weeks.
