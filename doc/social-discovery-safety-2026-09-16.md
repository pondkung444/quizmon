# Phase 4: discovery hardening

Changes:
- Authenticated `search_friend_name` replaces the server service-role nickname query. No friend codes, email, school or phone are returned.
- Exact case-insensitive nickname equality treats `%`, `_` and backslashes literally. Blocks are filtered in both directions before the 10-result limit.
- Indexed lowercase nickname lookup; existing relationship and Qmon preview logic remains unchanged.
- Atomic database windows: 20 name searches, 60 code resolutions, 10 successful friend sends per minute per account. Name results also consume code-resolution quota, so unusually many duplicate-name results may exhaust that quota first.
- Counter table is in a non-exposed schema, RLS enabled, no client access, at most three rows per account, deleted on account deletion. Search text is never logged.
- Direct code/search/request RPCs are guarded; quota is not just a UI lock. Anonymous EXECUTE privileges revoked explicitly. Internal counter helper has no client EXECUTE grant.

Verified:
- 22 Phase 0/2 tests passed, including real existing SQL function definitions run in PGlite with two simulated authenticated actors.
- Duplicate names and literal wildcard characters; duplicate send rejection; only addressee can accept; accept produces friendship; blocking hides both directions and prevents sends; unblocking does not restore friendship.
- Search quota, account isolation, window recovery, direct code quota, successful-send quota and no anonymous/private-schema access.
- TypeScript and scoped social-action ESLint passed.
- Read-only inspection confirmed live code/request definitions contain the migration's expected insertion anchor. No live schema or player relationship changes made.

Deployment requirements:
1. Apply migration `20260916161315_social_discovery_safety.sql` before deploying the action change (new RPC dependency).
2. Verify live grants/advisors and rerun disposable-account browser smoke, then merge the application change.
3. Existing UI from PR #162 stays unchanged until this follow-up is merged.

Limits:
- PostgreSQL rolls back a counter increment when the later RPC raises an exception. Consequently request quota bounds successful sends, not every rejected/invalid attempt. This does not replace transport-level abuse protection/WAF.
- Simulated SQL actors are not a browser request/accept verification; that production smoke remains pending. Actual OAuth/profile-completion continuation and physical QR scanning also remain pending.
- Concurrent load/stress testing and database advisors for the new objects remain pending until deployment.

Design references: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [query optimization](https://supabase.com/docs/guides/database/query-optimization).
