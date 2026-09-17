# Phase 4 — PvP expectations and resume

Status: implemented, local checks passed; authenticated browser exit gate pending. Do not declare all Phase 4 complete.

- PR #163 merged as `e5fb2b4`; no Phase 5 changes included here.
- Your-turn matches appear before ticket/reward promotions, with a single resume list.
- Collapsed shared rules explain asynchronous play, 30-round limit, server-running answer deadline, challenger-only ticket cost, all-stage eligibility and incomplete Qmon appearance data.
- Fix misleading all-time match frequency label (not chronological “latest”).
- Overview and active duel resync on tab wake, focus and online events; 30-second visible/online-only fallback polling. Event bursts throttled; listeners/timers cleaned up. Read-only refresh never sends an answer or restarts the deadline. Result feedback hold remains respected.
- Add waiting-state exit and manual status-check controls. Increase key overview action targets to at least 44 pixels.
- Synchronous click locks for create/accept/decline, assignment and start; network exceptions release loading state and explain checking server state before retry. Existing server idempotency/rewards remain unchanged.

Verification: 23 Phase 0/2 tests passed, scoped PvP ESLint and TypeScript passed before final small copy/cleanup change; final checks/CI tracked in PR. Resync unit covers focus/visibility/online, hidden/offline polling suppression, event burst suppression and cleanup. This is not two-player browser verification.

Browser gate before closing PvP:
1. User-operated login to two disposable registered UX accounts; agent must not manage credentials or use real student accounts.
2. Challenge/accept with one ticket charged to challenger; duplicate-click checks; one match created.
3. Assign → card preview → start → answer → feedback → next turn in both browser contexts.
4. Reload/back/forward and tab sleep at assigning/card_ready/answering/waiting. Timer must continue from original server deadline, not restart.
5. Offline/reconnect, delayed response and retry must not duplicate answers/rewards; resume list reaches the correct match/actor.
6. Finish and reload result; verify reward once, 360/375/393/412/1440 viewports and text 125%.

Pending outside PvP: browser friend send/accept/block gate and Boss Raid 1-host+4-client create/join/play/reload/reconnect/finish, including reward uniqueness. No SQL/PvP-only pass closes these.

No schema migration, combat tuning, EXP/evolution formula change or credential handling in this slice.
