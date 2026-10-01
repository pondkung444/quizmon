# QuizMon 2048 — simulation report

- Generated: 2026-10-01T14:51:05.039Z · node v24.18.0 · 25200 runs in 399.5s
- Engine: pondkung444/quizmon @ `2fc089631c037e172d9d4dd5e122d4516a3879a7` (main, merge #264) — files vendored in `engine/` with SHA-256 in `engine/SOURCE.json`
- Parameters: seeds/form/policy = 200, policies = random, greedy, greedy-egg, quiz P(correct) = 0.5, max swipes/run = 6000
- Command: `C:\Users\ASUS FX505\Documents\study-pet-game\output\2048-sim\sim.mjs --seeds 200 --quiz-p 0.5 --label sens-p0.5`
- Win-rate intervals are Wilson 95%; means use normal-approx 95% CI (n≈200/cell); every CSV also carries min/p10/median/p90/max.

## ⚠️ Limitations (read first)

1. **This is bot data, not balance evidence.** Notion says bot/staged results must not be treated as proof that balance passes. Bots do not plan, never use the board the way an owner does, and the three policies bracket skill rather than model it.
2. Stats are the Stage-4 **averages per egg** (no ±12% spread, no gear, no cap clipping), not any real Qmon.
3. Quizzes are simulated: each question is right with P=0.5; sensitivity at other P in `summary/sensitivity_quiz_p.csv` (if generated). Question content/images are not modelled.
4. Time is **estimated** from swipe counts: 1.5–2.5 s/swipe + 10 s per non-battle room/revive. Real animation, reading and thinking time are unknown.
5. Relic choice / doors are uniformly random on purpose. The naive “win rate when owning relic X” is biased by survivorship; use `relic_effect_early.csv`.
6. Skill/armor attribution is gross (armor is not “armor actually used”); `ord_dmg` includes rune burn, quake counter and thorn. See `run-config.json` → `rules.attribution`.
7. Nothing here changes locked rules; engine-vs-design observations are in `FINDINGS-engine-vs-design.md`.

## Validation of the harness

| check | result | detail |
|---|---|---|
| every run finished with win/loss (no timeout/stuck/guard/bad_phase) | ✅ | {"loss":22989,"win":2211} |
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
| Common | 0.1% (0.0%–0.3%) | 0.2% (0.1%–0.4%) | 0.1% (0.0%–0.3%) |
| Rare | 0.1% (0.0%–0.5%) | 0.1% (0.0%–0.5%) | 0.1% (0.0%–0.5%) |
| Epic | 1.2% (0.8%–1.7%) | 3.5% (2.9%–4.4%) | 8.2% (7.1%–9.3%) |
| Legendary | 34.7% (32.0%–37.4%) | 43.8% (41.1%–46.7%) | 74.8% (72.2%–77.1%) |

## 2. Win rate by egg × policy

| egg | rarity | random | greedy | greedy-egg |
|---|---|---|---|---|
| เพลิง (egg1) | Common | 0.1% (0.0%–0.5%) | 0.0% (0.0%–0.3%) | 0.0% (0.0%–0.3%) |
| พฤกษ์ (egg2) | Common | 0.1% (0.0%–0.5%) | 0.3% (0.1%–0.9%) | 0.2% (0.0%–0.6%) |
| เทพ (egg3) | Legendary | 34.7% (32.0%–37.4%) | 43.8% (41.1%–46.7%) | 74.8% (72.2%–77.1%) |
| ธาร (egg4) | Rare | 0.1% (0.0%–0.5%) | 0.1% (0.0%–0.5%) | 0.1% (0.0%–0.5%) |
| นภา (egg5) | Epic | 0.0% (0.0%–0.3%) | 0.3% (0.1%–0.9%) | 0.2% (0.0%–0.6%) |
| ธรา (egg6) | Epic | 2.4% (1.7%–3.4%) | 6.8% (5.5%–8.3%) | 16.2% (14.2%–18.4%) |

## 3. Stage comparison (Stage 4 with Auto vs Stage 1–3 fallback, no Auto)

| egg | policy | Stage 4 (36→6 forms) | Stage 1–3 control | median swipes S4 / ctrl |
|---|---|---|---|---|
| เพลิง | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 44 / 28 |
| เพลิง | greedy | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 52 / 29 |
| เพลิง | greedy-egg | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 27 / 21 |
| พฤกษ์ | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 189 / 96 |
| พฤกษ์ | greedy | 0.3% (0.1%–0.9%) | 0.0% (0.0%–1.9%) | 225 / 132 |
| พฤกษ์ | greedy-egg | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 504 / 352 |
| เทพ | random | 34.7% (32.0%–37.4%) | 0.0% (0.0%–1.9%) | 120 / 83 |
| เทพ | greedy | 43.8% (41.1%–46.7%) | 1.0% (0.3%–3.6%) | 123 / 87 |
| เทพ | greedy-egg | 74.8% (72.2%–77.1%) | 24.5% (19.1%–30.9%) | 107 / 113 |
| ธาร | random | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 108 / 69 |
| ธาร | greedy | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 152 / 91 |
| ธาร | greedy-egg | 0.1% (0.0%–0.5%) | 0.0% (0.0%–1.9%) | 193 / 110 |
| นภา | random | 0.0% (0.0%–0.3%) | 0.0% (0.0%–1.9%) | 36 / 28 |
| นภา | greedy | 0.3% (0.1%–0.9%) | 0.0% (0.0%–1.9%) | 41 / 30 |
| นภา | greedy-egg | 0.2% (0.0%–0.6%) | 0.0% (0.0%–1.9%) | 26 / 20 |
| ธรา | random | 2.4% (1.7%–3.4%) | 0.0% (0.0%–1.9%) | 129 / 52 |
| ธรา | greedy | 6.8% (5.5%–8.3%) | 0.0% (0.0%–1.9%) | 147 / 63 |
| ธรา | greedy-egg | 16.2% (14.2%–18.4%) | 0.0% (0.0%–1.9%) | 124 / 66 |

## 4. Win rate by lane × policy (Stage 4)

| lane | random | greedy | greedy-egg |
|---|---|---|---|
| math | 3.2% (2.5%–3.9%) | 5.5% (4.6%–6.4%) | 13.4% (12.1%–14.8%) |
| science | 6.7% (5.7%–7.7%) | 9.4% (8.3%–10.6%) | 13.6% (12.3%–15.0%) |
| balanced | 8.8% (7.8%–10.0%) | 10.8% (9.7%–12.1%) | 18.7% (17.2%–20.3%) |

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
| egg2-balanced-B | พฤกษ์ค้ำจุน | Common | 0.0% (0.0%–1.9%) | 1.0% (0.3%–3.6%) | 0.0% (0.0%–1.9%) |
| egg2-math-A | งาหนามทะลวง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-math-B | เปลือกไม้ซ้อนชั้น | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg2-science-A | บุปผาระเบิด | Common | 0.5% (0.1%–2.8%) | 1.0% (0.3%–3.6%) | 0.5% (0.1%–2.8%) |
| egg2-science-B | รากหล่อเลี้ยง | Common | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg3-balanced-A | เพลิงยกระดับ | Legendary | 27.0% (21.3%–33.5%) | 30.5% (24.5%–37.2%) | 80.5% (74.5%–85.4%) |
| egg3-balanced-B | ตรามหาพร | Legendary | 69.0% (62.3%–75.0%) | 79.5% (73.4%–84.5%) | 89.5% (84.5%–93.0%) |
| egg3-math-A | รังสีพิพากษา | Legendary | 6.5% (3.8%–10.8%) | 17.5% (12.9%–23.4%) | 65.5% (58.7%–71.7%) |
| egg3-math-B | ตราอนันต์ | Legendary | 29.0% (23.2%–35.6%) | 40.5% (33.9%–47.4%) | 80.5% (74.5%–85.4%) |
| egg3-science-A | พฤกษ์แปรทิพย์ | Legendary | 71.5% (64.9%–77.3%) | 83.0% (77.2%–87.6%) | 86.0% (80.5%–90.1%) |
| egg3-science-B | สวนทิพย์ผลิบาน | Legendary | 5.0% (2.7%–9.0%) | 12.0% (8.2%–17.2%) | 46.5% (39.7%–53.4%) |
| egg4-balanced-A | พายุหิมะ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-balanced-B | ผลึกเหมันต์พิทักษ์ | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-A | คมผลึกเยือกแข็ง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-math-B | ปราการน้ำแข็ง | Rare | 0.5% (0.1%–2.8%) | 0.5% (0.1%–2.8%) | 0.0% (0.0%–1.9%) |
| egg4-science-A | คำรามเยือกสะท้าน | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg4-science-B | ธารเย็นหล่อเลี้ยง | Rare | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.5% (0.1%–2.8%) |
| egg5-balanced-A | อัสนีแปรรูน | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-balanced-B | อัสนีประสานฟ้า | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-A | อัสนีทวีคม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-math-B | ประจุพิทักษ์ | Epic | 0.0% (0.0%–1.9%) | 2.0% (0.8%–5.0%) | 1.0% (0.3%–3.6%) |
| egg5-science-A | เมฆาคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg5-science-B | ม่านเมฆอัมพาต | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg6-balanced-A | พรแห่งผืนดิน | Epic | 4.0% (2.0%–7.7%) | 9.0% (5.8%–13.8%) | 40.5% (33.9%–47.4%) |
| egg6-balanced-B | ฌานยกระดับศิลา | Epic | 5.5% (3.1%–9.6%) | 10.0% (6.6%–14.9%) | 14.0% (9.9%–19.5%) |
| egg6-math-A | ศรแกนศิลา | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg6-math-B | ตราปราการ | Epic | 2.0% (0.8%–5.0%) | 5.0% (2.7%–9.0%) | 13.5% (9.4%–18.9%) |
| egg6-science-A | แผ่นดินคำราม | Epic | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) | 0.0% (0.0%–1.9%) |
| egg6-science-B | มหาปราการ | Epic | 3.0% (1.4%–6.4%) | 16.5% (12.0%–22.3%) | 29.0% (23.2%–35.6%) |

