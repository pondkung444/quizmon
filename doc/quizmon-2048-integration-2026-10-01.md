# QuizMon 2048 — account/stat integration · 1 October 2026

## Owner decisions

- Connect QuizMon before balancing the run. The previous phase-4/phase-5 order is superseded.
- Use the approved initial stat mapping below. Individual Qmon skills are deferred; retain the three existing temporary lane skills.
- Read only the pet's stored stats. **Exclude all equipped items.** Do not recalculate learning counters or multiply lane/personality bonuses again.
- Read active questions from the real bank for the account's grade band. Quiz answers in this mode do not add learning counters, EXP, missions, or Qmon-growth currencies.

## Initial formula (version 1)

The input is `pets.stat_*` clamped to its existing egg cap. Stage 1–3 have no stored stat snapshot, so use a clearly identified temporary 50 in every axis. Missing/invalid Stage-4 stats disable selection instead of receiving invented stats.

| Output | Formula |
| --- | --- |
| Max HP | round(80 + 0.4 × HP) |
| Sword base | 4 + 0.02 × ATK |
| Armor base | 6 + 0.04 × DEF |
| Healing | 8% of max HP as the existing rune base |
| Critical chance | FOC / 1000 as a probability; critical multiplier 1.5 |
| Skill cooldown | ceil(6 / (1 + SPD / 200)) valid swipes |

Keep the rune exponent 0.8, combo increment 0.15, enemy values, door/relic economy, and locked armor/root rules. One critical roll per valid swipe containing sword merges; all sword merges on that swipe share the outcome. Seeded run RNG drives criticals, spawns, and roots. No roll on a no-op swipe, shield/heal-only merge, or skill.

Stat 50 reproduces the existing HP/sword/armor baseline 100/5/8. The 1 October read-only database sample contained 147 Stage-4 pets, 144 with complete stats. Observed HP/ATK/DEF/SPD/FOC medians among available values were 75.5/35/56/59/65. This is input-distribution evidence, not balance or playtime evidence.

## Flow and save compatibility

- `/2048` remains the public static shell. New account runs require sign-in. Authenticated read-only handlers are `/api/2048/companions` and `/api/2048/start`; both verify the session and pet ownership.
- Select any owned active or farm Qmon, use its actual Stage artwork and map senior lines through the existing `artLane` function.
- Re-read the selected pet when starting. Snapshot companion, config, formula version, timestamp, grade band, and the question batch in the run. Snapshot values remain fixed across rooms/reloads.
- No database/schema changes. The only admin reads are the existing protected question bank and the authenticated account's grade band. No service-role key reaches the static client.
- Local account save key: `quizmon-forest-run-v1:<accountId>`; schema version 3. Cross-device/account server saves remain future work.
- Preserve the original guest save at `quizmon-forest-run-v1`. The entry panel offers to finish that old experimental run, maintaining its original values/questions. Existing v1→v2 removal of retired fate/heart relics still runs.
- Use the pause menu to inspect the frozen companion stats and resulting power. Keep debug logs/tuning panels off the mobile combat screen.

## Validation

- Production build, TypeScript, changed-file ESLint, and diff whitespace checks passed.
- `node --experimental-strip-types tests/forest2048/stats-engine.test.mjs`: pet-only stats, caps, early-stage fallback, invalid/missing stats, monotonic mapping, baseline, deterministic criticals, armor/root/beetle rules, and temporary skills.
- Real existing test accounts: owned Stage-4 stats 75/90/70/90/75 yielded HP 110, sword 5.8, armor 8.8, cooldown 5, critical chance 7.5%; direct stored-stat comparison passed.
- Browser: actual pet artwork, 320×480 / 320×568 / 390×844 combat fit, save/reload and next-room snapshot, real-bank reward quiz and successful revival. Pet EXP/stats/counters and quiz-attempt counts were unchanged before/after.
- Rejected other-account pets, invalid IDs, unrelated origins, and anonymous requests. No page errors in the tested flows.
- Fixture regression checks: Stage-2 artwork/base, disabled incomplete Stage 4, safe text rendering, image-question reload, touch does not scroll, wrong reward answer, failed revival, legacy progress/relic migration.
- Some flow tests force room outcomes; **do not use them as evidence for difficulty, run duration, or win rates.** Real-device/pupil pilot and balance playtests are still pending.

## Next work

Play full runs using weak/medium/strong real Qmon; tune from that evidence. Individual Qmon skills, cloud saves, leaderboard/meta, and broader mobile pilot remain separate work. Do not add Qmon-growth rewards or gear bonuses without a new owner decision.
