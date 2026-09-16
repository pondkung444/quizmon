# Phase 4: friend discovery initial slice

- Default to exact nickname search (case insensitive), with code search as fallback.
- Require authentication; escape wildcard characters literally; limit to 10 candidates.
- Server-only privileged lookup reads only candidate friend codes, never returns them, and resolves candidates through the existing authenticated block-aware search RPC.
- Preserve relationship status and existing request/accept flow. No automatic requests from links.
- Show Qmon previews and nicknames to distinguish duplicate player names.
- Share invite links and generate QR locally, without a third-party QR endpoint.
- Invite handoff stores a validated eight-character code in a 30-minute HttpOnly, SameSite=Lax cookie (Secure on HTTPS). Login continuation consumes it after profile completion. Public handoff does not expose friend lookup.
- Keep the player's code/share controls below search rather than the first thing to read.

Verified on 2026-09-16: 15 UX contract tests; production build and TypeScript; scoped ESLint on discovery, invite, continuation and middleware files. Existing complete-profile sprite effect still has a pre-existing lint violation and was not changed. Two disposable UX accounts verified local invite → email/password login → prefilled add-friend page, exact-name search, PNG QR rendering and no horizontal overflow at 360/375/393/412/1440 pixels. Screenshot at 360 pixels visually reviewed. No friendship/block mutations during this smoke test.

Browser test found middleware intercepted invites before the handoff could save its cookie; fixed with a narrowly scoped public handoff exception, rebuilt and reran successfully. Evidence: `scripts/verify-social-discovery-smoke.mjs`, local screenshots under `output/social-discovery-2026-09-16` (not committed).

Not production-ready yet: two-account request/accept and blocked search checks, duplicate-name cases, backend search/request abuse controls, actual OAuth/new-profile continuation and scanning QR on physical devices. No schema migration applied. Keep PR #162 draft; do not merge based on the read-only discovery smoke test alone.
