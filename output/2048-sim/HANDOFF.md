# Handoff — QuizMon 2048 simulation (1 Oct 2026)

Start here if you are the next person (or Claude session) analysing this data. 5-minute read.

## 1. What this is
25,200 full 8-room runs of the **real** engine (quizmon main `2fc0896`): 36 Stage-4 forms (6 eggs × 3 lanes × A/B) + 6 Stage 1–3 control forms, 3 bot policies, 200 seeds each, simulated quiz accuracy P=0.7 (plus P=0.5 / P=0.9 sensitivity sets). Goal: numbers for tuning. **Not** proof of balance (Notion rule).

Primary results: `results/main-p0.7/` → open `REPORT.md` first, then `summary/*.csv`. Raw: `runs.csv`, `rooms.csv`, `relic_events.csv`. Full schema: `README.md`. Rules/assumptions: `config.mjs` and `results/*/run-config.json`. Engine-vs-design notes: `FINDINGS-engine-vs-design.md`.

## 2. Must-know pitfalls
1. **Bots ≠ players.** Win rates are the floor of what a clever human gets and the ceiling of what a random player gets; the three policies only bracket that. Use them for *relative* comparisons (form vs form, with/without Auto), not absolute “is it too hard”.
2. **Compare within a policy and paired by seed.** Seed *s* is the same game RNG for all forms/policies.
3. **Stats are egg averages** (no ±12% spread, no gear). A form's “A/B” and lane only change *which skill* it has (and nothing about stats) in this data, so A-vs-B differences are pure skill differences.
4. **Stage comparison is limited:** the control group is Stage 3 with stat 50 and no Auto, per egg. Stage 4 forms differ from control in BOTH stats and Auto, so the difference is not the Auto effect alone. To isolate Auto, rerun a Stage-4 form with `autoSkill` disabled (needs a small `--no-auto` flag in `ctx-driver.js`; not built).
5. **Relics:** use `relic_effect_early.csv` (random offer + random pick, runs that cleared room 4). `relic_ownership_naive.csv` is survivorship-biased.
6. **Armor numbers are gross** (not armor actually used). `ord_dmg` = everything not inside skill functions (rune burn, quake counter, thorn included).
7. **Time is an estimate** (1.5–2.5 s/swipe + 10 s per rest/shop/quiz). Check with real owner timing before trusting it.
8. `swipes` counts valid swipes only; no-op swipes are not modelled (the engine ignores them).

## 3. Headline observations from `main-p0.7` (bot data — hypotheses, not conclusions)
* Win rate (Stage 4, pooled, 3 policies): Common ≈0%, Rare ≈0%, Epic 1.5–9%, **Legendary 38–78%**. Egg level: only เทพ (egg3) and ธรา (egg6) win meaningfully; เพลิง/ธาร/นภา/พฤกษ์ ≈0–0.4% under every policy.
* Most runs end early: a large share of all runs lose in rooms 2–4 (see `REPORT.md` §6). Only ~32–41% of Stage-4 runs even reach the stag.
* Winning runs are short: median ~115–145 swipes ⇒ roughly 3–6 estimated minutes vs the 10–15 minute target. Few Stage-4 runs win, so this is the time of *lucky* runs only.
* Board jams: ~38–43% of runs have ≥1 jam, but jams are ≈5–10% of total HP loss.
* Auto casts ≈24–33 per run; skill damage is only ~13–17% of all damage dealt (pooled), most damage is ordinary rune merges.
* Stag: root release ratio ≈97–98% (roots are almost always released when hit); stag win|reached is 21–47% depending on policy.
* Relics (early-pick effect, egg3/egg6, greedy-egg): `root` is clearly positive (+16 pp / +11 pp); `shadow` looks negative for egg6 (−16 pp) — hypothesis: extra tiles clog a 4×4 board. Check `relic_effect_early.csv` CIs before believing any single number.
* Control (no Auto, stat 50): ~0% except เทพ greedy-egg 35% ⇒ the god rune alone is strong; compare with 78% at Stage 4.

## 4. Suggested next analyses (most valuable first)
1. **Why do Common/Rare lose in rooms 2–3?** Look at `rooms.csv` rows for `room ∈ {2,3}`: `enemy_hp_lost`, `moves`, `total_dmg` vs `enemy_hp_max`. Likely a damage-output problem (base attack ≈ 5 at ATK 57, mushroom 80 HP / hits 12 every 2 swipes). Question for the owner: is room 2–3 meant to be this lethal for Common?
2. Per-skill Auto contribution: `by_form_policy.csv` → `skill_dmg_share`, `skill_armor_share`, `skill_heal_share`, `casts_per_100_swipes` per skill; identify skills with near-zero contribution (candidates: เมฆาคำราม-style delayed effects, defensive skills vs. this bot).
3. Add a `--no-auto` ablation to isolate Auto's effect on win rate.
4. Re-run with a **stronger bot** (e.g. 1-ply lookahead on expected damage/armor, or avoid-jam heuristic) to see whether the 0% Common result is the bot or the game.
5. Rerun with ±12% stat spread (`stats` jitter per seed) to match the real test-account forms.
6. Real-play calibration: have the owner record 10–20 real runs (swipes, room reached) and compare to `greedy` to place the bots on the skill axis.
7. Fix the engine ambiguities in `FINDINGS-engine-vs-design.md` (owner decision), then re-run — compare via `summarize.mjs --compare`.

## 5. Quick analysis recipes (Node, no dependencies)
```js
// win rate of one form per policy
import fs from 'node:fs';
const rows = fs.readFileSync('results/main-p0.7/summary/by_form_policy.csv','utf8').replace(/^﻿/,'').trim().split('\n');
const head = rows[0].split(','); const idx = k => head.indexOf(k);
for (const r of rows.slice(1)) { const c = r.split(','); if (c[idx('form_id')]==='egg6-math-A') console.log(c[idx('policy')], c[idx('win_rate')]); }
```
Excel / Google Sheets / DuckDB / pandas also work: all CSVs are UTF-8-BOM, flat, with `run_id` as the join key (`runs.csv` ↔ `rooms.csv` ↔ `relic_events.csv`). DuckDB example: `select form_id, policy, avg((outcome='win')::int) from read_csv_auto('runs.csv') group by 1,2;` (untested here — no DuckDB/pandas installed on this machine).

## 6. Reproducibility checklist
* Same command ⇒ identical CSV (verified 1 vs 4 workers on a subset).
* Engine hash in `engine/SOURCE.json`; compare with `git rev-parse origin/main:public/2048/engine.js`-style hashes before reusing after the engine changes.
* Changing any rule ⇒ new `--label`, never overwrite `results/main-p0.7`.
* `results/` is large (~25 MB per set). Do not commit raw CSV to the app repo without the owner's decision.

## 7. Open questions for the owner
1. Should `shadow`-style mirror tiles and “lowest-number” skills ignore the freshly spawned tile? (FINDINGS #2)
2. Beetle stance: round per hit or per swipe total? (FINDINGS #1)
3. Seconds per swipe from real play (replaces the 1.5–2.5 s assumption).
4. Is a Common win rate near 0 acceptable for room 2–3 pre-tuning, or a sign the base numbers need a first pass before comparing skills?
