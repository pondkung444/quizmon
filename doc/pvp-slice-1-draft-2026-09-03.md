# ประลอง (PvP) สไลซ์ 1 — Draft + Execute log

> 3 ก.ย. 2026 · branch `claude/pvp-slice-1-handoff-7b7212`
>
> **สถานะ: Execute เสร็จ — รอ Pond เทสจริง 2 บัญชี**
> - ✅ migration `20260903170000_pvp_slice_1_schema` + `20260903170100_pvp_slice_1_rpcs` apply แล้วบน `wmndxiuqzrnqbhrznmfg`
> - ✅ `_draw_pvp_hand` verify แล้วผ่าน SQL (lane bias / dedup / idempotent) + ลบ test row ทิ้งแล้ว
> - ✅ โค้ดฝั่งแอปครบ · `tsc --noEmit` ผ่าน · eslint ผ่าน
> - ⏳ เกตเบราว์เซอร์จริง (เล่นจบ 1 แมตช์ 2 บัญชี + resume + timeout) → **Pond รัน** (ต้องใช้รหัสผ่าน pond/ซันซัน/daou) — สคริปต์เทสอยู่ §8

---

## 1. ภาพรวมลูปสไลซ์ 1 (ยึดจังหวะที่ปอนด์อธิบายใหม่)

```
pond กด "ท้า" → เลือกเพื่อน (grade_band เดียวกัน) + เลือก Qmon stage 4 → ส่งคำท้า
   ↓ (push สไลซ์ 5 — สไลซ์ 1 เห็นในหน้า /pvp เท่านั้น)
เพื่อนเปิด /pvp → เห็นคำท้า → กด "รับ" → เลือก Qmon ฝั่งตัวเอง → เข้าแมตช์ทันที
   ↓
ตัดสิน SPD (snapshot) ใครเป็น "ผู้ส่งการ์ด" คนแรก — สูงกว่าได้ส่งก่อน, เท่ากัน = ผู้ท้าได้ส่งก่อน
   ↓
วนจนจบ:
   [ผู้ส่ง A]  เห็นมือการ์ด 5 ใบ (เอียงตาม lane ของ Qmon A) → เลือก 1 ใบส่งให้ B
   [ผู้ตอบ B]  เห็นโจทย์ของการ์ดนั้น (ผูก question_id ไว้ตั้งแต่จั่ว) → ตอบ
              • ตอบถูก → ไม่มีอะไรเกิดขึ้น (สไลซ์ 1 การ์ดเปล่า ไม่มี effect)
              • ตอบผิด / หมดเวลา → B เสียเลือด = ดาเมจจาก ATK ของ A (ลดด้วย DEF ของ B, มีโอกาสคริจาก FOC ของ A)
   สลับ: B กลายเป็นผู้ส่ง, A กลายเป็นผู้ตอบ → current_round + 1
   จบเมื่อ: เลือดฝั่งใดฝั่งหนึ่ง ≤ 0  หรือ  current_round > 30 (เพดาน)
   ↓
เพดาน 30 → ตัดสินด้วยเลือดคงเหลือ (มากกว่าชนะ, เท่ากัน = เสมอ)
   ↓
หน้าจบแมตช์ (โทนบวก — แพ้ไม่พูดคำว่าแพ้, ชนะไม่ gloat) + บันทึกผล
```

**Timeout**
- คำท้าค้าง 24 ชม. ไม่มีใครรับ → `expired`
- แมตช์ไม่มี action 3 วัน → `abandoned` ไม่มีผู้ชนะ ไม่กระทบสถิติ
- ทั้งคู่เช็คแบบ lazy: ทุกครั้งที่โหลดหน้า `/pvp` เรียก `pvp_gc()` ก่อน (ไม่ต้องรอ cron — ทดสอบง่ายด้วยการแก้ timestamp ตรงใน DB)

