# Qmon Farm phase 8 — friend visits and stickers (2026-10-12)

Stacked on phase 7 PR #316. New migration 20261011182216_qmon_farm_friend_visits.sql is pending production approval and has not been applied to monschool.

Read-only inspection confirmed existing friendships(low/high), blocks(both directions), profiles(username), block_user/remove_friend semantics and service-role SELECT/row-lock privileges. The new feature uses those relationships, with default friends-only visit consent and owner-controlled closure. It adds no separate primary-school restriction, consistent with the approved plan.

## Data / authorization

- Owner-only farm_social_settings; participant-only SELECT on farm_stickers. Authenticated clients cannot modify either table or invoke the privileged farm RPCs directly. Server wrappers obtain the verified user and validate UUIDs, booleans and the six sticker IDs.
- The friend snapshot locks the owner and current friendship, rechecks blocks/consent, and explicitly projects layout, placed work, historical names/roles/dates and catalogue definitions. No coins, unfinished jobs, current teams, answers, drafts, XP or profile contact details are returned.
- Sticker sends lock both owners in stable order and the friendship. Constraints plus owner locks enforce one sender→friend per Thai day, ten sends total per sender/day, request idempotency and no free text. Consent changes/removal/blocking reject new calls. No wallet/project/XP commands are invoked.
- Inbox aggregates counts and unread state by Thai day and sticker type for the last 30 days, hiding withdrawn/blocked relationships. It remains accessible to the owner when visiting is disabled. Marking read changes only sticker read timestamps.

## UI

The friend profile offers a gated visit entry. The map supports inspection instead of owner navigation/editing; a location list also provides reliable selection when compact map artwork overlaps. Six fixed stickers show daily capacity and freeze the selected request during uncertain retries. Owner farm links to visit consent and the daily encouragement inbox. Feature entries disappear when the new schema is absent, preserving old deployments.

## Verification

- Isolated PGlite checks: 229 including the client-write-denial check. Covers default friendship consent, non-friend/disabled/blocked/removed denial, no free text, retry once, per-peer/day cap, ten/day cap including sends to a now-removed friend, next-day fixture, multiple same-type counts/unread, unchanged wallet, service-role projection and authenticated RLS. Date changes and fixture accounts exist only in the disposable database.
- PostgreSQL-only pool checks exercise 11 concurrent recipients → exactly 10 accepted and one rejected; simultaneous same-peer retries cannot add rows. These run in CI, not against production.
- 3 server-wrapper auth/validation tests passed; no privileged operation occurs before authentication, identities come from auth, and no reward/progress RPC is called.
- 32 browser checks across 320×568, 375×667, 390×844, 844×390. Pure mock accepts a sticker then loses its response; retry uses the same nonce and yields one delivered sticker, with no real sender/recipient. The first map-center click test exposed overlapping building hitboxes; the location list is now the tested selection route. Portrait/landscape screenshots are in test-results/farm-phase8.
- Changed-file lint passed. Final typecheck passed. CI is recorded in PR/Notion.
- No production schema execution, real stickers/messages/push, account progression edits or production deployment.

Next: phase 9 notification dots/push settings and opt-in quota, new-player guidance, release/build/regression verification and production approval. Phase 10 still requires at least two weeks after publication; content/teacher/child/device review remains outstanding.