## 6. Where runs end (share of ALL runs losing at each room, Stage 4) and first-death distribution

| egg | policy | lose r1 | lose r2 | lose r3 | lose r4 | lose r5 | lose r6 | lose r7 | lose r8 | win |
|---|---|---|---|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.7% | 58.3% | 24.9% | 14.2% | 0.2% | 0.3% | 0.3% | 1.1% | 0.0% |
| เพลิง | greedy | 0.3% | 36.5% | 19.8% | 26.6% | 1.0% | 1.4% | 0.5% | 13.9% | 0.0% |
| เพลิง | random | 2.6% | 46.5% | 14.5% | 24.3% | 1.2% | 1.0% | 0.5% | 9.4% | 0.1% |
| พฤกษ์ | greedy-egg | 0.2% | 5.9% | 6.0% | 59.8% | 1.7% | 1.3% | 1.1% | 23.8% | 0.2% |
| พฤกษ์ | greedy | 1.0% | 11.5% | 7.2% | 40.3% | 1.3% | 1.3% | 1.3% | 35.9% | 0.3% |
| พฤกษ์ | random | 3.8% | 15.9% | 10.3% | 43.8% | 1.8% | 0.9% | 1.3% | 22.2% | 0.1% |
| เทพ | greedy-egg | 0.0% | 0.0% | 0.2% | 1.8% | 0.0% | 0.0% | 0.1% | 23.2% | 74.8% |
| เทพ | greedy | 0.0% | 0.3% | 1.8% | 12.7% | 0.7% | 0.8% | 0.3% | 39.7% | 43.8% |
| เทพ | random | 0.2% | 1.0% | 2.8% | 16.6% | 1.5% | 1.3% | 0.6% | 41.5% | 34.7% |
| ธาร | greedy-egg | 6.3% | 33.0% | 25.2% | 26.9% | 1.2% | 0.9% | 0.7% | 5.8% | 0.1% |
| ธาร | greedy | 1.1% | 21.7% | 14.8% | 40.8% | 1.5% | 1.3% | 1.7% | 17.2% | 0.1% |
| ธาร | random | 8.3% | 33.5% | 18.3% | 28.7% | 0.9% | 0.8% | 0.4% | 9.1% | 0.1% |
| นภา | greedy-egg | 0.3% | 45.9% | 32.2% | 13.6% | 0.7% | 0.3% | 0.3% | 6.7% | 0.2% |
| นภา | greedy | 0.0% | 32.8% | 25.1% | 22.8% | 1.0% | 0.9% | 0.3% | 16.8% | 0.3% |
| นภา | random | 1.1% | 44.5% | 22.1% | 19.1% | 1.1% | 1.0% | 0.6% | 10.6% | 0.0% |
| ธรา | greedy-egg | 0.0% | 0.8% | 8.2% | 22.7% | 2.4% | 2.3% | 1.6% | 45.9% | 16.2% |
| ธรา | greedy | 0.0% | 5.5% | 8.7% | 21.2% | 1.8% | 1.5% | 0.6% | 54.0% | 6.8% |
| ธรา | random | 0.0% | 11.2% | 12.8% | 24.2% | 2.8% | 1.6% | 1.3% | 43.8% | 2.4% |