**ตัวจับเวลา 60 วิ/ตา** = **client-side เท่านั้นในสไลซ์ 1**
เหตุผล: เกตสไลซ์ 1 บังคับ "ปิดแอปกลางตาแล้ว resume ได้จริง" — ถ้า server บังคับ 60 วิ = ตอบผิด จะขัดกับ resume โดยตรง
สไลซ์ 1: client นับถอยหลัง, หมดเวลา → auto-submit `answer_index = -1` (นับเป็นตอบผิด) แต่ถ้าปิดแอปไปเลย server ยังรับคำตอบได้ภายใน 3 วัน
`timer_seconds` = display จาก `60 + round(spd_ผู้ตอบ / 20)` (TEMP — ยังไม่จูน)

---

## 2. Interface ที่ประกาศตั้งแต่สไลซ์ 1

### `src/lib/pvp/stats.ts` (ไฟล์ใหม่ — ไม่แตะ `exp.ts` / `evolution.ts` / `raid/stats.ts`)

```ts
export type PvpStatKey = "hp" | "atk" | "def" | "spd" | "foc";
export type PvpPetStats = Record<PvpStatKey, number>;

// สไลซ์ 1: raw + 0. สไลซ์ 4: + โบนัสอุปกรณ์ PvP ที่ผูกกับแมตช์ — เติม "ที่จุดเดียวนี้"
export function pvpEffectiveStat(stats: PvpPetStats, stat: PvpStatKey): number {
  return stats[stat] ?? 0;
}

export type PvpCard = {
  id: string;
  chapter: string;            // questions.chapter
  subject: string;            // questions.subject
  difficulty: number;         // questions.difficulty
  effect_id: string | null;   // สไลซ์ 1 = null เสมอ
  question_id: number;         // ผูกตั้งแต่จั่ว (ปอนด์เคาะ) — ไม่ null ในสไลซ์นี้
};
```

**กฎเหล็ก:** ทุกจุดในโค้ด PvP ที่อ่านสเตตัส (ตัดสิน SPD, ดาเมจ, timer) ต้องผ่าน `pvpEffectiveStat()` เท่านั้น ห้าม `stats.atk` / `pet.stat_atk` ตรงๆ
**ฝั่ง SQL:** สไลซ์ 1 อ่านจาก **snapshot** (`pvp_matches.stat_a/stat_b` — เก็บตอนสร้างแมตช์) ไม่อ่าน `pets.stat_*` สด → สไลซ์ 4 แก้สูตร snapshot + `pvpEffectiveStat()` คู่กันจุดเดียว

### เลข TEMP (ใส่ comment `// TEMP: ยังไม่จูน รอข้อมูลจริงแบบ raid FOC/SPD` ทุกจุด)

```
damage_per_card = round(10 * atk_A / 100)                     -- atk ผู้ส่ง
crit_chance     = foc_A            (% ตรงๆ ไม่หาร 2)           -- foc ผู้ส่ง
crit_multiplier = 1.5
damage_taken    = round(damage_per_card * (1 - def_B / 200))  -- def ผู้ตอบ, หาร 200 กัน DEF เต็มบล็อค 100%
                  ต่ำสุด 1 เสมอ (การ์ดต้องเจ็บ)
timer_seconds   = 60 + round(spd_B / 20)                      -- spd ผู้ตอบ (display เท่านั้น)
```

---

## 3. Schema (migration `pvp_slice_1_schema`)

### 3.1 `pvp_challenges`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid pk | |
| challenger_id | uuid → auth.users | ผู้ท้า |
| opponent_id | uuid → auth.users | ผู้ถูกท้า |
| challenger_pet_id | uuid → pets | Qmon ผู้ท้าเลือกตอนส่ง |
| status | text | `pending` / `accepted` / `declined` / `expired` / `cancelled` |
| created_at | timestamptz | |
| expires_at | timestamptz | default `now() + 24h` |
| responded_at | timestamptz | |
- `check (challenger_id <> opponent_id)`
- unique partial index `(challenger_id, opponent_id) where status='pending'` — กันส่งซ้ำคู่เดิม
- เพดานคำท้าค้าง **5 ใบ/คน** เช็คใน RPC (`count(status='pending') < 5`)

