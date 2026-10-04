# School level 1

Approved scope: enter school construction from the farm, select an owned hatched Qmon as leader, and help with the floor puzzle. Source: https://app.notion.com/p/3e97cdca67f1817c969ac8e67505c7e5 . Implementation tracking: https://app.notion.com/p/3ef7cdca67f181e1b6b7ef361f06c80c .

The school is unique per account. Stage 2–4 pets, including the active pet, can lead the tutorial. Active Adventure assignment blocks selection. A database trigger serializes Adventure assignment with the same pet lock, preventing a school leader from departing concurrently. Quiz, PvP and Raid rules are otherwise unchanged; Notion has not defined school/Raid exclusivity.

States: draft → building → puzzle → finishing → ready → placed. Removing the leader pauses the project and preserves remaining work, completed checkpoints and the one-time penalty. A resumed project can use another eligible leader. The leader is released at readiness, before placement. Completed school tiles attach to an empty adjacent starter plot. School upgrades, helpers and other projects are future scope.

## Tutorial trial values

Free first school; no changes to currency, Daily Quest or food. Two work segments of 45 seconds. Practice is untimed. Actual floor rounds are 90 seconds. Third consecutive failed check or expired round adds 15 seconds to the final work segment once, with no retry cooldown. Re-entering an active round does not reset its deadline; pausing a project settles an expired round once and closes the round without discarding completed work. These timings, price and sample puzzle content are implementation defaults, not previously ratified Notion economy/content decisions.

The 4×4 floor accepts four identified pieces in any exact non-overlapping tiling. Moving and rotating do not count as errors. The server rechecks the actual layout; no client success flag is trusted. Failed layouts receive a hint. All users use the same sample tutorial, pending Pond's final content curation.

## Persistence and access

`farm_school_projects` has owner-only SELECT under RLS, including authenticated guest accounts intentionally supported by the game. Client DML and RPC execution are revoked. Authenticated Next.js actions obtain the owner ID from `getUser()`, then call the server-only service-role INVOKER RPC. Ownership, pet stage, busy status, deadlines, state transitions, penalty and placement are checked transactionally in the database. No existing user rows or economy fields are migrated.

Migration: 20261004143439_farm_school_tutorial.sql, applied through Supabase MCP and filename aligned with remote migration history.

## Validation

Full production build and TypeScript; changed-file lint; 14 farm/compatibility tests. Database transaction tests covered egg/unowned pet rejection, duplicate start, pause/resume, checkpoint waiting, round re-entry, invalid layout, timeout, one-time penalty, release/placement, RLS ownership and client write denial. Adventure assignment guards tested both directions. Fixture transactions rolled back. Advisor notice for authenticated guest ownership is intentional; signed-out users have no access.

Mobile component preview with mock data: choose stage-2 leader, disabled Adventure pet, start, checkpoint, practice, drag, tap placement, rotation and overlap display, completed floor, finishing, and readiness. No missing images or horizontal overflow at 390px. No school was started on a real player account during browser verification.
