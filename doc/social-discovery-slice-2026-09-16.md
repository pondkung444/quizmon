# Phase 4: friend discovery initial slice

- Default to exact nickname search (case insensitive), with code search as fallback.
- Require authentication; reject wildcard queries; limit to 10 candidates.
- Server-only privileged lookup reads only candidate friend codes, never returns them, and resolves candidates through the existing authenticated block-aware search RPC.
- Preserve relationship status and existing request/accept flow. No automatic requests from links.
- Show Qmon previews and nicknames to distinguish duplicate player names.
- Share invite links; authenticated landing pre-fills the code.
- Keep the player's code/share controls below search rather than the first thing to read.

Verified: input validation tests, ESLint and TypeScript. Read-only database check confirmed disposable test profiles have codes.

Not production-ready yet: two-account browser verification, unauthorized/blocked search checks, duplicate-name cases, request spam controls, invite continuation across login, and QR remain to be verified or implemented. No schema migration applied.
