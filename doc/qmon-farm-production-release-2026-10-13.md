# Qmon Farm production database activation — 2026-10-13 (Asia/Bangkok)

The user approved applying the new production migrations and enabling the catalogue in monschool / wmndxiuqzrnqbhrznmfg. Application main already includes phases 1–9 and fixes #319/#320; deployment 062dc6c is live. Original dirty checkout was preserved.

## Execution

Applied only these previously absent source versions, in order:

- 20261011144152 qmon_farm_project_foundation
- 20261011152519 qmon_farm_puzzle_sessions
- 20261011162721 qmon_farm_school_teams
- 20261011170920 qmon_farm_layout_connectors
- 20261011182216 qmon_farm_friend_visits
- 20261011184521 qmon_farm_attention

MCP initially records execution-time versions. The six new history rows were explicitly aligned to their existing repository source versions, without re-executing SQL, to prevent later duplicate application. Legacy versions 20261004143439 / 20261005023219 / 20261005052159 were not rerun or altered.

Production's inherited table privileges grant API roles more privileges than the synthetic fixture. Added 20261013142020 qmon_farm_notification_privileges to explicitly revoke all public/anon/authenticated privileges on farm_notification_settings, restore only owner-readable SELECT to authenticated, and retain service_role writes. RLS is retained. Test reproduces inherited grants before applying the correction, including denying TRUNCATE. This is permission hardening, with no preference or account-data changes.

All eight catalogue definitions were compared to FARM_CATALOGUE, including price, firstReward, ordered waits, timer, level, prerequisite, leader, cap, content version, capacity and helper/penalty percentages. Only enabled was changed to true for these eight version-1 entries. Purchased rule snapshots were not changed. Notification preference still defaults false; zero users were opted in at activation. No FCM was sent.

## Preservation evidence

Before applying SQL, saved a private local snapshot of farm saves, wallet/ledger/discoveries and legacy function definitions; this is a scoped farm snapshot, not a full database backup. It is intentionally untracked and must not be published with credentials or account identifiers.

Immediately after the six migrations, normalized old fields matched exactly:

| Existing data | Before | After | Content |
| --- | --- | --- | --- |
| School jobs | 7 | 7 | Unchanged |
| Garden jobs | 3 | 3 | Unchanged |
| Wallets | 27 | 27 | Unchanged |
| Coin ledger | 129 | 129 | Unchanged |
| Blueprint discoveries | 3 | 3 | Unchanged |

Comparison excludes only the newly added empty draft_layout column. No balance, plan, position, status, readiness, deadline, failure or contribution changes were made to existing account progress for testing. Live player activity after activation is normal game activity and must not be treated as a migration defect merely because later counts change.

## Verification: distinct evidence types

- Production SQL: all new tables/RLS exist; private checkpoints/lessons are not selectable by authenticated; client INSERT/UPDATE on notification settings denied; all eight catalogue entries enabled.
- Advisors: server-only puzzle tables deliberately have RLS without client policies. Anonymous authenticated player accounts retain intended owner-scoped game access. These notices are not permission to expose private puzzle data or remove guest support.
- Synthetic database regression: 249 PGlite checks passed after adding three inherited-privilege assertions. PostgreSQL concurrency verification runs in PR CI. This is not a production gameplay completion claim.
- Existing real browser session: /collection, /collection/layout, /collection/projects, /collection/encouragement and /settings loaded. New placement/visit links appear, real catalogue prices and prerequisites render, unavailable purchases stay disabled, farm push switch is off. No purchases, moves, sticker sends or opt-in toggles were performed in this session.
- Created two clearly named, separate real Auth test accounts: FarmTestAe027 and FarmTestBac0c. No email was sent; test-login secrets remain only in a private untracked local file. Each authenticated normally through Auth, read all eight enabled catalogue entries, saw one starter egg from the normal signup trigger, and was denied private checkpoints, another owner's school/wallet rows and direct invocation of the privileged farm_attention RPC.
- These test accounts have not been artificially advanced or assigned coins, purchased projects, discovered plans or completed waits. Exclude marked test accounts from real-player retention/learning cohorts. Successful Auth/RLS/read checks are not the entire phase-9 acceptance loop.

## Remaining work

Play through normal hatching/care/EXP, school/discovery/project/team/checkpoint/placement/replay, and cross-game regression with the named test accounts. Keep real waits and do not manually fast-forward production progress. Authorized native test-device push and teacher/child/device review are still pending. Server-side timing/idempotence/concurrency stress remains supported by disposable fixtures, not modified production saves.

The complete feature schema/catalogue is activated on 13 October 2026. Gather post-release evidence for at least 14 days; the earliest two-week observation date is 27 October 2026. Phase 9 is not marked accepted merely by activation, and phase 10 is not complete before real evidence meets its criteria. Two weeks cannot establish every cohort's 27–64-day observatory completion or educational/retention improvement. No automation was created.

Rollback remains non-destructive: retain additive schema, migration history, purchased snapshots and player saves. Disable new sales or farm push only through a scoped operational change if needed, and retain minimum compatibility code for busy pets/capacity/layout. Do not drop tables or revert live player progress.
