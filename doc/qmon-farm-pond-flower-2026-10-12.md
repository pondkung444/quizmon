# Qmon Farm phase 5 — pond and flower (2026-10-12)

Branch: codex/qmon-farm-pond-flower, stacked on phase 4 PR #313. Production catalogue remains disabled; no new production migration or account progress changes were performed.

The project queue now offers pond and flower with discovered blueprint, confirmed school level, placed prerequisites, suitable available leader, job capacity, reserved place cap and wallet conditions. School level 3 requires an actually placed pond. Successful purchases renew their request nonce; uncertain failures keep the previous nonce for safe retries. Balance is refreshed through the existing authenticated wallet command after purchase, preserving the original daily/milestone credit rules.

The blueprint book uses the enabled catalogue and actual discoveries, removes outdated descriptions, links to guided lessons and the project queue. Pond/flower use permanent transparent isometric artwork on the map and queue. Construction cards dim the same final art and show checkpoint progress; this is a deliberate construction treatment, not an unapproved final placeholder.

Assets generated with builtin imagegen, copied without conversion or editing:
- public/farm/qmon-pond-v1.png
- public/farm/qmon-flower-v1.png

Both are 1254×1254 RGBA, with alpha range 0–255. Full prompts and generation mode: doc/qmon-farm-phase5-art-prompts-2026-10-12.json. Style/alpha were inspected visually and via metadata; Next Image handles delivery optimization.

## Verification

- Isolated PGlite database: 138 checks. Both places: reject before discovery, guided lesson discovery without coins, idempotent purchase at 50 coins, 8h/8h/8h snapshot and 180/240s timers, two checkpoint transitions, finishing before placement, first reward 20 once, replay without coins, two repeat builds without first reward, rejection of fourth place without debit. Also preserves earlier school/layout/security checks.
- These SQL tests deliberately advance clocks and pass trusted internal checkpoint results in disposable fixtures. They test transaction/state behavior, not a real player's learning or waiting experience.
- 50 automated farm/server tests passed, including generated puzzle validation and malformed answer/privacy checks; generator checks cover 3000 seeds per subject (observatory 1500).
- Browser: 45 actual server-validated subject puzzle checks across four viewport sizes; 21 construction-team checks; 24 catalogue checks across 320×568, 375×667, 390×844, 844×390. Catalogue mock purchases become ready instantly, exercising the real queue component and fresh request IDs, not database or real-time progression.
- Final typecheck and changed-file lint passed.
- No real account gameplay, live schema writes, production push, deployment or migration execution. No claim about child comprehension or field performance. Teacher/child review remains required before release/phase 10.

## Remaining

CI and review of this stacked PR; phase 6 bridge/observatory and full progression; phase 7 activities/history/replay and differentiated school artwork; phases 8–9 social/notifications/release verification. Publish only after explicit production approval. Phase 10 requires at least two weeks after publication.