### 3.2 `pvp_matches`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid pk | |
| challenge_id | uuid → pvp_challenges | |
| player_a_id / player_b_id | uuid → auth.users | A = ผู้ท้า, B = ผู้รับ |
| pet_a_id / pet_b_id | uuid → pets | |
| stat_a / stat_b | jsonb | `{hp,atk,def,spd,foc}` snapshot (สไลซ์ 1 = raw, null→0) |
| hp_a / hp_b | integer | เริ่ม = stat hp |
| current_round | integer | เริ่ม 1 |
| attacker_id | uuid → auth.users | ใครเป็น "ผู้ส่งการ์ด" ตอนนี้ |
| phase | text | `assigning` (ผู้ส่งกำลังเลือกการ์ด) / `answering` (ผู้ตอบกำลังตอบ) |
| active_card_id | uuid → pvp_match_cards | การ์ดที่ถูกส่งอยู่ (null ตอน phase=assigning) |
| status | text | `active` / `finished` / `abandoned` |
| outcome | text null | `a_win` / `b_win` / `draw` |
| winner_id | uuid null | null เมื่อ draw/abandoned |
| created_at / last_action_at | timestamptz | |
| timeout_at | timestamptz | default `now() + 3 days`, เลื่อนทุก action |

### 3.3 `pvp_match_cards`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | uuid pk | |
| match_id | uuid → pvp_matches (on delete cascade) | |
| hand_no | integer | ครั้งที่จั่ว (มือที่เท่าไหร่) ของผู้เล่นคนนั้น |
| drawn_for_user_id | uuid → auth.users | เจ้าของมือ |
| chapter / subject | text | |
| difficulty | smallint | |
| effect_id | text null | **null เสมอในสไลซ์ 1** |
| question_id | bigint → questions | ผูกตั้งแต่จั่ว |
| played_at | timestamptz null | เซ็ตตอนถูกเลือกส่ง |
| created_at | timestamptz | |

### 3.4 `quiz_attempts` — เพิ่มคอลัมน์ + ขยาย CHECK
```sql
alter table public.quiz_attempts add column pvp_match_id uuid references public.pvp_matches(id);
create index quiz_attempts_pvp_match_idx on public.quiz_attempts (pvp_match_id) where pvp_match_id is not null;
-- CHECK เดิม: source in ('dungeon_bonus','raid_obstacle','raid_boss','topic_select')
-- ต้อง drop + recreate เพิ่ม 'pvp'
```

### 3.5 `pvp_allowlist` (gate กันเดา URL — pattern เดียวกับ `raid_allowlist`)
`user_id uuid pk → auth.users` · seed 2 แถว: `792b8e1d…` (pond), `abbc806f…` (daou), `b497d6dd…` (dawu)
เช็คทั้งใน RPC (security definer) และใน server action / page

### 3.6 RLS (ทุกตาราง `enable row level security`, เขียนผ่าน RPC เท่านั้น — ไม่มี write policy)
- helper `is_pvp_match_member(match_id) → boolean` = `auth.uid() in (player_a_id, player_b_id)` (security definer)
- `pvp_challenges` SELECT: `challenger_id = auth.uid() or opponent_id = auth.uid()`
- `pvp_matches` SELECT: `is_pvp_match_member(id)`
- `pvp_match_cards` SELECT: `is_pvp_match_member(match_id) AND (drawn_for_user_id = auth.uid() OR played_at is not null)`
  → เห็นเฉพาะมือตัวเอง + การ์ดที่ลงสนามแล้ว (กันแอบดู question_id ของมืออีกฝ่ายล่วงหน้า)
- `pvp_allowlist` SELECT: `user_id = auth.uid()`

