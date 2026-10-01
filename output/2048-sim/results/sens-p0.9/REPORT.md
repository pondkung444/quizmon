# QuizMon 2048 — simulation report

- Generated: 2026-10-01T14:59:18.846Z · node v24.18.0 · 25200 runs in 493.5s
- Engine: pondkung444/quizmon @ `2fc089631c037e172d9d4dd5e122d4516a3879a7` (main, merge #264) — files vendored in `engine/` with SHA-256 in `engine/SOURCE.json`
- Parameters: seeds/form/policy = 200, policies = random, greedy, greedy-egg, quiz P(correct) = 0.9, max swipes/run = 6000
- Command: `C:\Users\ASUS FX505\Documents\study-pet-game\output\2048-sim\sim.mjs --seeds 200 --quiz-p 0.9 --label sens-p0.9`
- Win-rate intervals are Wilson 95%; means use normal-approx 95% CI (n≈200/cell); every CSV also carries min/p10/median/p90/max.

## ⚠️ Limitations (read first)

1. **This is bot data, not balance evidence.** Notion says bot/staged results must not be treated as proof that balance passes. Bots do not plan, never use the board the way an owner does, and the three policies bracket skill rather than model it.
2. Stats are the Stage-4 **averages per egg** (no ±12% spread, no gear, no cap clipping), not any real Qmon.
3. Quizzes are simulated: each question is right with P=0.9; sensitivity at other P in `summary/sensitivity_quiz_p.csv` (if generated). Question content/images are not modelled.
4. Time is **estimated** from swipe counts: 1.5–2.5 s/swipe + 10 s per non-battle room/revive. Real animation, reading and thinking time are unknown.
5. Relic choice / doors are uniformly random on purpose. The naive “win rate when owning relic X” is biased by survivorship; use `relic_effect_early.csv`.
6. Skill/armor attribution is gross (armor is not “armor actually used”); `ord_dmg` includes rune burn, quake counter and thorn. See `run-config.json` → `rules.attribution`.
7. Nothing here changes locked rules; engine-vs-design observations are in `FINDINGS-engine-vs-design.md`.

## Validation of the harness

| check | result | detail |
|---|---|---|
| every run finished with win/loss (no timeout/stuck/guard/bad_phase) | ✅ | {"loss":22383,"win":2817} |
| runs.swipes == sum(rooms.moves) for every run | ✅ |  |
| skill_dmg <= total_dmg and ord_dmg >= 0 | ✅ |  |
| control group never casts Auto | ✅ |  |
| stage-4 forms cast at least once in >=90% of runs | ✅ |  |
| no run lost with 0 recorded death | ✅ |  |
| roots only appear when the stag was reached | ✅ |  |
| roots_released <= root_hits | ✅ |  |
| runs per (form,policy) equal | ✅ |  |

## 1. Win rate by rarity × policy (Stage 4, 36 forms pooled)

| rarity | random | greedy | greedy-egg |
|---|---|---|---|
| Common | 0.1% (0.0%–0.4%) | 0.4% (0.2%–0.8%) | 0.2% (0.1%–0.5%) |
| Rare | 0.2% (0.0%–0.6%) | 0.6% (0.3%–1.2%) | 0.0% (0.0%–0.3%) |
| Epic | 2.0% (1.5%–2.7%) | 6.2% (5.3%–7.2%) | 12.0% (10.7%–13.3%) |
| Legendary | 43.9% (41.1%–46.7%) | 54.0% (51.2%–56.8%) | 86.0% (83.9%–87.8%) |

## 2. Win rate by egg × policy

| egg | rarity | random | greedy | greedy-egg |
|---|---|---|---|---|
| เพลิง (egg1) | Common | 0.1% (0.0%–0.5%) | 0.2% (0.0%–0.6%) | 0.0% (0.0%–0.3%) |
| พฤกษ์ (egg2) | Common | 0.2% (0.0%–0.6%) | 0.7% (0.3%–1.3%) | 0.4% (0.2%–1.0%) |
| เทพ (egg3) | Legendary | 43.9% (41.1%–46.7%) | 54.0% (51.2%–56.8%) | 86.0% (83.9%–87.8%) |
| ธาร (egg4) | Rare | 0.2% (0.0%–0.6%) | 0.6% (0.3%–1.2%) | 0.0% (0.0%–0.3%) |
| นภา (egg5) | Epic | 0.0% (0.0%–0.3%) | 0.7% (0.3%–1.3%) | 0.3% (0.1%–0.9%) |
| ธรา (egg6) | Epic | 4.1% (3.1%–5.4%) | 11.8% (10.0%–13.7%) | 23.6% (21.3%–26.1%) |

## 3. Stage comparison (Stage 4 with Auto vs Stage 1–3 fallback, no Auto)

| egg | policy | Stage 4 (36→6 forms) | Stage 1–3 control | median swipes S4 / ctrl |
|---|---|---|---|---|
| เพลิง | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 58 / 35 |
| เพลิง | greedy | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 66 / 41 |
| เพลิง | greedy-egg | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 35 / 26 |
| พฤกษ์ | random | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 215 / 121 |
| พฤกษ์ | greedy | 0.7% (0.3%–1.3%) | 0.0% (0.0%–1.9%) | 248 / 158 |
| พฤกษ์ | greedy-egg | 0.4% (0.2%–1.0%) | 0.0% (0.0%–1.9%) | 538 / 397 |
| เทพ | random | 43.9% (41.1%–46.7%) | 0.0% (0.0%–1.9%) | 129 / 102 |
| เทพ | greedy | 54.0% (51.2%–56.8%) | 2.0% (0.8%–5.0%) | 131 / 114 |
| เทพ | greedy-egg | 86.0% (83.9%–87.8%) | 47.0% (40.2%–53.9%) | 108 / 136 |
| ธาร | random | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 142 / 95 |
| ธาร | greedy | 0.6% (0.3%–1.2%) | 0.0% (0.0%–1.9%) | 175 / 131 |
| ธาร | greedy-egg | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 239 / 141 |
| นภา | random | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 46 / 35 |
| นภา | greedy | 0.7% (0.3%–1.3%) | 0.0% (0.0%–1.9%) | 53 / 38 |
| นภา | greedy-egg | 0.3% (0.1%–0.9%) | 0.0% (0.0%–1.9%) | 33 / 25 |
| ธรา | random | 4.1% (3.1%–5.4%) | 0.0% (0.0%–1.9%) | 150 / 74 |
| ธรา | greedy | 11.8% (10.0%–13.7%) | 0.0% (0.0%–1.9%) | 163 / 90 |
| ธรา | greedy-egg | 23.6% (21.3%–26.1%) | 0.0% (0.0%–1.9%) | 137 / 78 |

## 4. Win rate by lane × policy (Stage 4)

| lane | random | greedy | greedy-egg |
|---|---|---|---|
| math | 4.8% (4.0%–5.7%) | 8.2% (7.2%–9.4%) | 16.3% (14.8%–17.8%) |
| science | 8.6% (7.6%–9.8%) | 11.0% (9.8%–12.3%) | 17.2% (15.7%–18.7%) |
| balanced | 10.8% (9.7%–12.1%) | 14.8% (13.4%–16.2%) | 21.8% (20.1%–23.4%) |

## 5. All 36 forms — win rate (95% CI) per policy

| form | skill | rarity | random | greedy | greedy-egg |
|---|---|---|---|---|---|
| egg1-balanced-A | คำรามราชัน | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-balanced-B | เกราะสุริยัน | Common | 0.5% (0.1%–2.8%) | 1.0% (0.3%–3.6%) | 0.0% (0.0%–1.9%) |
| egg1-math-A | คมเพลิงต่อเนื่อง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-math-B | ปราการแก้วอัคคี | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-science-A | ลาวาปะทุ | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-science-B | อัสนีอัคคี | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-balanced-A | พรแห่งพงไพร | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-balanced-B | พฤกษ์ค้ำจุน | Common | 0.0% (0.0%–1.9%) | 2.5% (1.1%–5.7%) | 0.5% (0.1%–2.8%) |
| egg2-math-A | งาหนามทะลวง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg2-math-B | เปลือกไม้ซ้อนชั้น | Common | 0.5% (0.1%–2.8%) | 0.5% (0.1%–2.8%) | 0.0% (0.0%–1.9%) |
| egg2-science-A | บุปผาระเบิด | Common | 0.5% (0.1%–2.8%) | 1.0% (0.3%–3.6%) | 1.0% (0.3%–3.6%) |
| egg2-science-B | รากหล่อเลี้ยง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg3-balanced-A | เพลิงยกระดับ | Legendary | 35.0% (28.7%–41.8%) | 48.5% (41.7%–55.4%) | 90.5% (85.6%–93.8%) |
| egg3-balanced-B | ตรามหาพร | Legendary | 81.5% (75.5%–86.3%) | 90.5% (85.6%–93.8%) | 95.0% (91.0%–97.3%) |
| egg3-math-A | รังสีพิพากษา | Legendary | 11.5% (7.8%–16.7%) | 30.0% (24.1%–36.7%) | 80.5% (74.5%–85.4%) |
| egg3-math-B | ตราอนันต์ | Legendary | 40.0% (33.5%–46.9%) | 49.0% (42.2%–55.9%) | 90.0% (85.1%–93.4%) |
| egg3-science-A | พฤกษ์แปรทิพย์ | Legendary | 85.0% (79.4%–89.3%) | 85.5% (80.0%–89.7%) | 96.0% (92.3%–98.0%) |
| egg3-science-B | สวนทิพย์ผลิบาน | Legendary | 10.5% (7.0%–15.5%) | 20.5% (15.5%–26.6%) | 64.0% (57.1%–70.3%) |
| egg4-balanced-A | พายุหิมะ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-balanced-B | ผลึกเหมันต์พิทักษ์ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-A | คมผลึกเยือกแข็ง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-B | ปราการน้ำแข็ง | Rare | 1.0% (0.3%–3.6%) | 3.5% (1.7%–7.0%) | 0.0% (0.0%–1.9%) |
| egg4-science-A | คำรามเยือกสะท้าน | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-science-B | ธารเย็นหล่อเลี้ยง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-balanced-A | อัสนีแปรรูน | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-balanced-B | อัสนีประสานฟ้า | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-A | อัสนีทวีคม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-B | ประจุพิทักษ์ | Epic | 0.0% (0.0%–1.9%) | 4.0% (2.0%–7.7%) | 2.0% (0.8%–5.0%) |
| egg5-science-A | เมฆาคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-science-B | ม่านเมฆอัมพาต | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg6-balanced-A | พรแห่งผืนดิน | Epic | 6.0% (3.5%–10.2%) | 15.0% (10.7%–20.6%) | 53.0% (46.1%–59.8%) |
| egg6-balanced-B | ฌานยกระดับศิลา | Epic | 7.0% (4.2%–11.4%) | 19.5% (14.6%–25.5%) | 22.0% (16.8%–28.2%) |
| egg6-math-A | ศรแกนศิลา | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 1.5% (0.5%–4.3%) |
| egg6-math-B | ตราปราการ | Epic | 4.0% (2.0%–7.7%) | 11.5% (7.8%–16.7%) | 20.5% (15.5%–26.6%) |
| egg6-science-A | แผ่นดินคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 1.0% (0.3%–3.6%) |
| egg6-science-B | มหาปราการ | Epic | 7.5% (4.6%–12.0%) | 24.5% (19.1%–30.9%) | 43.5% (36.8%–50.4%) |

## 6. Where runs end (share of ALL runs losing at each room, Stage 4) and first-death distribution

| egg | policy | lose r1 | lose r2 | lose r3 | lose r4 | lose r5 | lose r6 | lose r7 | lose r8 | win |
|---|---|---|---|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.3% | 36.5% | 36.8% | 23.0% | 0.4% | 0.4% | 0.1% | 2.6% | 0.0% |
| เพลิง | greedy | 0.0% | 20.3% | 21.8% | 32.3% | 1.6% | 0.8% | 0.9% | 22.2% | 0.2% |
| เพลิง | random | 0.3% | 29.5% | 21.9% | 29.8% | 1.1% | 1.1% | 0.9% | 15.3% | 0.1% |
| พฤกษ์ | greedy-egg | 0.1% | 3.3% | 5.1% | 56.8% | 1.5% | 1.1% | 1.2% | 30.5% | 0.4% |
| พฤกษ์ | greedy | 0.3% | 6.5% | 5.6% | 35.2% | 1.4% | 1.3% | 1.3% | 47.7% | 0.7% |
| พฤกษ์ | random | 1.4% | 9.7% | 10.0% | 43.1% | 2.1% | 2.2% | 1.0% | 30.4% | 0.2% |
| เทพ | greedy-egg | 0.0% | 0.0% | 0.1% | 0.7% | 0.1% | 0.1% | 0.1% | 13.0% | 86.0% |
| เทพ | greedy | 0.0% | 0.2% | 0.6% | 7.1% | 0.6% | 0.5% | 0.6% | 36.5% | 54.0% |
| เทพ | random | 0.0% | 0.8% | 0.9% | 11.3% | 2.0% | 0.8% | 0.8% | 39.3% | 43.9% |
| ธาร | greedy-egg | 2.8% | 25.5% | 26.4% | 32.1% | 1.7% | 1.3% | 1.1% | 9.2% | 0.0% |
| ธาร | greedy | 0.2% | 10.9% | 13.5% | 44.6% | 2.3% | 2.0% | 2.1% | 23.9% | 0.6% |
| ธาร | random | 2.8% | 22.5% | 18.9% | 37.9% | 1.8% | 1.5% | 0.8% | 13.6% | 0.2% |
| นภา | greedy-egg | 0.2% | 25.5% | 40.6% | 21.8% | 0.8% | 0.4% | 0.5% | 10.0% | 0.3% |
| นภา | greedy | 0.0% | 19.0% | 23.1% | 31.7% | 1.0% | 0.9% | 1.2% | 22.5% | 0.7% |
| นภา | random | 0.2% | 26.4% | 27.8% | 26.8% | 1.5% | 1.1% | 0.4% | 15.9% | 0.0% |
| ธรา | greedy-egg | 0.0% | 0.3% | 3.6% | 17.1% | 2.7% | 1.7% | 1.7% | 49.5% | 23.6% |
| ธรา | greedy | 0.0% | 1.6% | 5.4% | 18.1% | 2.1% | 1.5% | 0.8% | 58.8% | 11.8% |
| ธรา | random | 0.0% | 3.9% | 9.1% | 24.2% | 2.1% | 1.6% | 1.6% | 53.5% | 4.1% |

Per room (all Stage-4, by policy): `summary/by_room_policy_stage4.csv`; per form: `by_room_form_policy.csv`.

## 7. Swipes and estimated time (Stage 4; winners only for the 10–15 min target)

| egg | policy | swipes/run median [min–max] | swipes median (wins) | est. min wins (lo–hi s/swipe) | % wins inside 10–15 min* |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 35 [16–129] | – | – | – |
| เพลิง | greedy | 66 [17–388] | 231 | 6.1–10.0 | 50.0% |
| เพลิง | random | 58 [19–331] | 218 | 5.8–9.4 | 0.0% |
| พฤกษ์ | greedy-egg | 538 [37–1466] | 447 | 11.8–19.3 | 80.0% |
| พฤกษ์ | greedy | 248 [19–877] | 371 | 9.7–15.8 | 87.5% |
| พฤกษ์ | random | 215 [20–772] | 397 | 10.3–16.9 | 100.0% |
| เทพ | greedy-egg | 108 [28–226] | 108 | 3.0–4.8 | 0.0% |
| เทพ | greedy | 131 [23–433] | 134 | 3.7–6.0 | 5.6% |
| เทพ | random | 129 [26–446] | 139 | 3.8–6.1 | 4.7% |
| ธาร | greedy-egg | 239 [38–843] | – | – | – |
| ธาร | greedy | 175 [23–1023] | 370 | 9.8–15.9 | 100.0% |
| ธาร | random | 142 [21–811] | 322 | 8.5–13.8 | 100.0% |
| นภา | greedy-egg | 33 [16–227] | 160 | 4.4–7.1 | 0.0% |
| นภา | greedy | 53 [17–436] | 313 | 8.1–13.4 | 87.5% |
| นภา | random | 46 [16–436] | – | – | – |
| ธรา | greedy-egg | 137 [28–344] | 174 | 4.8–7.7 | 11.7% |
| ธรา | greedy | 163 [20–514] | 218 | 5.8–9.5 | 43.3% |
| ธรา | random | 150 [19–670] | 221 | 5.9–9.5 | 46.9% |

*window overlaps the 10–15 min target for either seconds-per-swipe assumption.

## 8. Board jams (Stage 4)

| egg | policy | runs with ≥1 jam | jams/run | jams per swipe | HP lost to jams / run | jam share of all HP loss |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.1% | 0.00 | 0.0% | 0.0 | 0.0% |
| เพลิง | greedy | 11.7% | 0.23 | 0.3% | 5.8 | 1.6% |
| เพลิง | random | 12.9% | 0.26 | 0.4% | 6.4 | 1.9% |
| พฤกษ์ | greedy-egg | 94.9% | 8.71 | 1.6% | 214.9 | 14.3% |
| พฤกษ์ | greedy | 68.1% | 2.46 | 1.0% | 59.9 | 6.2% |
| พฤกษ์ | random | 74.5% | 2.79 | 1.3% | 68.1 | 7.8% |
| เทพ | greedy-egg | 41.9% | 0.54 | 0.5% | 15.0 | 4.2% |
| เทพ | greedy | 53.3% | 1.03 | 0.8% | 28.9 | 5.5% |
| เทพ | random | 62.0% | 1.31 | 1.0% | 36.7 | 6.9% |
| ธาร | greedy-egg | 66.6% | 2.45 | 0.9% | 65.0 | 12.3% |
| ธาร | greedy | 50.2% | 1.41 | 0.7% | 37.3 | 5.7% |
| ธาร | random | 53.3% | 1.44 | 0.9% | 38.3 | 7.0% |
| นภา | greedy-egg | 4.5% | 0.05 | 0.1% | 1.1 | 0.5% |
| นภา | greedy | 13.8% | 0.33 | 0.4% | 8.7 | 2.4% |
| นภา | random | 16.5% | 0.39 | 0.5% | 10.0 | 3.1% |
| ธรา | greedy-egg | 52.0% | 0.87 | 0.6% | 21.7 | 6.7% |
| ธรา | greedy | 56.3% | 1.44 | 0.9% | 36.8 | 6.6% |
| ธรา | random | 61.4% | 1.60 | 1.0% | 41.3 | 7.9% |

## 9. Auto vs ordinary runes (Stage 4; per run means)

| egg | policy | casts/run [min–med–max] | casts/100 swipes | skill dmg share | skill armor share | skill heal share |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 7.5 [3–6–26] | 18.8 | 22.0% | 60.3% | 0.0% |
| เพลิง | greedy | 15.7 [3–13–81] | 19.6 | 27.5% | 33.0% | 0.0% |
| เพลิง | random | 14.2 [3–11–68] | 19.5 | 29.8% | 37.2% | 0.0% |
| พฤกษ์ | greedy-egg | 90.0 [6–90–258] | 16.8 | 13.5% | 13.9% | 23.0% |
| พฤกษ์ | greedy | 42.1 [3–41–157] | 16.7 | 5.5% | 18.9% | 24.4% |
| พฤกษ์ | random | 36.8 [3–35–142] | 16.7 | 5.8% | 19.6% | 26.7% |
| เทพ | greedy-egg | 22.2 [5–22–47] | 20.0 | 11.7% | 13.1% | 0.4% |
| เทพ | greedy | 27.7 [4–27–91] | 20.1 | 16.3% | 19.5% | 0.8% |
| เทพ | random | 26.9 [5–26–93] | 20.1 | 17.2% | 21.9% | 0.8% |
| ธาร | greedy-egg | 54.0 [7–48–176] | 19.9 | 27.1% | 11.4% | 27.3% |
| ธาร | greedy | 38.0 [4–35–212] | 20.0 | 12.0% | 14.5% | 4.2% |
| ธาร | random | 31.1 [4–28–164] | 19.9 | 12.0% | 15.8% | 4.0% |
| นภา | greedy-egg | 10.6 [3–7–58] | 22.6 | 30.4% | 76.9% | 0.0% |
| นภา | greedy | 17.5 [3–11–99] | 21.3 | 35.7% | 42.5% | 0.0% |
| นภา | random | 15.0 [3–9–94] | 20.9 | 37.5% | 45.8% | 0.0% |
| ธรา | greedy-egg | 27.2 [5–28–72] | 20.1 | 6.2% | 19.8% | 32.3% |
| ธรา | greedy | 34.1 [4–32–102] | 20.1 | 8.9% | 26.0% | 18.7% |
| ธรา | random | 30.9 [3–30–142] | 20.1 | 9.9% | 29.0% | 20.4% |

## 10. Stag boss (Stage 4)

| egg | policy | reached | win | reached | stag HP left at loss (median, min–max) | roots applied / hits / released per stag run |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 2.6% | 0.0% | 91.9% (59.1%–100.0%) | 4.7 / 6.8 / 4.0 |
| เพลิง | greedy | 22.3% | 0.7% | 87.3% (3.9%–100.0%) | 18.2 / 23.3 / 17.8 |
| เพลิง | random | 15.3% | 0.5% | 91.3% (48.8%–100.0%) | 13.8 / 18.8 / 13.5 |
| พฤกษ์ | greedy-egg | 30.9% | 1.3% | 90.3% (0.3%–100.0%) | 36.9 / 46.5 / 36.7 |
| พฤกษ์ | greedy | 48.3% | 1.4% | 91.7% (1.8%–100.0%) | 27.4 / 35.5 / 27.0 |
| พฤกษ์ | random | 30.6% | 0.5% | 93.5% (2.3%–100.0%) | 21.9 / 27.2 / 21.7 |
| เทพ | greedy-egg | 99.0% | 86.9% | 50.6% (1.4%–98.8%) | 27.7 / 37.8 / 26.8 |
| เทพ | greedy | 90.5% | 59.7% | 66.2% (0.2%–100.0%) | 33.6 / 45.2 / 32.9 |
| เทพ | random | 83.3% | 52.8% | 70.7% (0.3%–100.0%) | 32.3 / 43.0 / 31.7 |
| ธาร | greedy-egg | 9.2% | 0.0% | 91.1% (37.3%–100.0%) | 17.5 / 24.9 / 17.2 |
| ธาร | greedy | 24.5% | 2.4% | 87.2% (1.3%–100.0%) | 26.4 / 33.8 / 26.0 |
| ธาร | random | 13.8% | 1.2% | 90.0% (33.2%–100.0%) | 21.2 / 27.2 / 20.9 |
| นภา | greedy-egg | 10.3% | 3.2% | 83.8% (3.8%–100.0%) | 14.7 / 19.0 / 14.3 |
| นภา | greedy | 23.2% | 2.9% | 85.0% (1.0%–100.0%) | 25.4 / 32.9 / 24.9 |
| นภา | random | 15.9% | 0.0% | 86.3% (0.4%–100.0%) | 20.0 / 25.5 / 19.7 |
| ธรา | greedy-egg | 73.1% | 32.3% | 65.3% (0.8%–100.0%) | 31.0 / 40.6 / 30.5 |
| ธรา | greedy | 70.5% | 16.7% | 73.9% (0.5%–100.0%) | 35.9 / 47.5 / 35.4 |
| ธรา | random | 57.6% | 7.1% | 82.4% (0.7%–100.0%) | 28.5 / 37.1 / 28.1 |

## 11. Relics

Fair estimate: among runs that cleared room 4, win rate with vs without the relic picked at the room-2/4 rewards (random offers, random pick). Pooled over all Stage-4 forms.

| relic | policy | n with | win with | n without | win without | Δ |
|---|---|---|---|---|---|---|
| echo | random | 990 | 20.7% (18.3%–23.3%) | 1900 | 19.8% (18.1%–21.6%) | +0.9 pp |
| shadow | random | 984 | 17.4% (15.1%–19.9%) | 1906 | 21.5% (19.7%–23.4%) | -4.1 pp |
| spark | random | 938 | 18.6% (16.2%–21.2%) | 1952 | 20.9% (19.1%–22.7%) | -2.3 pp |
| seed | random | 915 | 20.2% (17.7%–22.9%) | 1975 | 20.1% (18.3%–21.9%) | +0.2 pp |
| thorn | random | 995 | 18.6% (16.3%–21.1%) | 1895 | 20.9% (19.1%–22.8%) | -2.3 pp |
| root | random | 958 | 25.3% (22.6%–28.1%) | 1932 | 17.5% (15.9%–19.3%) | +7.7 pp |
| echo | greedy | 1258 | 23.8% (21.5%–26.2%) | 2368 | 21.7% (20.1%–23.5%) | +2.0 pp |
| shadow | greedy | 1252 | 18.3% (16.2%–20.5%) | 2374 | 24.6% (23.0%–26.4%) | -6.4 pp |
| spark | greedy | 1190 | 21.4% (19.2%–23.8%) | 2436 | 22.9% (21.3%–24.7%) | -1.5 pp |
| seed | greedy | 1189 | 21.2% (19.0%–23.6%) | 2437 | 23.1% (21.4%–24.8%) | -1.9 pp |
| thorn | greedy | 1165 | 24.6% (22.2%–27.2%) | 2461 | 21.4% (19.8%–23.1%) | +3.2 pp |
| root | greedy | 1198 | 25.5% (23.2%–28.1%) | 2428 | 20.9% (19.4%–22.6%) | +4.6 pp |
| echo | greedy-egg | 992 | 44.2% (41.1%–47.3%) | 1908 | 46.4% (44.2%–48.7%) | -2.3 pp |
| shadow | greedy-egg | 919 | 43.5% (40.4%–46.8%) | 1981 | 46.6% (44.5%–48.8%) | -3.1 pp |
| spark | greedy-egg | 913 | 44.7% (41.5%–47.9%) | 1987 | 46.1% (43.9%–48.3%) | -1.4 pp |
| seed | greedy-egg | 963 | 44.0% (40.9%–47.2%) | 1937 | 46.5% (44.3%–48.7%) | -2.4 pp |
| thorn | greedy-egg | 1087 | 43.6% (40.7%–46.6%) | 1813 | 46.9% (44.6%–49.2%) | -3.3 pp |
| root | greedy-egg | 926 | 54.4% (51.2%–57.6%) | 1974 | 41.5% (39.4%–43.7%) | +12.9 pp |
| echo | ALL | 3240 | 29.1% (27.5%–30.7%) | 6176 | 28.8% (27.7%–29.9%) | +0.3 pp |
| shadow | ALL | 3155 | 25.4% (23.9%–26.9%) | 6261 | 30.7% (29.5%–31.8%) | -5.3 pp |
| spark | ALL | 3041 | 27.5% (26.0%–29.1%) | 6375 | 29.5% (28.4%–30.7%) | -2.0 pp |
| seed | ALL | 3067 | 28.1% (26.5%–29.7%) | 6349 | 29.3% (28.2%–30.4%) | -1.2 pp |
| thorn | ALL | 3247 | 29.1% (27.6%–30.7%) | 6169 | 28.7% (27.6%–29.9%) | +0.4 pp |
| root | ALL | 3082 | 34.1% (32.5%–35.8%) | 6334 | 26.3% (25.2%–27.4%) | +7.8 pp |

Per egg: `relic_effect_early.csv`. Naive final-ownership table (biased): `relic_ownership_naive.csv`. Offers/picks: `relic_offers_picks.csv`.

## Files

See `README.md` (data dictionary) in the parent folder. Summary CSVs live in `summary/`.
