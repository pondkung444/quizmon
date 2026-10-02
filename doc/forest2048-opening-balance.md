# Pilot opening balance v4 — 2 October 2026

25 recorded runs across 6 accounts: 8 reached room 3 and died there, 9 died at room 4. These are repeated runs, not 25 children. Room-3 deaths had average previous-room finishing HP 37.5/111; room-4 deaths 42.3/106.7. The latter lasted 9 swipes on average with 72.3% enemy HP remaining. No recent board-block penalty appeared in the room-4 death logs. Leaderboard distance 3 means three completed rooms, so its wall is often room 4.

Refreshed clients request `balanceVersion:4` for new server-created runs. Tabs loaded before deployment omit that request and receive v3, preventing a mismatch with their already-loaded engine. Existing v3 checkpoints retain their exact rules and replay. No pet stats, account scores or saved runs are rewritten.

- Win rooms 1–3: recover ceil(20% maximum HP), capped at full HP, once before recording history and offering rewards/doors.
- Room 3 offers mushroom/beetle only, with the existing early-room damage 10/13. New striker species enter from room 5 onward.
- First golem (room 4): HP 150 instead of 190; normal/heavy hits 18/27 instead of 25/38. Interval remains 3.
- Recovery and golem reduction apply only to the first opening; later cycles and stag balance retain their rules. Relic reward cadence is unchanged.

## Paired diagnostic bot

Run `node scripts/simulate-forest-opening.mjs`. Six anonymous configurations from actual gameplay checkpoints, 20 fixed paired seeds each, old/new rules: 240 runs total. No production writes or leaderboard scores. Uses production engine, greedy one-turn evaluation, first offered relic, easier enemy/rest choice, one revival with all answers correct, actual 30% rest recovery, cap after room 8. Candidate evaluation sees the seeded spawn outcome; this is optimistic and cannot predict children's success rates. Stage-3 and two other configurations in the live data were not sampled.

| Profile | Passed room 4: v3 | Passed room 4: v4 | Median completed rooms: v3 → v4 |
|---|---:|---:|---:|
| Egg1 science A | 13/20 | 20/20 | 7 → 7 |
| Egg1 math B | 2/20 | 20/20 | 3 → 5 |
| Egg3 math B | 20/20 | 20/20 | 8 → 8 |
| Egg4 science B | 14/20 | 20/20 | 7 → 7 |
| Egg5 science B | 16/20 | 20/20 | 7 → 7 |
| Egg6 science A | 12/20 | 20/20 | 5 → 7 |

Total room-4 passes: 77/120 (64.2%) → 120/120. Room-8 passes: 16/120 → 12/120: opening improvement does not establish late-game balance. Egg3 is much stronger late in this sample; inspect rune/build balance separately after collecting more pilot data.

Validation: all 13 engine/replay/database tests pass, including v3 compatibility, later-cycle boundaries, HP caps, no repeated recovery and restored reward checkpoint carry. Browser integration exercises client/server replay, mobile widths, resume, outbox retries and summaries. Next pilot measurement: compare new v4 runs separately from v3 by account, first-golem passage and HP, then room-8 progression.