### 3.7 Realtime
```sql
alter publication supabase_realtime add table public.pvp_matches;
alter publication supabase_realtime add table public.pvp_match_cards;
alter table public.pvp_matches replica identity full;
```
client subscribe channel `pvp:<matchId>` (mirror `useBossRaidLobby` — `realtime.setAuth` ก่อน bind, resync ทุกครั้งที่ SUBSCRIBED)

---

## 4. RPC (security definer, `set search_path=public`, grant execute to authenticated)

| RPC | ทำอะไร |
|---|---|
| `create_pvp_challenge(p_opponent_id uuid, p_pet_id uuid)` | allowlist; ไม่ใช่ตัวเอง; เป็นเพื่อน (query `friendships` แบบ low/high); `grade_band` ทั้งคู่ไม่ null และเท่ากัน; pet เป็นของ caller + `stage=4` (ไม่กรอง is_active); คำท้าค้าง caller < 5; ไม่มี pending คู่เดิม → insert `pending`, `expires_at=now()+24h` |
| `accept_pvp_challenge(p_challenge_id uuid, p_pet_id uuid)` | caller = opponent; challenge ยัง `pending` + ไม่หมดอายุ; pet ของ caller + `stage=4`; snapshot stat ทั้งสองฝั่ง (raw, null→0); สร้าง `pvp_matches` (hp = snapshot hp); `attacker_id` = SPD สูงกว่า (เท่ากัน = challenger); `phase='assigning'`; จั่วมือแรกให้ attacker (5 ใบ); challenge → `accepted` → คืน `match_id` |
| `decline_pvp_challenge(p_challenge_id uuid)` | caller = opponent; `pending` → `declined` (ผู้ท้าเห็นสถานะในหน้า /pvp) |
| `cancel_pvp_challenge(p_challenge_id uuid)` | caller = challenger; `pending` → `cancelled` |
| `draw_pvp_cards(p_match_id uuid)` | caller = `attacker_id`, `phase='assigning'`; ถ้ามือปัจจุบันยังมีการ์ดไม่ถูกเล่น → คืนมือเดิม (idempotent, resume-safe); ไม่งั้นจั่ว 5 ใบใหม่: pool = `questions` `status='active'` + `grade_band` ของ attacker, กัน `question_id` ที่เคยอยู่ใน match นี้, **เอียง lane**: ~70% ใบจากบทที่ตรง lane (`math`/`science` = subject; `physics|chemistry|biology` = branch; `balanced` = ไม่เอียง) + ~30% จาก pool เต็ม *(TEMP ratio)* — ผูก `question_id` ทุกใบ |
| `assign_pvp_card(p_match_id uuid, p_card_id uuid)` | caller = `attacker_id`, `phase='assigning'`; card อยู่ในมือปัจจุบันของ caller + ยังไม่ played → set `active_card_id`, `played_at=now()`, `phase='answering'`, เลื่อน `timeout_at` |
| `submit_pvp_card(p_match_id uuid, p_card_id uuid, p_question_id bigint, p_answer_index int)` | caller = ผู้ตอบ (= อีกคนที่ไม่ใช่ attacker), `phase='answering'`, `p_card_id = active_card_id`, `p_question_id` ตรงกับที่ผูกไว้; อ่าน `correct_index` (admin), `is_correct = (p_answer_index = correct_index)` (`-1` = หมดเวลา = ผิด); insert `quiz_attempts (source='pvp', pvp_match_id, question_id, pet_id = pet ของผู้ตอบ, is_correct)`; **ถ้าผิด**: `dmg = max(1, round( round(10*atk_A/100) * (1 - def_B/200) ))`, คริ (rand < foc_A%) → `*1.5`; หัก hp ผู้ตอบ; เช็คจบ (`hp<=0` → อีกฝั่งชนะ; ไม่งั้นสลับ attacker/ผู้ตอบ, `phase='assigning'`, `active_card_id=null`, `current_round+1`, ถ้า `current_round > 30` → จบตัดสินด้วย hp); เลื่อน `timeout_at`; คืน state ใหม่ทั้งชุด |
| `pvp_gc()` | `pvp_challenges` `pending` + `expires_at < now()` → `expired`; `pvp_matches` `active` + `timeout_at < now()` → `abandoned`. เรียก lazy จาก `getPvpOverview()` |

