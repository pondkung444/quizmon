# QuizMon 2048 — headless simulation kit

Runs the **real** 2048 engine (quizmon `main` @ `2fc0896`, merge #264) in Node, thousands of times, and writes raw data + summaries for balance tuning.
No browser, no DB, no API, no real accounts. Nothing under `public/2048` or `src` is touched.

> Bot results are **supporting data, not evidence that balance passes** (Notion rule). Read `HANDOFF.md` before analysing.

## Folder map

| path | what |
|---|---|
| `engine/` | verbatim copies of `public/2048/{engine,runes,skills,run}.js` + `src/lib/forest2048/stats.ts`; `SOURCE.json` = commit + SHA-256. **Never edit.** To test a newer engine, replace these files and update `SOURCE.json`. |
| `config.mjs` | **all** assumptions: 6 egg stat averages, lanes, policies, skill names, defaults, and the plain-text rule list (`HARNESS_RULES`). |
| `ctx-driver.js` | runs inside the engine's `vm` context: stubs UI, wraps engine functions to count things, drives a full run with a bot. Places copied from `run.js` closures are tagged `MIRROR run.js`. |
| `sim.mjs` | orchestrator (worker threads) → writes `results/<label>/`. Deterministic: same args ⇒ byte-identical CSV (checked with 1 vs 4 workers). |
| `summarize.mjs` | reads a results folder → `summary/*.csv`, `REPORT.md`, `summary/validation.json`. |
| `FINDINGS-engine-vs-design.md` | where the engine does something other than (or ambiguous vs) the Notion design. Reported only; nothing changed. |
| `HANDOFF.md` | context + pitfalls + suggested next analyses for whoever analyses the data. |
| `results/<label>/` | one folder per run set (see below). |

## Re-run

```bash
cd output/2048-sim
node sim.mjs --seeds 200 --label main-p0.7                    # 42 forms x 3 policies x 200 seeds = 25,200 runs, ~8 min on 12 threads
node sim.mjs --seeds 200 --quiz-p 0.5 --label sens-p0.5       # sensitivity (same seeds => paired comparison)
node sim.mjs --seeds 200 --quiz-p 0.9 --label sens-p0.9
node summarize.mjs results/main-p0.7 --compare results/sens-p0.5,results/sens-p0.9
```
Useful flags: `--forms egg3` (substring of form_id), `--policies greedy`, `--no-control`, `--max-swipes`, `--workers N`, `--jsonl` (also dump nested run+rooms+events, ~90 MB).
Requires Node ≥ 22.18 (imports the real `stats.ts` directly; type stripping).

## Design of the data (why it is easy to analyse)

* **Tidy / long CSVs, one fact per row, stable keys**: every row carries `run_id = <form_id>|<policy>|<seed>` plus `form_id, policy, seed` so `runs.csv`, `rooms.csv`, `relic_events.csv` join with a plain key. UTF-8 with BOM (opens in Excel; Thai text OK).
* **Paired seeds**: seed *s* gives the same game RNG (`game_seed`) for every form and every policy, so differences between forms are not seed noise. The bot RNG is separate (`mulberry32(game_seed ^ policy)`).
* **Raw first, summaries second**: nothing in `runs.csv` is aggregated; `summary/` is derived and can be regenerated.
* **The rules used are inside the results** (`run-config.json`: parameters, engine hash, forms+stats, harness rules, attribution definitions), so a results folder is self-describing even when moved.

## `runs.csv` (one row per run)

Identity: `run_id, form_id, group (stage4|control_stage1-3), egg, egg_name, rarity, lane, personality, skill_index, skill_name, stage, policy, seed, game_seed, quiz_p`
Config: `cfg_hp, cfg_cooldown` (from real `forestConfig`)
Outcome: `outcome (win|loss|timeout|stuck)`, `final_room`, `first_death_room/_enemy/_enemy_hp_left/_enemy_hp_frac` (blank if never died), `revive_used`, `revive_success`, `deaths_r1..r8` (count of HP-0 events in that room, incl. revived ones)
Progress: `swipes` (valid swipes only), `swipes_r1..r8` (blank = room not fought), `battle_rooms`, `nonbattle_rooms` (rest/shop/quiz doors), `door_path` (`>`-joined door types), `quiz_questions, quiz_correct`, `coins_end`, `relics` (`|`-joined, in pick order), `n_relics`
Combat totals: `total_dmg` (effective enemy HP removed), `skill_dmg`, `ord_dmg` (= total − skill), `skill_armor`, `ord_armor`, `skill_heal`, `ord_heal`, `armor_blocked`, `enemy_attacks`, `enemy_hp_lost` (player HP lost to enemy attacks)
Auto: `casts`
Jams: `jam_events`, `jam_hp_lost` (HP lost to board-full penalty)
Stag: `stag_reached (0/1)`, `stag_result (won|lost|…)`, `stag_enemy_hp_left` (blank if won/not reached; boss max HP = 1200), `roots_applied`, `root_hits`, `roots_released`

Attribution definitions are in `run-config.json → rules.attribution` (armor is **gross**, not “used”).

## `rooms.csv` (one row per battle room fought)
`run_id, form_id, policy, seed, room, enemy, hp_start, enemy_hp_max, result (won|lost), hp_end, enemy_hp_left, deaths_in_room, moves` + the same combat counters per room (`total_dmg, skill_dmg, ord_dmg, skill_armor, skill_heal, ord_armor, ord_heal, casts, jam_events, jam_hp_lost, enemy_attacks, enemy_hp_lost, armor_blocked, root_hits, roots_released, roots_applied`).
A room revived and then won has `deaths_in_room ≥ 1`, `result = won`. Non-battle rooms have no row.

## `relic_events.csv` (one row per relic offer screen)
`run_id, form_id, policy, seed, room, source (battle_reward|quiz|shop), offered (|-joined), picked (|-joined; shop can buy several)`

## `summary/` (derived)
`by_form_policy.csv` (everything, per form×policy) · `by_rarity_policy` · `by_egg_policy` · `by_lane_policy` · `by_personality_policy` · `by_egg_lane_policy` · `by_policy_stage4` · `stage_compare.csv` (Stage 4 vs control) · `by_room_form_policy.csv` / `by_room_policy_stage4.csv` · `relic_effect_early.csv` (fair) · `relic_ownership_naive.csv` (biased, flagged) · `relic_offers_picks.csv` · `sensitivity_quiz_p.csv` · `validation.json`.
Column naming: `X_mean/_ci_lo/_ci_hi/_min/_p10/_median/_p90/_max/_n`; rates `X, X_lo, X_hi, X_k` (Wilson 95%); `lose_final_rN` = share of **all** runs ending in a loss at room N; `first_death_rN` = share of runs whose first HP-0 happened in room N.

## Rules the simulator applies outside the engine (full text in `config.mjs`)
* Bot policies: `random` (uniform valid dir) · `greedy` (most merges) · `greedy-egg` (most merges whose result is the egg-rune tile, then most merges). Ties by bot RNG.
* Doors and relic picks: uniform random. Shop: buy random affordable relics (40 coins) until none. Rest: always. Quiz: correct with P = `quiz_p`. Quiz reward: relic if any left else 25 coins. Revive: always attempt (needs 3/3).
* Run object is built exactly like `startRun()` (skillVersion 1, runeVersion 1, balanceVersion 2); Stage-4 forms use `skillIdentity()` from the real code; control group = stage 3, stats 50, no Auto.
* Safety cap: 6000 valid swipes/run (none hit it in the main set).
