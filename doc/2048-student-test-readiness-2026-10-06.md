# 2048 student test entry and readiness

The signed-in QuizMon home `/pet` now shows a crystal-themed 2048 card below the companion section and above the guardian/premium links. Existing sky-dragon artwork provides the visual identity. The card opens the standalone game with full-page navigation, with no new image generation or extra home-page data requests.

## Student flow

- `/2048/` opens three acts by default; no special query string is required.
- New runs always use journey/mechanics/content version 1 and balance version 4. Endless creation and its resume control are removed from the student flow. Historical saves and pending event submissions remain compatible.
- The home screen offers companion selection, resume for three-act saves, top ranks, the full leaderboard, personal stats and return to QuizMon.
- Completing the third guardian ends the journey after room 30 and displays a result with a leaderboard link.

## Leaderboard

Dedicated `forest2048_acts_board` and `forest2048_acts_stats` RPCs read the server-validated snapshots, selecting only the current three-act content. Progress is the number of completed history entries, including battle and service rooms, capped at 30. Each player's best run counts, and equal progress receives a shared rank. The original Endless score table remains separate.

This intentionally differs from the replay response's `rooms` field, which counts combat victories. `visitedRooms` and history entries describe the full 30-room journey. Checkpoint writes retain their compatibility behavior; the new board reads the validated snapshot directly, so historic zeroed three-act score columns do not hide progress.

Migration `20261005171205_forest2048_three_acts_student_board.sql` was applied to monschool. Both new functions use security invoker, a fixed empty search path and execution restricted to service_role; the API supplies the authenticated user's ID for personal stats. A rollback-only database test verifies best-run selection, shared ranks, pagination and stats without leaving test records. An isolated PGlite test also verifies exclusion of old Endless runs and direct-role access restrictions.

## Verification and limits

- The game is mechanically playable through all 30 rooms and three guardians, with matching client/server state at 320, 390 and 430 pixels.
- Updated browser checks enter through the default URL, seed a legacy Endless save to verify its resume is hidden, exercise offline reload and acknowledgement retry, finish the journey and read a 30-room personal rank.
- The entrance component was rendered with actual app styles in a temporary local preview at all three widths, with no horizontal overflow or browser errors; its link opens the game shell. The temporary route was removed afterward.
- 59 automated API, combat, save and replay checks plus one isolated SQL test pass. Targeted lint and the production webpack build pass. Evidence is in `output/student-test/`.
- Full journey browser fixtures use a strong companion to verify completion and persistence. They do not establish student difficulty or prove that every real companion can finish. Live student sessions are the next balance evidence.

## First student round

Start with 5–10 students using their own Qmon and devices. Let them play without coaching for one run, then try a second run after learning the hazards. Record the room/act where they stop, reason for stopping, time spent and whether they understand runes, crystals, cracks, poison and relic choices. Compare low and high stat companions separately.

Use saved journey logs, session counts and run metrics to examine route choices, deaths, bosses reached, swipes and repeated attempts. Tune enemy damage/intervals, recovery and hazard frequency from observed bottlenecks. Keep the 30-room route, art direction and ranking rule stable during the first comparison. Rewards/trophies remain separate follow-up work.

Application changes are delivered as a reviewable PR; this document does not claim that its home-page entry has already been deployed to students.