> **หมายเหตุ deviation จาก handoff:** handoff เขียน `submit_pvp_card(match_id, card_id, question_id, answer_index)` ใบเดียว แต่จังหวะที่ปอนด์อธิบายใหม่ (A เลือกให้ B, B ตอบ) = 2 คน 2 action → แยกเป็น `assign_pvp_card` (A เลือก) + `submit_pvp_card` (B ตอบ) ชื่อ/หน้าที่ของ `submit_pvp_card` ตรงตาม handoff เดิม (บันทึก quiz_attempts + ดาเมจ + สลับตา + เช็คจบ)

---

## 5. โค้ดฝั่งแอป (ที่สร้างจริง)

```
src/lib/pvp/stats.ts          pvpEffectiveStat() + type PvpCard / PvpStatKey / PvpPetStats + parsePvpStats()
src/lib/pvp/combat.ts          เลข TEMP: pvpTimerSeconds / pvpEstimatedDamage / pvpCritChancePct — mirror สูตร SQL
src/lib/pvp/usePvpMatch.ts     realtime hook `pvp:<matchId>` (mirror useBossRaidLobby) -> onChange = router.refresh()
src/lib/pvp.ts                 server helpers (pattern เดียวกับ src/lib/raid.ts):
   requirePvpAccess()          auth + pvp_allowlist (admin client) -> redirect /login|/pet
   getPvpEligiblePets()        pets stage=4 ของ caller (ไม่กรอง is_active) + สเตตัส/รูป
   getChallengeableFriends()   เพื่อน (friendships low/high) ที่ grade_band = ของเรา
   getPvpChallengeForAccept()  รายละเอียดคำท้าสำหรับหน้ารับ (ชื่อผู้ท้า + ชื่อ Qmon ผู้ท้า)
   getPvpOverview()            เรียก pvp_gc() ก่อน -> yourTurn / waiting / incoming / outgoing / finished
   getPvpMatchView()           state เต็มสำหรับ resume: hp/สเตตัส 2 ฝั่ง + มือของเรา (ตอนเป็นผู้ส่ง) +
                               active card + โจทย์ (ตัด correct_index ผ่าน admin) + ตาใคร + timerSeconds
src/app/pvp/actions.ts         "use server" wrapper RPC: createPvpChallenge / acceptPvpChallenge /
                               declinePvpChallenge / cancelPvpChallenge / drawPvpCards / assignPvpCard / submitPvpCard
src/app/pvp/page.tsx + PvpOverviewClient.tsx        หน้าหลัก (ถึงตาคุณ ขึ้นก่อน)
src/app/pvp/new/page.tsx + NewChallengeClient.tsx   เลือกเพื่อน + Qmon -> ส่งคำท้า
src/app/pvp/challenge/[id]/page.tsx + AcceptChallengeClient.tsx   ผู้รับเลือก Qmon -> กดรับ -> /pvp/[matchId]
src/app/pvp/[matchId]/page.tsx + DuelClient.tsx     จอดวล (assign / answer / จบแมตช์ โทนบวก)
src/app/pvp/PvpPetCard.tsx                          การ์ดเลือก Qmon (ใช้ร่วม new + challenge)
```
- ไม่แตะ `BottomNav.tsx` — เข้าผ่าน URL อย่างเดียว (`/pvp`)
- `page.tsx` ของ `[matchId]` key `<DuelClient>` ด้วย `matchId:status:phase:current_round` -> remount ทุกตา (timer/การ์ดที่เลือก ไม่ค้าง)
- ตัวจับเวลา 60 วิ = client-side; หมดเวลา -> auto `submitPvpCard(..., -1)` = ตอบผิด · ปิดแอปไปเลยก็ยังตอบได้ใน 3 วัน (server ไม่บังคับ 60 วิ)
- EXP: `submit_pvp_card` insert `quiz_attempts(source='pvp')` เท่านั้น — **ไม่แตะ EXP ของ pet** (มติ §7.1)

