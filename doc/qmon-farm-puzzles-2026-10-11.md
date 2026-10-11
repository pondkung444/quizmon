# Qmon Farm phase 2 — persisted puzzles and guided discovery

Status: implementation and local synthetic checks complete; PostgreSQL CI and PR review pending. Production migrations have not been applied. The catalogue remains disabled.

## Behavior

- Project checkpoints keep an immutable server-only generated puzzle and content version. Clients receive the public view, draft, revision, session ID and project status.
- Wrong answers retain the board, draft and original deadline. Expired rounds are settled once. Submission IDs deduplicate retries; session/deadline comparisons reject stale responses. Each new checkpoint avoids repeating the previous public board.
- Guided discovery lessons are untimed. Wrong answers keep the current session. Completion creates the blueprint once without awarding coins or experience. Explicit replay creates a new board and cannot grant a second reward.
- Legacy school and garden commands receive additive draft storage. Their prices, 45/45/90/15 school timings and garden rule values are unchanged. Their existing placement, wallet and leadership guards remain active.
- Four subject screens use labelled touch controls and three hint levels. A development-only `/collection/preview` route, requiring `FARM_PREVIEW=true` and `NODE_ENV=development`, verifies UI behavior with synthetic fixtures and no database access. Production cannot enter this route or its mock actions.

## Validation

Local synthetic checks:

- 61 isolated database assertions: migration load, owner boundaries, private table/RPC access, immutable board, optimistic draft revisions, retry deduplication, stale rounds, expiry, single discovery, replay, old school/garden drafts, original prices/waits and wallet behavior.
- Five server authorization tests: signed-out calls never reach privileged reads, verified owner scope, server-computed pass verdict, completed-checkpoint retry, public payload filtering.
- Three adapter tests: private fields omitted, malformed answers handled safely, unsupported content versions fail closed.
- Existing generator suite: 3,000 seeds for pond/flower/bridge and 1,500 for observatory; determinism, validation, hints and alternative valid solutions passed.
- 45 browser assertions: 320×568, 375×667, 390×844 and 844×390; no horizontal overflow, hint entry, wrong-answer continuation, saved drafts after reload, and four solved server-validated fixture puzzles. Screenshots are local in `test-results/farm-phase2/`.
- TypeScript and targeted React/server lint passed locally.

Real account checks: **none**. These results do not measure real student learning, real account gameplay, production latency or the required two-week trial. No production data or migration changes were used to test.

## Academic content and opening gate

Flower experiments use explicitly fictional plots and visible experiment clues instead of unsupported claims about the needs of particular plant species. The lesson explains that light provides energy, water and carbon dioxide are used to form sugars, and oxygen is released; soil/minerals support growth. Its experimental matching puzzle is a guided reading exercise, not evidence of mastery of the chemical process.

Sources checked:

- [Photosynthesis overview — Khan Academy](https://www.khanacademy.org/science/biology/photosynthesis-in-plants/photo-synthesis/a/photosynthesis-overview)
- [Water cycle — USGS](https://www.usgs.gov/water-science-school/water-cycle)
- [Planets — NASA](https://science.nasa.gov/solar-system/planets/)

The teaching content and difficulty remain reviewable before the corresponding places are enabled. The real student trial belongs to phase 10 after approved production publication.

## Rollout and following phases

This is stacked on phase 1 PR #310. Do not merge/deploy or apply migrations to monschool without the production approval required by the plan. Apply only new migrations once, in chronological order after checking the recorded migration history.

Phase 3 connects school upgrades, queues and teams to these project puzzle sessions. The old school and gardens continue to use their original commands, with additive draft support. Geometry/bridges, place unlocks, ambient activity, friends and notifications follow in the specified order. Nothing here enables production catalogue rows.