Per room (all Stage-4, by policy): `summary/by_room_policy_stage4.csv`; per form: `by_room_form_policy.csv`.

## 7. Swipes and estimated time (Stage 4; winners only for the 10–15 min target)

| egg | policy | swipes/run median [min–max] | swipes median (wins) | est. min wins (lo–hi s/swipe) | % wins inside 10–15 min* |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 27 [16–129] | – | – | – |
| เพลิง | greedy | 52 [17–291] | – | – | – |
| เพลิง | random | 44 [16–316] | 218 | 5.8–9.4 | 0.0% |
| พฤกษ์ | greedy-egg | 504 [35–1460] | 470 | 12.3–20.1 | 100.0% |
| พฤกษ์ | greedy | 225 [16–719] | 371 | 9.6–15.8 | 100.0% |
| พฤกษ์ | random | 189 [16–590] | 375 | 9.7–16.0 | 100.0% |
| เทพ | greedy-egg | 107 [28–214] | 108 | 3.0–4.8 | 0.0% |
| เทพ | greedy | 123 [23–386] | 134 | 3.7–5.9 | 4.8% |
| เทพ | random | 120 [21–334] | 138 | 3.8–6.1 | 4.1% |
| ธาร | greedy-egg | 193 [25–843] | 665 | 17.0–28.0 | 0.0% |
| ธาร | greedy | 152 [18–1023] | 511 | 13.1–21.6 | 100.0% |
| ธาร | random | 108 [21–741] | 258 | 7.0–11.3 | 100.0% |
| นภา | greedy-egg | 26 [16–227] | 160 | 4.4–7.1 | 0.0% |
| นภา | greedy | 41 [17–430] | 349 | 8.9–14.7 | 75.0% |
| นภา | random | 36 [16–408] | – | – | – |
| ธรา | greedy-egg | 124 [21–331] | 177 | 4.8–7.7 | 13.4% |
| ธรา | greedy | 147 [18–514] | 219 | 5.8–9.5 | 42.0% |
| ธรา | random | 129 [19–642] | 228 | 6.2–10.0 | 51.7% |