---

## 6. มติที่ปอนด์เคาะแล้ว (3 ก.ย. 2026)

1. **EXP สไลซ์ 1 = A** — `submit_pvp_card` แค่ `insert quiz_attempts (source='pvp', pvp_match_id)` ไม่แตะ EXP ของ pet เลย · EXP จริงต่อในสไลซ์ถัดไป
2. **`current_round` = A** — นับ +1 ต่อการ์ด 1 ใบที่ลงสนาม (เพดาน 30 ≈ 15 การ์ด/คน)
3. **คู่ทดสอบ happy path = pond + ซันซัน** (`a966f038…`, `sunsun.mixer@gmail.com`, junior ม.3, เพื่อนกับ pond แล้ว, มี stage-4 pet 2 ตัว) · เคสบล็อก = pond (junior) + daou (senior)
   - `pvp_allowlist` seed: pond `792b8e1d…`, ซันซัน `a966f038…`, daou `abbc806f…`

---

## 7. สคริปต์เทสสำหรับ Pond (เบราว์เซอร์จริง — ต้องใช้ 2 บัญชี)

> รันบน dev server ที่มี `.env.local` ชี้ `wmndxiuqzrnqbhrznmfg` · โค้ดอยู่ branch `claude/pvp-slice-1-handoff-7b7212`
> ทุกหน้าอยู่ใต้ `/pvp` — ไม่มีปุ่มเมนู เข้า URL ตรง

**A. Happy path — pond ↔ ซันซัน (junior ทั้งคู่) เล่นจบ 1 แมตช์**
1. login `panuwat.pond@gmail.com` → เปิด `/pvp/new` → เลือก "ซันซัน" + เลือก Qmon stage 4 → "ส่งคำท้า" → เด้งกลับ `/pvp` เห็นการ์ด "รอตอบรับคำท้า"
2. login `sunsun.mixer@gmail.com` (อีก browser/หน้าต่างไม่เปิดพร้อมกันก็ได้) → `/pvp` เห็น "คำท้าใหม่" จาก PonDKunG → "รับคำท้า" → เลือก Qmon → เข้าจอดวลทันที
3. ผลัดกันเล่น: ฝ่ายที่ SPD สูงกว่าได้ "เลือกการ์ดโจทย์" ก่อน → อีกฝ่าย "ทำโจทย์" → ตอบผิดเสียเลือด / ตอบถูกไม่เป็นไร → สลับตา
4. เล่นจนเลือดฝั่งใดฝั่งหนึ่งหมด (หรือครบ 30 ยก) → หน้าจบแมตช์: ผู้ชนะเห็น "ดวลมันส์มาก! ชนะไปแล้ว", ผู้แพ้เห็น "สู้ดีมาก! … สู้จนนาทีสุดท้าย" (ไม่มีคำว่าแพ้)
   - เช็ค `select outcome, winner_id, hp_a, hp_b from pvp_matches` ว่าตรงกับที่เห็นบนจอ

**B. Resume กลางตา** (ระหว่าง A) — ปิดแท็บตอนเป็นตาเรา (ทั้งจังหวะ "เลือกการ์ด" และจังหวะ "ทำโจทย์") → เปิด `/pvp` → กดเข้าแมตช์เดิม → เล่นต่อจากจุดเดิมได้ (การ์ด/โจทย์เดิม ไม่รีเซ็ต)

