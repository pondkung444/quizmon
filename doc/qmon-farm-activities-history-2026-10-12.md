# Qmon Farm phase 7 — resident activities, history and replay (2026-10-12)

Stacked on phase 6 PR #315. Existing walking Qmon (hard cap 3) choose reachable activity destinations: bench rest, pond rest, butterflies, the far end of the bridge's real corridor, and observatory stargazing during Thai 18:00–05:59. Activity labels and butterfly decoration add no pet, currency, XP or progression. Pause, reduced motion and page visibility stop animation/timers. Tile movement retains or safely resets walkable positions using the existing navigation model.

Tapping placed school/garden/new locations opens an owner-only history view with permanent art, recorded completion date, all historical leader/helper periods and replay/build/move links. Old participation is shown only where records exist; unknown pre-migration dates/roles are not invented. Deleted or unavailable Qmon names have a neutral historical fallback. No wallet, drafts or checkpoint answers are projected into this view. Completion dates are labelled as the recorded completion event, not an inferred exact offline finishing time.

School floor/path replay creates a fresh server-only random board with public view and owner-authenticated answer/hint closures. The round never invokes a project command, wallet, XP or completion RPC. New-round URLs and component keys reset the previous board safely. Garden and four subject replays use their existing untimed practice/discovery routes, retaining discovery-once/no-reward behavior. Construction replay uses an actual owned companion rather than its preview fallback.

## Evidence

- 2 activity route/time tests: every destination is walkable/reachable; Thai night hours; bridge endpoints follow saved orientation. Navigation tests cover the real corridor and side-exit rejection.
- 3 isolated history server authorization tests: unauthenticated/invalid/foreign/unfinished records cannot read history; owner derivation; only owner project IDs scope contribution reads; old roles and deleted-pet fallback remain; no private project fields/wallet/checkpoint reads.
- 2 isolated practice server/closure tests: auth first, private seed/answer absent from public props, client passed ignored, only the round's owner can submit/hint, no-reward messaging. Existing construction engine/browser checks validate actual puzzle solutions.
- Resident browser: 6 runtime checks, three-resident cap, arrival at an activity, pause and reduced-motion immobility. Uses actual clock and explicit Web Animation completion to accelerate traversal, not physical-phone timing. Earlier clock-based harness attempts failed around hydration/readiness; the revised normal-clock run passed.
- History browser: 10 checks at 320×568 and 844×390, preserved historical roles/names, replay link and no overflow, with synthetic metadata only. Construction browser: 21 actual puzzle checks passed.
- Final typecheck and changed-file lint passed; CI status recorded in PR/Notion.
- No new production migration, real account progression, production push or catalogue activation. Content and physical device review/child trial still pending.

Next phases: friend-only read visits and 6 non-reward stickers; notifications/new-player route/release regression; approval before production; at least two-week real trial after publication.