*window overlaps the 10–15 min target for either seconds-per-swipe assumption.

## 8. Board jams (Stage 4)

| egg | policy | runs with ≥1 jam | jams/run | jams per swipe | HP lost to jams / run | jam share of all HP loss |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 0.0% | 0.00 | 0.0% | 0.0 | 0.0% |
| เพลิง | greedy | 7.9% | 0.14 | 0.2% | 3.5 | 1.2% |
| เพลิง | random | 9.5% | 0.19 | 0.3% | 4.8 | 1.8% |
| พฤกษ์ | greedy-egg | 91.9% | 7.39 | 1.5% | 182.7 | 13.7% |
| พฤกษ์ | greedy | 61.2% | 1.98 | 0.9% | 48.3 | 5.8% |
| พฤกษ์ | random | 68.3% | 2.32 | 1.2% | 56.8 | 7.6% |
| เทพ | greedy-egg | 37.4% | 0.46 | 0.4% | 12.9 | 3.7% |
| เทพ | greedy | 44.9% | 0.81 | 0.6% | 22.9 | 4.9% |
| เทพ | random | 54.0% | 1.04 | 0.8% | 29.2 | 6.1% |
| ธาร | greedy-egg | 59.0% | 1.95 | 0.8% | 52.5 | 11.5% |
| ธาร | greedy | 42.4% | 1.05 | 0.6% | 28.2 | 5.2% |
| ธาร | random | 43.6% | 1.05 | 0.8% | 28.5 | 6.4% |
| นภา | greedy-egg | 2.5% | 0.03 | 0.1% | 0.6 | 0.4% |
| นภา | greedy | 9.6% | 0.21 | 0.3% | 5.6 | 1.9% |
| นภา | random | 12.5% | 0.29 | 0.5% | 7.6 | 2.9% |
| ธรา | greedy-egg | 43.4% | 0.68 | 0.5% | 17.0 | 6.0% |
| ธรา | greedy | 48.4% | 1.07 | 0.7% | 27.5 | 5.8% |
| ธรา | random | 52.2% | 1.20 | 0.9% | 31.3 | 7.0% |

