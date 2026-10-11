# Qmon Farm phase 6 — full catalogue / endgame (2026-10-12)

Stacked on phase 5 PR #314. The queue exposes bridge and observatory in addition to pond/flower and the next school upgrade. Guided lessons and catalogue art share the real catalogue gate; a missing stage 3/4 leader points back to caring for existing Qmon. Duplicate queued school upgrades are visibly blocked. First rewards are labelled as once-only, and the current wallet balance is visible.

Permanent artwork: public/farm/qmon-bridge-v1.png, qmon-observatory-v1.png, qmon-school-l2-v1.png, qmon-school-l3-v1.png, qmon-school-l4-v1.png. Builtin imagegen; transparent originals copied without conversion, prompt manifest doc/qmon-farm-phase6-art-prompts-2026-10-12.json. The school sprites used the inspected existing level 1 sprite as their reference. All assets have genuine alpha; bridge 1536×1024, observatory 1295×1214, schools 1254×1254. School artwork changes on the same saved tile. Bridge orientation flips the sprite horizontally to align its opposite entrances with the saved E–W / N–S connector; traversal rules remain authoritative.

## Verification and limits

- 169 isolated PGlite state/transaction checks. A synthetic owner starts with a placed level 1 anchor, two owned stage 4/2 pets and 1000 test coins. All 8 catalogue projects then use actual buy/begin/checkpoint/finish/place commands in sequence: garden → school 2 → pond/flower → school 3 → bridge → school 4 → observatory. Prerequisite sites are no longer inserted as fake placed projects. School upgrades keep the original tile and increase capacity only on placement. Bridge and observatory snapshots retain 12h×4/18h×5 waits, 240/300s puzzle clocks, 3/4 leaders, once-only rewards. Caps: pond 3, flower 3, bridge 2, observatory 1. Repeat builds do not earn another first reward or debit on rejected purchases.
- The database script advances clocks and submits trusted internal pass results ONLY in disposable fixtures. This proves transaction/state progression, not the player's elapsed waiting or comprehension. Separate browser/server puzzle tests validate actual generated answers and privacy; no real account was progressed.
- 14 browser endgame queue checks on portrait 320×568 and landscape 844×390, with instant-ready mock purchases to verify 2 bridges / 1 observatory and independent request IDs. 59 layout/browser checks cover 17/24 render fixtures, bridge-axis rejection and mobile camera controls. 15 gate/layout/world tests passed.
- Final typecheck and changed-file lint passed; CI status is recorded in Notion/PR.
- No production catalogue activation, schema writes or real account changes. Production merge/deploy/migration needs explicit approval. Content approval by Pond and child trials remain outstanding; phase 10 is at least two weeks after publication.

Next: phase 7 real-map resident activities, history and untimed replay; phase 8 friend visits/stickers; phase 9 notifications and release regression review.
