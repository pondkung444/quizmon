# QuizMon 2048 — simulation report

- Generated: 2026-10-01T14:44:17.375Z · node v24.18.0 · 25200 runs in 458.3s
- Engine: pondkung444/quizmon @ `2fc089631c037e172d9d4dd5e122d4516a3879a7` (main, merge #264) — files vendored in `engine/` with SHA-256 in `engine/SOURCE.json`
- Parameters: seeds/form/policy = 200, policies = random, greedy, greedy-egg, quiz P(correct) = 0.7, max swipes/run = 6000
- Command: `C:\Users\ASUS FX505\Documents\study-pet-game\output\2048-sim\sim.mjs --seeds 200 --label main-p0.7`
- Win-rate intervals are Wilson 95%; means use normal-approx 95% CI (n≈200/cell); every CSV also carries min/p10/median/p90/max.

## ⚠️ Limitations (read first)

1. **This is bot data, not balance evidence.** Notion says bot/staged results must not be treated as proof that balance passes. Bots do not plan, never use the board the way an owner does, and the three policies bracket skill rather than model it.
2. Stats are the Stage-4 **averages per egg** (no ±12% spread, no gear, no cap clipping), not any real Qmon.
3. Quizzes are simulated: each question is right with P=0.7; sensitivity at other P in `summary/sensitivity_quiz_p.csv` (if generated). Question content/images are not modelled.
4. Time is **estimated** from swipe counts: 1.5–2.5 s/swipe + 10 s per non-battle room/revive. Real animation, reading and thinking time are unknown.
5. Relic choice / doors are uniformly random on purpose. The naive “win rate when owning relic X” is biased by survivorship; use `relic_effect_early.csv`.
6. Skill/armor attribution is gross (armor is not “armor actually used”); `ord_dmg` includes rune burn, quake counter and thorn. See `run-config.json` → `rules.attribution`.
7. Nothing here changes locked rules; engine-vs-design observations are in `FINDINGS-engine-vs-design.md`.

## Validation of the harness

| check | result | detail |
|---|---|---|
| every run finished with win/loss (no timeout/stuck/guard/bad_phase) | ✅ | {"loss":22796,"win":2404} |
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
| Common | 0.1% (0.0%–0.3%) | 0.2% (0.1%–0.5%) | 0.1% (0.0%–0.4%) |
| Rare | 0.1% (0.0%–0.5%) | 0.3% (0.1%–0.7%) | 0.0% (0.0%–0.3%) |
| Epic | 1.5% (1.1%–2.1%) | 4.3% (3.6%–5.2%) | 9.0% (7.9%–10.2%) |
| Legendary | 37.8% (35.1%–40.5%) | 47.4% (44.6%–50.2%) | 78.3% (75.8%–80.5%) |

## 2. Win rate by egg × policy

| egg | rarity | random | greedy | greedy-egg |
|---|---|---|---|---|
| เพลิง (egg1) | Common | 0.1% (0.0%–0.5%) | 0.0% (0.0%–0.3%) | 0.0% (0.0%–0.3%) |
| พฤกษ์ (egg2) | Common | 0.1% (0.0%–0.5%) | 0.4% (0.2%–1.0%) | 0.3% (0.1%–0.7%) |
| เทพ (egg3) | Legendary | 37.8% (35.1%–40.5%) | 47.4% (44.6%–50.2%) | 78.3% (75.8%–80.5%) |
| ธาร (egg4) | Rare | 0.1% (0.0%–0.5%) | 0.3% (0.1%–0.7%) | 0.0% (0.0%–0.3%) |
| นภา (egg5) | Epic | 0.0% (0.0%–0.3%) | 0.4% (0.2%–1.0%) | 0.2% (0.0%–0.6%) |
| ธรา (egg6) | Epic | 3.1% (2.2%–4.2%) | 8.3% (6.8%–9.9%) | 17.8% (15.8%–20.1%) |

## 3. Stage comparison (Stage 4 with Auto vs Stage 1–3 fallback, no Auto)

| egg | policy | Stage 4 (36→6 forms) | Stage 1–3 control | median swipes S4 / ctrl |
|---|---|---|---|---|
| เพลิง | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 50 / 30 |
| เพลิง | greedy | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 56 / 34 |
| เพลิง | greedy-egg | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 30 / 22 |
| พฤกษ์ | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 196 / 106 |
| พฤกษ์ | greedy | 0.4% (0.2%–1.0%) | 0.0% (0.0%–1.9%) | 233 / 144 |
| พฤกษ์ | greedy-egg | 0.3% (0.1%–0.7%) | 0.0% (0.0%–1.9%) | 517 / 375 |
| เทพ | random | 37.8% (35.1%–40.5%) | 0.0% (0.0%–1.9%) | 122 / 89 |
| เทพ | greedy | 47.4% (44.6%–50.2%) | 1.0% (0.3%–3.6%) | 126 / 91 |
| เทพ | greedy-egg | 78.3% (75.8%–80.5%) | 35.0% (28.7%–41.8%) | 107 / 122 |
| ธาร | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 116 / 75 |
| ธาร | greedy | 0.3% (0.1%–0.7%) | 0.0% (0.0%–1.9%) | 159 / 107 |
| ธาร | greedy-egg | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 206 / 126 |
| นภา | random | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 40 / 30 |
| นภา | greedy | 0.4% (0.2%–1.0%) | 0.0% (0.0%–1.9%) | 46 / 34 |
| นภา | greedy-egg | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 29 / 22 |
| ธรา | random | 3.1% (2.2%–4.2%) | 0.0% (0.0%–1.9%) | 137 / 54 |
| ธรา | greedy | 8.3% (6.8%–9.9%) | 0.0% (0.0%–1.9%) | 152 / 72 |
| ธรา | greedy-egg | 17.8% (15.8%–20.1%) | 0.0% (0.0%–1.9%) | 129 / 68 |

## 4. Win rate by lane × policy (Stage 4)

| lane | random | greedy | greedy-egg |
|---|---|---|---|
| math | 3.7% (3.0%–4.5%) | 6.3% (5.4%–7.4%) | 14.3% (13.0%–15.8%) |
| science | 7.5% (6.5%–8.6%) | 9.8% (8.7%–11.1%) | 14.5% (13.2%–16.0%) |
| balanced | 9.3% (8.2%–10.6%) | 12.2% (11.0%–13.6%) | 19.4% (17.8%–21.0%) |

## 5. All 36 forms — win rate (95% CI) per policy

| form | skill | rarity | random | greedy | greedy-egg |
|---|---|---|---|---|---|
| egg1-balanced-A | คำรามราชัน | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-balanced-B | เกราะสุริยัน | Common | 0.5% (0.1%–2.8%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-math-A | คมเพลิงต่อเนื่อง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-math-B | ปราการแก้วอัคคี | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-science-A | ลาวาปะทุ | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg1-science-B | อัสนีอัคคี | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-balanced-A | พรแห่งพงไพร | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-balanced-B | พฤกษ์ค้ำจุน | Common | 0.0% (0.0%–1.9%) | 1.5% (0.5%–4.3%) | 0.0% (0.0%–1.9%) |
| egg2-math-A | งาหนามทะลวง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg2-math-B | เปลือกไม้ซ้อนชั้น | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-science-A | บุปผาระเบิด | Common | 0.5% (0.1%–2.8%) | 1.0% (0.3%–3.6%) | 0.5% (0.1%–2.8%) |
| egg2-science-B | รากหล่อเลี้ยง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg3-balanced-A | เพลิงยกระดับ | Legendary | 28.5% (22.7%–35.1%) | 40.0% (33.5%–46.9%) | 83.5% (77.7%–88.0%) |
| egg3-balanced-B | ตรามหาพร | Legendary | 71.5% (64.9%–77.3%) | 82.0% (76.1%–86.7%) | 91.5% (86.8%–94.6%) |
| egg3-math-A | รังสีพิพากษา | Legendary | 8.0% (5.0%–12.6%) | 23.5% (18.2%–29.8%) | 71.5% (64.9%–77.3%) |
| egg3-math-B | ตราอนันต์ | Legendary | 33.5% (27.3%–40.3%) | 41.0% (34.4%–47.9%) | 83.5% (77.7%–88.0%) |
| egg3-science-A | พฤกษ์แปรทิพย์ | Legendary | 78.5% (72.3%–83.6%) | 83.0% (77.2%–87.6%) | 89.0% (83.9%–92.6%) |
| egg3-science-B | สวนทิพย์ผลิบาน | Legendary | 6.5% (3.8%–10.8%) | 15.0% (10.7%–20.6%) | 50.5% (43.6%–57.4%) |
| egg4-balanced-A | พายุหิมะ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-balanced-B | ผลึกเหมันต์พิทักษ์ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-A | คมผลึกเยือกแข็ง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-B | ปราการน้ำแข็ง | Rare | 0.5% (0.1%–2.8%) | 1.5% (0.5%–4.3%) | 0.0% (0.0%–1.9%) |
| egg4-science-A | คำรามเยือกสะท้าน | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-science-B | ธารเย็นหล่อเลี้ยง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-balanced-A | อัสนีแปรรูน | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-balanced-B | อัสนีประสานฟ้า | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-A | อัสนีทวีคม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-B | ประจุพิทักษ์ | Epic | 0.0% (0.0%–1.9%) | 2.5% (1.1%–5.7%) | 1.0% (0.3%–3.6%) |
| egg5-science-A | เมฆาคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-science-B | ม่านเมฆอัมพาต | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg6-balanced-A | พรแห่งผืนดิน | Epic | 5.5% (3.1%–9.6%) | 10.5% (7.0%–15.5%) | 41.5% (34.9%–48.4%) |
| egg6-balanced-B | ฌานยกระดับศิลา | Epic | 6.0% (3.5%–10.2%) | 12.5% (8.6%–17.8%) | 16.0% (11.6%–21.7%) |
| egg6-math-A | ศรแกนศิลา | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 1.0% (0.3%–3.6%) |
| egg6-math-B | ตราปราการ | Epic | 2.5% (1.1%–5.7%) | 7.5% (4.6%–12.0%) | 14.5% (10.3%–20.0%) |
| egg6-science-A | แผ่นดินคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 1.0% (0.3%–3.6%) |
| egg6-science-B | มหาปราการ | Epic | 4.5% (2.4%–8.3%) | 19.0% (14.2%–25.0%) | 33.0% (26.9%–39.8%) |

## 6. Where runs end (share of ALL runs losing at each room, Stage 4) and first-death distribution

| egg | policy | lose r1 | lose r2 | lose r3 | lose r4 | lose r5 | lose r6 | lose r7 | lose r8 | win |
|---|---|---|---|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.5% | 50.7% | 29.2% | 17.3% | 0.4% | 0.3% | 0.1% | 1.6% | 0.0% |
| เพลิง | greedy | 0.2% | 31.3% | 20.3% | 28.6% | 1.3% | 0.9% | 0.6% | 16.9% | 0.0% |
| เพลิง | random | 1.6% | 40.0% | 17.8% | 25.3% | 1.1% | 1.2% | 0.8% | 12.3% | 0.1% |
| พฤกษ์ | greedy-egg | 0.2% | 4.9% | 5.5% | 58.8% | 1.5% | 1.1% | 1.3% | 26.4% | 0.3% |
| พฤกษ์ | greedy | 0.6% | 9.7% | 6.3% | 38.3% | 1.3% | 1.3% | 1.6% | 40.5% | 0.4% |
| พฤกษ์ | random | 3.3% | 14.2% | 10.2% | 42.2% | 2.0% | 1.1% | 0.8% | 26.2% | 0.1% |
| เทพ | greedy-egg | 0.0% | 0.0% | 0.2% | 1.5% | 0.0% | 0.1% | 0.1% | 19.9% | 78.3% |
| เทพ | greedy | 0.0% | 0.2% | 1.1% | 10.8% | 0.9% | 0.4% | 0.5% | 38.7% | 47.4% |
| เทพ | random | 0.1% | 0.9% | 2.2% | 14.6% | 1.9% | 1.2% | 0.6% | 40.8% | 37.8% |
| ธาร | greedy-egg | 5.2% | 30.7% | 26.1% | 28.3% | 1.3% | 1.0% | 0.9% | 6.6% | 0.0% |
| ธาร | greedy | 0.8% | 17.8% | 14.6% | 41.3% | 1.8% | 1.6% | 1.8% | 20.2% | 0.3% |
| ธาร | random | 7.0% | 29.3% | 18.3% | 31.7% | 1.0% | 1.1% | 0.5% | 11.0% | 0.1% |
| นภา | greedy-egg | 0.3% | 38.8% | 35.5% | 16.3% | 0.8% | 0.3% | 0.3% | 7.8% | 0.2% |
| นภา | greedy | 0.0% | 27.5% | 24.8% | 25.9% | 1.3% | 0.8% | 0.7% | 18.7% | 0.4% |
| นภา | random | 0.6% | 37.3% | 24.8% | 22.3% | 1.2% | 0.8% | 0.4% | 12.7% | 0.0% |
| ธรา | greedy-egg | 0.0% | 0.8% | 6.9% | 20.2% | 2.3% | 2.2% | 1.3% | 48.5% | 17.8% |
| ธรา | greedy | 0.0% | 3.9% | 8.0% | 20.4% | 1.8% | 1.4% | 0.6% | 55.6% | 8.3% |
| ธรา | random | 0.0% | 8.8% | 10.8% | 24.5% | 2.3% | 2.0% | 1.2% | 47.3% | 3.1% |

Per room (all Stage-4, by policy): `summary/by_room_policy_stage4.csv`; per form: `by_room_form_policy.csv`.

## 7. Swipes and estimated time (Stage 4; winners only for the 10–15 min target)

| egg | policy | swipes/run median [min–max] | swipes median (wins) | est. min wins (lo–hi s/swipe) | % wins inside 10–15 min* |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 30 [16–129] | – | – | – |
| เพลิง | greedy | 56 [17–366] | – | – | – |
| เพลิง | random | 50 [16–331] | 218 | 5.8–9.4 | 0.0% |
| พฤกษ์ | greedy-egg | 517 [37–1460] | 435 | 11.4–18.6 | 100.0% |
| พฤกษ์ | greedy | 233 [16–877] | 358 | 9.4–15.3 | 100.0% |
| พฤกษ์ | random | 196 [16–590] | 375 | 9.7–16.0 | 100.0% |
| เทพ | greedy-egg | 107 [28–214] | 107 | 3.0–4.8 | 0.0% |
| เทพ | greedy | 126 [23–433] | 135 | 3.7–6.0 | 5.1% |
| เทพ | random | 122 [26–342] | 138 | 3.8–6.1 | 4.4% |
| ธาร | greedy-egg | 206 [25–843] | – | – | – |
| ธาร | greedy | 159 [23–1023] | 370 | 9.8–15.9 | 100.0% |
| ธาร | random | 116 [21–811] | 258 | 7.0–11.3 | 100.0% |
| นภา | greedy-egg | 29 [16–227] | 160 | 4.4–7.1 | 0.0% |
| นภา | greedy | 46 [17–436] | 321 | 8.4–13.7 | 80.0% |
| นภา | random | 40 [16–436] | – | – | – |
| ธรา | greedy-egg | 129 [21–337] | 174 | 4.7–7.6 | 12.6% |
| ธรา | greedy | 152 [19–514] | 223 | 6.0–9.6 | 44.4% |
| ธรา | random | 137 [19–642] | 228 | 6.2–10.0 | 51.4% |

*window overlaps the 10–15 min target for either seconds-per-swipe assumption.

## 8. Board jams (Stage 4)

| egg | policy | runs with ≥1 jam | jams/run | jams per swipe | HP lost to jams / run | jam share of all HP loss |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.0% | 0.00 | 0.0% | 0.0 | 0.0% |
| เพลิง | greedy | 9.5% | 0.18 | 0.3% | 4.6 | 1.5% |
| เพลิง | random | 10.9% | 0.22 | 0.3% | 5.5 | 1.9% |
| พฤกษ์ | greedy-egg | 93.3% | 7.91 | 1.5% | 195.5 | 14.0% |
| พฤกษ์ | greedy | 63.4% | 2.13 | 0.9% | 52.1 | 5.9% |
| พฤกษ์ | random | 70.5% | 2.50 | 1.2% | 61.3 | 7.7% |
| เทพ | greedy-egg | 38.8% | 0.49 | 0.4% | 13.5 | 3.9% |
| เทพ | greedy | 48.6% | 0.92 | 0.7% | 25.8 | 5.2% |
| เทพ | random | 57.2% | 1.12 | 0.9% | 31.4 | 6.3% |
| ธาร | greedy-egg | 61.8% | 2.09 | 0.8% | 56.1 | 11.8% |
| ธาร | greedy | 45.0% | 1.18 | 0.7% | 31.5 | 5.4% |
| ธาร | random | 46.9% | 1.18 | 0.9% | 31.9 | 6.7% |
| นภา | greedy-egg | 3.4% | 0.04 | 0.1% | 0.8 | 0.4% |
| นภา | greedy | 11.3% | 0.26 | 0.4% | 6.8 | 2.2% |
| นภา | random | 13.8% | 0.33 | 0.5% | 8.7 | 3.0% |
| ธรา | greedy-egg | 46.8% | 0.75 | 0.6% | 18.7 | 6.3% |
| ธรา | greedy | 51.3% | 1.22 | 0.8% | 31.1 | 6.2% |
| ธรา | random | 55.7% | 1.33 | 0.9% | 34.6 | 7.3% |

## 9. Auto vs ordinary runes (Stage 4; per run means)

| egg | policy | casts/run [min–med–max] | casts/100 swipes | skill dmg share | skill armor share | skill heal share |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 6.6 [3–6–26] | 18.7 | 22.7% | 60.8% | 0.0% |
| เพลิง | greedy | 13.8 [3–11–72] | 19.5 | 28.2% | 33.9% | 0.0% |
| เพลิง | random | 12.8 [3–9–68] | 19.4 | 30.3% | 38.2% | 0.0% |
| พฤกษ์ | greedy-egg | 85.8 [6–86–257] | 16.8 | 13.6% | 14.0% | 23.3% |
| พฤกษ์ | greedy | 39.2 [2–39–157] | 16.7 | 5.7% | 19.4% | 24.9% |
| พฤกษ์ | random | 34.2 [2–32–99] | 16.7 | 5.6% | 19.9% | 27.7% |
| เทพ | greedy-egg | 21.9 [5–21–45] | 20.0 | 11.9% | 13.5% | 0.5% |
| เทพ | greedy | 26.4 [4–25–91] | 20.1 | 16.4% | 20.1% | 0.8% |
| เทพ | random | 25.6 [5–25–68] | 20.1 | 17.1% | 22.4% | 0.9% |
| ธาร | greedy-egg | 49.2 [5–41–180] | 19.9 | 26.6% | 11.6% | 27.8% |
| ธาร | greedy | 34.6 [4–32–212] | 19.9 | 12.1% | 15.1% | 4.2% |
| ธาร | random | 27.4 [4–23–164] | 19.8 | 12.0% | 16.6% | 3.8% |
| นภา | greedy-egg | 9.4 [3–6–58] | 22.3 | 31.0% | 77.1% | 0.0% |
| นภา | greedy | 15.7 [3–9–99] | 21.1 | 35.8% | 43.7% | 0.0% |
| นภา | random | 13.6 [3–8–94] | 20.8 | 37.6% | 47.4% | 0.0% |
| ธรา | greedy-egg | 25.6 [4–26–72] | 20.1 | 6.0% | 20.2% | 32.8% |
| ธรา | greedy | 31.6 [3–30–102] | 20.1 | 8.8% | 27.5% | 19.0% |
| ธรา | random | 28.5 [3–27–136] | 20.0 | 9.8% | 28.9% | 21.7% |

## 10. Stag boss (Stage 4)

| egg | policy | reached | win | reached | stag HP left at loss (median, min–max) | roots applied / hits / released per stag run |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 1.6% | 0.0% | 91.5% (59.1%–100.0%) | 4.9 / 6.5 / 3.8 |
| เพลิง | greedy | 16.9% | 0.0% | 88.1% (3.9%–100.0%) | 17.4 / 22.9 / 17.0 |
| เพลิง | random | 12.3% | 0.7% | 92.5% (48.8%–100.0%) | 13.6 / 18.7 / 13.2 |
| พฤกษ์ | greedy-egg | 26.7% | 0.9% | 91.8% (0.6%–100.0%) | 33.7 / 42.9 / 33.4 |
| พฤกษ์ | greedy | 40.9% | 1.0% | 93.2% (1.8%–100.0%) | 24.1 / 32.5 / 23.7 |
| พฤกษ์ | random | 26.3% | 0.3% | 94.2% (2.3%–100.0%) | 20.4 / 25.5 / 20.1 |
| เทพ | greedy-egg | 98.2% | 79.7% | 53.8% (0.2%–99.5%) | 27.1 / 37.3 / 26.2 |
| เทพ | greedy | 86.1% | 55.1% | 69.6% (0.1%–100.0%) | 32.5 / 43.8 / 31.7 |
| เทพ | random | 78.6% | 48.0% | 73.6% (0.3%–100.0%) | 30.7 / 41.3 / 30.1 |
| ธาร | greedy-egg | 6.6% | 0.0% | 92.2% (38.0%–100.0%) | 17.8 / 24.3 / 17.4 |
| ธาร | greedy | 20.4% | 1.2% | 89.7% (4.1%–100.0%) | 23.6 / 31.0 / 23.2 |
| ธาร | random | 11.1% | 0.8% | 92.6% (43.9%–100.0%) | 18.1 / 23.2 / 17.7 |
| นภา | greedy-egg | 7.9% | 2.1% | 84.9% (3.8%–100.0%) | 14.2 / 18.7 / 13.7 |
| นภา | greedy | 19.1% | 2.2% | 85.1% (7.4%–100.0%) | 24.4 / 32.0 / 23.9 |
| นภา | random | 12.7% | 0.0% | 88.8% (0.4%–100.0%) | 19.7 / 24.7 / 19.4 |
| ธรา | greedy-egg | 66.3% | 26.9% | 66.9% (0.8%–100.0%) | 30.3 / 39.8 / 29.7 |
| ธรา | greedy | 63.8% | 12.9% | 76.1% (0.5%–100.0%) | 33.3 / 44.6 / 32.8 |
| ธรา | random | 50.4% | 6.1% | 84.3% (0.7%–100.0%) | 25.9 / 34.0 / 25.6 |

## 11. Relics

Fair estimate: among runs that cleared room 4, win rate with vs without the relic picked at the room-2/4 rewards (random offers, random pick). Pooled over all Stage-4 forms.

| relic | policy | n with | win with | n without | win without | Δ |
|---|---|---|---|---|---|---|
| echo | random | 867 | 19.3% (16.8%–22.0%) | 1681 | 19.4% (17.6%–21.4%) | -0.1 pp |
| shadow | random | 869 | 15.8% (13.5%–18.3%) | 1679 | 21.2% (19.3%–23.2%) | -5.4 pp |
| spark | random | 830 | 18.7% (16.2%–21.5%) | 1718 | 19.7% (17.9%–21.6%) | -1.0 pp |
| seed | random | 803 | 19.2% (16.6%–22.0%) | 1745 | 19.4% (17.6%–21.3%) | -0.2 pp |
| thorn | random | 886 | 17.6% (15.2%–20.3%) | 1662 | 20.3% (18.4%–22.3%) | -2.7 pp |
| root | random | 841 | 25.8% (23.0%–28.9%) | 1707 | 16.2% (14.5%–18.0%) | +9.6 pp |
| echo | greedy | 1124 | 21.4% (19.1%–23.9%) | 2090 | 21.1% (19.4%–22.9%) | +0.4 pp |
| shadow | greedy | 1124 | 16.9% (14.8%–19.2%) | 2090 | 23.5% (21.7%–25.4%) | -6.6 pp |
| spark | greedy | 1054 | 20.2% (17.9%–22.7%) | 2160 | 21.7% (20.0%–23.5%) | -1.5 pp |
| seed | greedy | 1041 | 20.3% (17.9%–22.8%) | 2173 | 21.6% (19.9%–23.4%) | -1.4 pp |
| thorn | greedy | 1032 | 23.0% (20.5%–25.6%) | 2182 | 20.3% (18.7%–22.1%) | +2.6 pp |
| root | greedy | 1053 | 25.6% (23.1%–28.4%) | 2161 | 19.0% (17.4%–20.7%) | +6.6 pp |
| echo | greedy-egg | 910 | 42.6% (39.5%–45.9%) | 1760 | 43.8% (41.4%–46.1%) | -1.1 pp |
| shadow | greedy-egg | 834 | 39.2% (36.0%–42.6%) | 1836 | 45.3% (43.0%–47.5%) | -6.1 pp |
| spark | greedy-egg | 839 | 43.4% (40.1%–46.8%) | 1831 | 43.4% (41.1%–45.6%) | +0.0 pp |
| seed | greedy-egg | 896 | 41.0% (37.8%–44.2%) | 1774 | 44.6% (42.3%–46.9%) | -3.6 pp |
| thorn | greedy-egg | 995 | 41.6% (38.6%–44.7%) | 1675 | 44.4% (42.1%–46.8%) | -2.8 pp |
| root | greedy-egg | 866 | 52.7% (49.3%–56.0%) | 1804 | 38.9% (36.7%–41.2%) | +13.7 pp |
| echo | ALL | 2901 | 27.4% (25.8%–29.1%) | 5531 | 27.8% (26.6%–29.0%) | -0.3 pp |
| shadow | ALL | 2827 | 23.1% (21.6%–24.7%) | 5605 | 29.9% (28.8%–31.1%) | -6.8 pp |
| spark | ALL | 2723 | 26.9% (25.3%–28.6%) | 5709 | 28.0% (26.9%–29.2%) | -1.1 pp |
| seed | ALL | 2740 | 26.7% (25.1%–28.4%) | 5692 | 28.1% (27.0%–29.3%) | -1.4 pp |
| thorn | ALL | 2913 | 27.7% (26.1%–29.4%) | 5519 | 27.6% (26.5%–28.8%) | +0.1 pp |
| root | ALL | 2760 | 34.2% (32.4%–36.0%) | 5672 | 24.5% (23.4%–25.6%) | +9.7 pp |

Per egg: `relic_effect_early.csv`. Naive final-ownership table (biased): `relic_ownership_naive.csv`. Offers/picks: `relic_offers_picks.csv`.

## 12. Sensitivity to simulated quiz accuracy (Stage 4, win rate pooled by rarity)

| rarity | policy | win_p0.7 | win_p0.5 | win_p0.9 |
|---|---|---|---|---|
| Common | random | 0.1% | 0.1% | 0.1% |
| Common | greedy | 0.2% | 0.2% | 0.4% |
| Common | greedy-egg | 0.1% | 0.1% | 0.2% |
| Rare | random | 0.1% | 0.1% | 0.2% |
| Rare | greedy | 0.3% | 0.1% | 0.6% |
| Rare | greedy-egg | 0.0% | 0.1% | 0.0% |
| Epic | random | 1.5% | 1.2% | 2.0% |
| Epic | greedy | 4.3% | 3.5% | 6.2% |
| Epic | greedy-egg | 9.0% | 8.2% | 12.0% |
| Legendary | random | 37.8% | 34.7% | 43.9% |
| Legendary | greedy | 47.4% | 43.8% | 54.0% |
| Legendary | greedy-egg | 78.2% | 74.8% | 86.0% |

## Files

See `README.md` (data dictionary) in the parent folder. Summary CSVs live in `summary/`.