## 9. Auto vs ordinary runes (Stage 4; per run means)

| egg | policy | casts/run [min–med–max] | casts/100 swipes | skill dmg share | skill armor share | skill heal share |
|---|---|---|---|---|---|---|
| เพลิง | greedy-egg | 6.2 [3–5–26] | 18.6 | 23.0% | 61.4% | 0.0% |
| เพลิง | greedy | 12.8 [3–10–59] | 19.4 | 28.9% | 34.5% | 0.0% |
| เพลิง | random | 11.7 [3–8–65] | 19.4 | 30.7% | 39.7% | 0.0% |
| พฤกษ์ | greedy-egg | 82.9 [5–84–257] | 16.7 | 13.5% | 14.2% | 23.5% |
| พฤกษ์ | greedy | 37.5 [2–37–127] | 16.6 | 5.6% | 19.5% | 25.2% |
| พฤกษ์ | random | 32.7 [2–31–99] | 16.6 | 5.5% | 20.2% | 27.9% |
| เทพ | greedy-egg | 21.7 [5–21–45] | 19.9 | 12.0% | 13.6% | 0.5% |
| เทพ | greedy | 25.6 [4–25–81] | 20.1 | 16.2% | 20.5% | 0.8% |
| เทพ | random | 24.9 [4–24–68] | 20.0 | 17.2% | 22.9% | 0.9% |
| ธาร | greedy-egg | 47.3 [5–38–180] | 19.9 | 26.7% | 11.7% | 28.1% |
| ธาร | greedy | 32.6 [3–30–212] | 19.9 | 12.0% | 15.5% | 4.2% |
| ธาร | random | 25.7 [4–21–148] | 19.8 | 11.8% | 17.0% | 3.7% |
| นภา | greedy-egg | 8.8 [3–6–58] | 22.3 | 31.4% | 77.2% | 0.0% |
| นภา | greedy | 14.6 [3–8–98] | 21.1 | 35.8% | 44.5% | 0.0% |
| นภา | random | 12.7 [3–7–88] | 20.8 | 37.8% | 48.2% | 0.0% |
| ธรา | greedy-egg | 24.7 [4–24–71] | 20.0 | 5.8% | 20.5% | 33.7% |
| ธรา | greedy | 30.3 [3–29–102] | 20.0 | 8.8% | 27.6% | 19.5% |
| ธรา | random | 27.2 [3–25–136] | 20.0 | 9.7% | 29.3% | 21.9% |

