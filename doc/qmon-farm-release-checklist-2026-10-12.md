# Qmon Farm release candidate and acceptance checklist — 2026-10-12

This is a review candidate, not a production release or acceptance of phase 9. Phase 10 has not started. Original dirty checkout remains untouched; changes are in the attached isolated worktree.

## Ordered PRs

| Phase | PR | Scope |
| --- | --- | --- |
| 1 | https://github.com/pondkung444/quizmon/pull/310 | Catalogue, snapshots, multi-stage project commands, old-data compatibility |
| 2 | https://github.com/pondkung444/quizmon/pull/311 | Saved puzzles and blueprint discovery |
| 3 | https://github.com/pondkung444/quizmon/pull/312 | School upgrades and teams |
| 4 | https://github.com/pondkung444/quizmon/pull/313 | Placement, movement, real bridge connectors |
| 5 | https://github.com/pondkung444/quizmon/pull/314 | Pond and flower content/art |
| 6 | https://github.com/pondkung444/quizmon/pull/315 | Bridge, observatory, school levels 2–4 |
| 7 | https://github.com/pondkung444/quizmon/pull/316 | Activities, contributor history, reward-free replay |
| 8 | https://github.com/pondkung444/quizmon/pull/317 | Permissioned friend visits and capped stickers |
| 9 | Pending PR link in Notion | Attention, opt-in FCM, start guidance and release verification |

PRs are stacked, unmerged. Review/merge them in order and adjust each remaining base to main after its prerequisite merges. Recheck the final combined diff and CI after retargeting. A preview deployment does not mean production was published.

## Schema execution plan (approval required; not executed)

Use staging first with real Auth test accounts. Before any production execution, re-read migration history and function definitions, take a recoverable database backup, and check grants. Apply only absent new versions in order:

1. 20261011144152_qmon_farm_project_foundation
2. 20261011152519_qmon_farm_puzzle_sessions
3. 20261011162721_qmon_farm_school_teams
4. 20261011170920_qmon_farm_layout_connectors
5. 20261011182216_qmon_farm_friend_visits
6. 20261011184521_qmon_farm_attention

Never rerun 20261004143439 / 20261005023219 / 20261005052159: these legacy versions were already installed. New migrations are additive, with targeted replacement of old commands for draft/layout compatibility. Compare those functions again before application. There is no balance, pet-progress, existing-project snapshot, or historical placement backfill.

Foundation catalogue rows start disabled. Explicit catalogue enablement is a release step after the application and migration combination passes staging; price/firstReward/waits/timer/leader/caps must match the approved specification. Do not modify definitions of already purchased rules snapshots. Do not enable new content merely to make a real production test pass.

## Phase 9 implementation and synthetic evidence

- Attention uses database now, combines legacy school/garden and new projects, includes overdue unrefreshed work and grouped readable sticker counts. Paused/placed work stays quiet. Read-only attention does not refresh projects or mint rewards.
- Client polling is private/no-store, authenticated by server, and anchored to monotonic elapsed time from the server timestamp. Refresh on navigation/visibility; stale overlapping responses are ignored. Existing social/PvP badges and game navigation remain.
- Separate owner-readable farm_notification_settings defaults false, no backfill. Service-only preference action derives auth owner and checks boolean input. Main push preference and granted enabled device are required.
- Existing morning/evening cron endpoints and FCM dispatcher are reused. Farm failures are isolated. Canonical quiet hours remain 21:00–07:00 weekdays / 21:00–09:00 weekends, Bangkok.
- One most-recent granted device is selected per user. Unique notification_jobs idempotency key user:farm_attention:ThaiDate permits at most one FCM attempt per user/day even during concurrent cron calls. Failed/ambiguous delivery consumes the day quota, deliberately avoiding uncertain duplicate sends. No automatic retry or web push is added. Notification delivery logging/token invalidation uses the existing dispatcher.
- Farm entry guides an owner without a started school to eggs, existing pet care, or the school tutorial when an owned stage-2+ Qmon is ready. No auto-hatching, school start, freebies or home redesign.
- Local optimized production build and typecheck passed. Changed-file lint passed. Foundation PGlite 79 checks, old garden/Daily integration 37 checks, puzzle/integration PGlite 246 checks. PostgreSQL adds real concurrent pool checks in CI.
- Farm unit/server suite 69 tests before the final quiet-hour assertion addition; new attention suite 6 tests passed. Existing UX/grade/raid/focus/team-battle suite: 142 passed. These include deterministic engines and synthetic persistence, not a real-device/account claim.
- Attention browser mock: 24 checks across 320x568, 375x667, 390x844, 844x390; server clock transition, unread/help clearing and guidance links. Earlier phase browser evidence remains in each phase report.

## Required acceptance still pending

- An isolated Supabase staging project and suitable real Auth test accounts. The connected project list has monschool and an unrelated utility project; no farm staging branch exists. No Docker runtime was found locally. No production migrations, FCM sends or real-account progress edits were performed.
- Real-account loop: auth/ownership; only eggs -> hatch/care/EXP -> stage 2 -> tutorial/placement -> discovery/buy/team/helpers/checkpoint/wrong retry/timeout/reload/offline completion/placement/replay/visits/blocks/stickers. Exercise normally through the app; never manually advance production account progress. Long waits may be simulated only in explicitly identified disposable fixtures, not claimed as real-duration acceptance.
- Daily legacy/new reward compatibility, feeding, EXP accumulation, Adventure busy/free transitions, PvP and Raid with farm participants, real native portrait/landscape devices, reconnect/background and actual permission UX. Existing synthetic results do not replace this acceptance.
- If push acceptance is needed, use only a specifically authorized test recipient/device and staging FCM configuration. Otherwise mock-only evidence remains the stated limitation.
- Teacher/content review and child comprehension/difficulty review of discovery lessons; inspect real sprites in target devices. No educational improvement or retention claim is supported yet.
- Production approval must name the reviewed candidate, migration/enablement scope and deployment. No merge, promotion or production migration is authorized by development alone.

## Rollback without data loss

Prefer rollback of application deployment; retain all additive schema, purchased snapshots, layouts, contributions, coins and sticker history. Never drop tables or reverse migrations destructively. Emergency stop farm push by withdrawing only the farm cron invocation in a reviewed code rollback; global notification preferences stay unchanged. Disable catalogue sale flags only through an approved scoped operational change; this stops new purchases without touching bought projects.

A rollback to pre-foundation code may allow stale legacy UI assumptions about new teams/capacity. Keep the minimum compatibility application version (busy-pet guards and combined placement/capacity) or suspend conflicting starts while restoring the newer compatible app. Do not assert arbitrary old-code rollback is safe for new project progress. Preserve failed notification job rows so ambiguous delivery cannot trigger same-day duplicate sends.

## Phase 10 trial after actual publication

Start the trial clock only when the complete approved version is live. Run at least 14 days, recording started/passed tutorials, discoveries, buys, checkpoints, wrong/timeout/reload, placement, helper use and return intervals. Distinguish new/existing accounts and visit frequency. Compare observed progress to the 27–64-day assumption; 14 days cannot establish all-cohort observatory completion. Collect child comprehension observations, note small samples and missing evidence. Any price/time/penalty proposal applies only to future purchases; retain snapshots of bought work. After reviewed fixes/retests, report balance decision and limitations before closing the overall task. No automation is created from this development request.
