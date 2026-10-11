# Qmon Farm foundation (phase 1)

Base: origin/main 77aacc1. Development uses a separate managed worktree.
Production migrations and player progress are not modified during development.

## Compatibility strategy

Legacy school and garden rows remain authoritative and use their existing commands.
The unified owner projection reads them without copying, claiming rewards, or changing
timestamps. New projects use independent versioned snapshots. School upgrades reuse
the legacy school plot. No legacy migration is replayed on production.

## Implemented in the foundation PR

- Approved catalogue (8 purchases, 21 checkpoints) and immutable per-purchase
  economics, durations, content version, helper/penalty policy and reward eligibility.
- New projects, active assignments, contribution periods and server-only checkpoint
  payload storage. Owner-only RLS; clients have no write grants or checkpoint access.
- Service-only atomic purchase, queue/area/type limits, idempotency, pause/resume,
  team changes, timed checkpoint transitions, release, placement and milestone credit.
- Compatibility view reads original saves in place. No migration changes wallets,
  discoveries, old deadlines or layouts. Current known legacy contributors are
  captured separately, and future leader changes append attribution.
- Existing Adventure and legacy commands reject pets on new projects. Legacy garden
  purchases count new queue reservations, and legacy placement cannot overlap them.
- Server-internal contract obtains the owner from getUser; no client passed flag.

## Rollout boundary

All new catalogue entries start disabled. Existing school/garden screens and their
commands keep working. Do not enable generic projects until phase 2 persists and
validates puzzle payloads and phases 3–6 wire the corresponding screens/geometry.
The bridge requires actual entrance/path validation in phase 4; the generic phase 1
placement function only validates grid adjacency and must remain gated until then.

The legacy school row remains the tutorial/plot anchor. School upgrades are stored
as completed generic projects on that same plot; farm_school_level derives levels.
The later UI must read that level instead of hard-coding Lv1. This PR does not change
/pet or publish new gameplay. Legacy garden still allows one open garden until its
screen/command is replaced. No historical builder data absent from old saves is
invented. Legacy timing/economics keep their existing contract; purchased generic
projects use complete snapshots. Missing legacy milestones are never claimed by
this migration or the new read projection.

## Validation and pending evidence

- Read-only live inspection: migrations 20261004143439, 20261005023219,
  20261005052159 present; farm RPCs SECURITY INVOKER and service-only. No production
  DDL, migration application, gameplay writes or push dispatches were performed.
- Synthetic database: original three migrations plus new migration; exact old saves
  in draft/building/puzzle/finishing/paused/ready/placed compared before and after.
- SQL integration currently passes 60 assertions on PGlite, including purchase
  deduplication, atomic failure, frozen values, penalty once per checkpoint,
  no deadline reset on wrong answers, release, upgrade on original plot, reward
  deduplication, owner/other/anon restrictions and secret checkpoint denial.
- PostgreSQL CI adds 10 simultaneous connections. This is separate from PGlite's
  single backend and must pass before declaring concurrency verified.
- Account gameplay: not performed. No real player's progress is altered for testing.
- Phase 1 is pending final CI/type/lint review; phase 2–9 and production approval
  remain outstanding. Phase 10 starts only after approved production rollout and
  requires at least two weeks of actual observation.

## Review sources

- Plan: https://app.notion.com/p/3f67cdca67f18111b783d6dff08dba78
- Approved numeric specification: https://app.notion.com/p/3f07cdca67f181e7a8c9e542349b67f7
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase changelog reviewed 11 October: the recent minor Postgres security release
  concerns ltree, btree_gist and legacy pgcrypto encryption; none is introduced here.