## 10. Stag boss (Stage 4)

| egg | policy | reached | win | reached | stag HP left at loss (median, min–max) | roots applied / hits / released per stag run |
|---|---|---|---|---|---|
| เพลิง | greedy-egg | 1.1% | 0.0% | 91.5% (59.1%–99.0%) | 5.4 / 8.0 / 4.2 |
| เพลิง | greedy | 13.9% | 0.0% | 88.9% (23.0%–100.0%) | 15.0 / 20.7 / 14.5 |
| เพลิง | random | 9.5% | 0.9% | 92.5% (48.8%–100.0%) | 14.1 / 19.0 / 13.6 |
| พฤกษ์ | greedy-egg | 24.0% | 0.7% | 92.9% (2.3%–100.0%) | 30.5 / 38.3 / 30.2 |
| พฤกษ์ | greedy | 36.3% | 0.9% | 93.2% (1.8%–100.0%) | 23.5 / 32.1 / 23.0 |
| พฤกษ์ | random | 22.3% | 0.4% | 94.7% (44.8%–100.0%) | 17.7 / 22.3 / 17.4 |
| เทพ | greedy-egg | 97.9% | 76.3% | 61.9% (0.2%–99.0%) | 26.8 / 37.0 / 25.8 |
| เทพ | greedy | 83.5% | 52.5% | 73.3% (0.1%–100.0%) | 31.4 / 42.9 / 30.7 |
| เทพ | random | 76.2% | 45.5% | 74.4% (0.3%–100.0%) | 30.3 / 40.9 / 29.7 |
| ธาร | greedy-egg | 5.9% | 1.4% | 92.5% (38.0%–100.0%) | 17.5 / 23.2 / 17.1 |
| ธาร | greedy | 17.3% | 0.5% | 90.5% (4.1%–100.0%) | 22.6 / 30.6 / 22.1 |
| ธาร | random | 9.2% | 0.9% | 91.3% (43.9%–100.0%) | 18.5 / 24.4 / 18.1 |
| นภา | greedy-egg | 6.8% | 2.4% | 88.5% (3.8%–100.0%) | 12.7 / 16.8 / 12.3 |
| นภา | greedy | 17.1% | 2.0% | 88.0% (7.4%–100.0%) | 22.7 / 29.7 / 22.1 |
| นภา | random | 10.6% | 0.0% | 88.7% (1.1%–100.0%) | 19.2 / 24.3 / 18.8 |
| ธรา | greedy-egg | 62.1% | 26.0% | 70.6% (1.9%–100.0%) | 29.7 / 39.4 / 29.1 |
| ธรา | greedy | 60.8% | 11.1% | 78.9% (0.5%–100.0%) | 31.0 / 41.9 / 30.5 |
| ธรา | random | 46.2% | 5.2% | 85.8% (0.7%–100.0%) | 25.2 / 33.4 / 24.9 |

## 11. Relics

Fair estimate: among runs that cleared room 4, win rate with vs without the relic picked at the room-2/4 rewards (random offers, random pick). Pooled over all Stage-4 forms.