**C. บล็อกข้ามชั้น** — login pond → `/pvp/new` → daou (`daou@mail.com`, senior) **ไม่ควรอยู่ในรายชื่อเพื่อนที่เลือกได้**
   ถ้าอยากยืนยันระดับ RPC: `select create_pvp_challenge('abbc806f-8da6-49b8-a655-3aeb9dcae6e8','<pond stage4 pet id>')` ตอน auth เป็น pond → error "ประลองได้เฉพาะเพื่อนที่อยู่ระดับชั้นเดียวกัน"

**D. Timeout คำท้า 24 ชม.** — pond ส่งคำท้าหา ซันซัน (ปล่อยค้าง) → ใน DB: `update pvp_challenges set expires_at = now() - interval '1 hour' where id='<id>'` → reload `/pvp` (pvp_gc รันตอนโหลด) → คำท้ากลายเป็น "ปฏิเสธ/หมดอายุ" (`status='expired'`)

**E. Timeout แมตช์ 3 วัน** — ระหว่างแมตช์ B: `update pvp_matches set timeout_at = now() - interval '1 hour' where id='<id>'` → ทั้งสองฝ่าย reload `/pvp` → แมตช์ย้ายไป "จบแล้ว" ป้าย "ถูกทิ้ง (หมดเวลา)" · `status='abandoned'`, `winner_id is null`

**F. เพดานคำท้า 5** — pond ส่งคำท้าหาเพื่อน 5 คน (หรือ insert pending 5 แถวใน DB) → ส่งใบที่ 6 → error "มีคำท้าค้างครบ 5 รายการแล้ว"

**G. ล้างข้อมูลทดสอบก่อนเก็บ baseline**
```sql
delete from public.quiz_attempts where source = 'pvp';
delete from public.pvp_match_cards
  where match_id in (select id from public.pvp_matches);   -- (cascade อยู่แล้ว แต่ทำเผื่อ)
delete from public.pvp_matches;
delete from public.pvp_challenges;
-- เก็บ pvp_allowlist ไว้ (เกตของสไลซ์ถัดไป)
```

**เกตผ่านสไลซ์ 1:** A + B + C + D + E ผ่านครบ = ลูปเล่นจบได้ + resume จริง + guard + timeout ทั้งสองแบบ → ปิดสไลซ์ 1

---

## ภาคผนวก — Survey DB (re-verified 3 ก.ย. 2026, `wmndxiuqzrnqbhrznmfg`)

- migration ล่าสุด: `20260903160000_boss_raid_phase_2_combo_burst` · ยังไม่มี `pvp_*` / ฟังก์ชัน `%pvp%` ใดๆ
- `quiz_attempts`: id bigint, user_id, is_correct, created_at, question_id bigint, pet_id, mission_id, source, dungeon_run_id, raid_run_id — **ไม่มี pvp_match_id**
  - CHECK: `source in ('dungeon_bonus','raid_obstacle','raid_boss','topic_select')` ← ต้องเพิ่ม `'pvp'`
- `pets`: stat_hp/atk/def/spd/foc = integer (บาง stage-4 pet เก่ายังเป็น **null** → snapshot ต้อง coalesce 0), `subline` = lane (`math|science|balanced|physics|chemistry|biology`), stage-4 ทุกตัว `is_active=false`
- `profiles.grade_band` = `junior|senior` (มี null ด้วย) — guard ต้องเช็ค "ไม่ null และเท่ากัน"
- `friendships(user_id_low, user_id_high)` + helper `friend_ids(uuid)` มีอยู่แล้ว
- test accounts: pond `792b8e1d…` = **junior ม.3** · dawu `b497d6dd…` = **junior ม.3** · daou `abbc806f…` = **senior ม.6**
  - เพื่อนกันครบ 3 คู่ (pond-dawu, pond-daou, dawu-daou)
- realtime publication มี `boss_raid_*` แล้ว · pg_cron มี job เดียว (`adventure-return-push`)
- `raid_allowlist` + `requireRaidAccess()` = pattern ที่จะลอกมาทำ `pvp_allowlist` + `requirePvpAccess()`