| relic | policy | n with | win with | n without | win without | Δ |
|---|---|---|---|---|---|---|
| echo | random | 786 | 18.6% (16.0%–21.4%) | 1545 | 19.5% (17.6%–21.6%) | -1.0 pp |
| shadow | random | 794 | 15.9% (13.5%–18.6%) | 1537 | 20.9% (19.0%–23.1%) | -5.1 pp |
| spark | random | 766 | 18.5% (15.9%–21.4%) | 1565 | 19.6% (17.7%–21.6%) | -1.0 pp |
| seed | random | 725 | 19.0% (16.3%–22.1%) | 1606 | 19.3% (17.4%–21.3%) | -0.3 pp |
| thorn | random | 815 | 17.4% (15.0%–20.2%) | 1516 | 20.2% (18.2%–22.3%) | -2.8 pp |
| root | random | 776 | 26.0% (23.1%–29.2%) | 1555 | 15.8% (14.1%–17.7%) | +10.2 pp |
| echo | greedy | 1036 | 20.8% (18.5%–23.4%) | 1939 | 20.6% (18.9%–22.5%) | +0.2 pp |
| shadow | greedy | 1031 | 16.9% (14.7%–19.3%) | 1944 | 22.7% (20.9%–24.7%) | -5.9 pp |
| spark | greedy | 983 | 19.3% (17.0%–21.9%) | 1992 | 21.4% (19.6%–23.2%) | -2.1 pp |
| seed | greedy | 966 | 19.5% (17.1%–22.1%) | 2009 | 21.3% (19.6%–23.1%) | -1.8 pp |
| thorn | greedy | 954 | 22.6% (20.1%–25.4%) | 2021 | 19.8% (18.1%–21.6%) | +2.8 pp |
| root | greedy | 980 | 25.3% (22.7%–28.1%) | 1995 | 18.4% (16.8%–20.2%) | +6.9 pp |
| echo | greedy-egg | 862 | 42.0% (38.7%–45.3%) | 1694 | 43.3% (41.0%–45.7%) | -1.3 pp |
| shadow | greedy-egg | 800 | 38.9% (35.6%–42.3%) | 1756 | 44.7% (42.4%–47.0%) | -5.8 pp |
| spark | greedy-egg | 805 | 43.1% (39.7%–46.6%) | 1751 | 42.8% (40.5%–45.1%) | +0.3 pp |
| seed | greedy-egg | 852 | 40.1% (36.9%–43.5%) | 1704 | 44.2% (41.9%–46.6%) | -4.1 pp |
| thorn | greedy-egg | 962 | 40.5% (37.5%–43.7%) | 1594 | 44.3% (41.9%–46.7%) | -3.8 pp |
| root | greedy-egg | 831 | 52.9% (49.5%–56.3%) | 1725 | 38.0% (35.8%–40.3%) | +14.9 pp |
| echo | ALL | 2684 | 27.0% (25.3%–28.7%) | 5178 | 27.7% (26.5%–29.0%) | -0.8 pp |
| shadow | ALL | 2625 | 23.3% (21.7%–24.9%) | 5237 | 29.6% (28.4%–30.8%) | -6.3 pp |
| spark | ALL | 2554 | 26.6% (24.9%–28.3%) | 5308 | 27.9% (26.7%–29.1%) | -1.3 pp |
| seed | ALL | 2543 | 26.3% (24.6%–28.0%) | 5319 | 28.1% (26.9%–29.3%) | -1.8 pp |
| thorn | ALL | 2731 | 27.4% (25.7%–29.1%) | 5131 | 27.5% (26.3%–28.8%) | -0.1 pp |
| root | ALL | 2587 | 34.4% (32.6%–36.3%) | 5275 | 24.1% (22.9%–25.2%) | +10.3 pp |

Per egg: `relic_effect_early.csv`. Naive final-ownership table (biased): `relic_ownership_naive.csv`. Offers/picks: `relic_offers_picks.csv`.

## Files

See `README.md` (data dictionary) in the parent folder. Summary CSVs live in `summary/`.
