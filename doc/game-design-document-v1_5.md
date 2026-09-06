# เอกสารดีไซน์เกม + สถานะโปรเจกต์ QuizMon v1.5

> **เอกสารอ้างอิงหลักของโปรเจกต์ — แทนที่ `game-design-document-v1_0.md` ทั้งฉบับ**
> ทุกตัวเลข/สถานะยืนยันจาก production DB จริง (`wmndxiuqzrnqbhrznmfg`, query ตรงผ่าน Supabase MCP)
> + ซอร์ส RPC จริง (`pg_get_functiondef`) + เอกสารออกแบบ 24 ไฟล์ใน project knowledge ณ วันที่เขียน
>
> **ปิดฉบับแล้ว: 6 กันยายน 2026** — ตัวเลข/schema ทุกจุด verify จาก DB ตรงๆ ไม่ใช่คัดลอกจากความจำ/เอกสารเก่า
> ทุกอย่างที่บันทึกไว้ในเล่มนี้ (ยกเว้นหมวด "แผนในอนาคต" §7 และจุดที่ระบุชัดว่า "ยังไม่ยืนยัน") คือของที่
> **ทำงานจริงใน production แล้ว ณ 6 ก.ย. 2026**
>
> **Migration head ณ วันเขียน:** `20260905150038_exclude_pending_link_from_guest_cleanup` (224 migration ใน DB จริง)
>
> ⚠️ **ตัวเลขในเอกสารนี้จะ stale ทันทีที่มีเด็กเล่นเพิ่ม** — DB คือ source of truth เสมอ ใช้เอกสารนี้เพื่อ
> รู้ว่า "มีอะไรอยู่ ทำงานยังไง ตัดสินใจอะไรไปแล้ว" ไม่ใช่เพื่อรู้ "ตอนนี้ตัวเลขเท่าไหร่เป๊ะๆ"
>
> ⚠️ **หมวด "ยังไม่ยืนยัน" ในเอกสารนี้:** บางหัวข้อ (UI จอทีวี Boss Raid, ระบบเสียง, native app store,
> รูปภาพชั้น JSX ของ raid, English subject) ตรวจจาก DB โดยตรงไม่ได้ (ต้องดู repo/เบราว์เซอร์จริง ซึ่ง
> แชทนี้ไม่มีสิทธิ์เข้าถึง) — ปอนด์ขอ **"ค้างไว้ก่อน"** ในรอบตรวจนี้ ระบุไว้ชัดเจนว่าเป็นคำถามเปิด
> ไม่ใช่การยืนยันว่าเสร็จหรือไม่เสร็จ

---

## 0. สรุปสิ่งที่เปลี่ยนไปมากที่สุดตั้งแต่ v1.0 (15 ส.ค. → 6 ก.ย. 2026)

3 สัปดาห์นี้เกมโตจาก **126 → 242 บัญชี** และมีระบบใหญ่เพิ่มขึ้น **5 ระบบ** ที่ v1.0 ไม่เคยมีเลย:
**Classroom Boss Raid (§4.15), ประลอง/PvP (§4.16), Push Notification (§4.17), เลือกบทฝึกฝน +
คลังหลักสูตร (§4.18), Question Factory (§4.19)** — บวก **Guest Mode** (§4.20) ที่เพิ่งขึ้น production
วันเดียวกับที่เขียนเอกสารนี้ (5 ก.ย.)

**สิ่งที่ v1.0 บันทึกว่า "รอ implement" (v1.0.1) ตอนนี้ขึ้น production แล้วทั้งคู่:**
- จูนสูตร FOC/SPD (แบบ B, ×0.7 / ×2) — apply แล้ว **+ backfill pet stage 4 เดิมด้วย** (ผลตรงกับที่จำลองไว้)
- toast แจ้งเตือน gear auto-unequip — ไม่ได้ตรวจแยกในรอบนี้ (อยู่ในกลุ่ม "ยังไม่ยืนยัน")

**สิ่งที่แก้ไขจากความเข้าใจเดิม (สำคัญ — เคยบันทึกผิดไว้ใน memory):**
- **บั๊ก `crystal_damage` double-dip ของ Boss Raid แก้เข้า production แล้ว** ไม่ใช่ "รอ apply" ตามที่เคย
  บันทึกไว้ — migration `boss_raid_balance_fix_crystal_damage_boss_hp` (5 ก.ย.) อยู่ใน DB จริงแล้ว
- **`combo_burst` ของ Boss Raid trigger จริงแล้ว 2 ครั้ง** ไม่ใช่ "ยังไม่เคย trigger" ตามที่เคยบันทึกไว้ —
  ยืนยันจาก `boss_raid_event_log` ตรงๆ (พร้อม `enrage` 2 ครั้ง, `chosen_warrior` 3 ครั้ง, `meteor` 2 ครั้ง,
  `weak_point` 4 ครั้ง — event ทั้ง 5 ตัวของ Boss Raid Phase 2 ทำงานจริงหมดแล้ว)
- **ระบบรางวัลจบเกม (MVP/Top N + เลือกไข่) และหน้าสรุปผลท้ายเกมของ Boss Raid implement แล้ว**
  (`distribute_boss_raid_rewards()`, `get_boss_raid_summary()`) — ไม่ใช่ "ยังไม่เริ่ม (สไลซ์ 1.2/1.3)"
  ตามบริบทเดิมวันที่ 31 ส.ค. เห็นได้จากห้องจริงที่แจกไข่ epic ไปแล้ว 1 ใบผ่านระบบนี้

---

## 1. ภาพรวม

**QuizMon (Qmon)** — เว็บเกมเพื่อการเรียนรู้ภาษาไทย เด็กตอบโจทย์คณิต/วิทย์ แล้วสัตว์เลี้ยง
(Qmon) เติบโตตามความพยายาม **EXP มาจากการตอบคำถามเท่านั้น ไม่มีทางลัดอื่นเลย**

| ส่วน | รายละเอียด |
|---|---|
| ผู้ใช้ | นักเรียนจริง 242 บัญชี (junior 167 / senior 67 / ยังไม่ระบุ band 8) ครูดูแลคนเดียว |
| URL | `quizmon.xyz` (ย้ายจาก `quizmon-alpha.vercel.app` — ใช้ custom domain แล้ว) |
| Framework | Next.js 16.2.10 canary (App Router) · React 19 · Tailwind v4 · TypeScript |
| Backend | Supabase (Postgres 17) · region `ap-southeast-1` (สิงคโปร์) |
| Deploy | Vercel Hobby |
| Native app | Capacitor remote URL mode (`server.url` → `quizmon.xyz`) · package `com.quizmon.app` |
| ภาษา | ไทยทั้งหมด · timezone อ้างอิง `Asia/Bangkok` เท่านั้น |
| State management | ไม่มี global store — plain hooks + Server Components/Actions |

### 1.1 ตัวเลขจริง ณ 6 กันยายน 2026

| ตัวชี้วัด | v1.0 (15 ส.ค.) | v1.5 (6 ก.ย.) |
|---|---|---|
| บัญชีทั้งหมด | 126 | **242** (junior 167 / senior 67 / null band 8 — anon guest 1) |
| ตาราง (public schema) | 41 | **71** |
| RPC (public schema) | 70 | **125** |
| Migration | 135 | **224** |
| คำถามในคลัง (ทุกสถานะ) | 3,354 | **4,166** |
| คำถาม active | 2,931 | **3,946** |
| คำถามมีรูปภาพ | — | **299** (ทั้งหมดฝั่ง junior — senior ยังไม่มีรูปเลย) |
| `quiz_attempts` สะสม | 14,182 | **22,499** |
| pets ทั้งหมด | 194 | **333** |
| `analytics_events` | 47,072 | **73,019** |
| ข้อความ Qmon AI ที่ log แล้ว | 101 | **124** (gemini 71 / fallback 53) |
| Achievement ปลดล็อกแล้ว | 1,032 ครั้ง จาก 95 คน | **1,036 ครั้ง จาก 95 คน** ⚠️ ดู §7.2 |
| ผจญภัย (adventure) เล่นแล้ว | 129 รอบ | **269 รอบ** (claimed 256) |
| ท้าทาย (raid) เล่นแล้ว | 74 รอบ | **133 รอบ** (win 75 / lose_stat 41 / lose_quiz 16 / ค้าง 1) |
| Boss Raid (ห้องเรียน) เล่นแล้ว | ไม่มีระบบนี้ | **2 ห้อง** (win 1, ค้าง 1 — ดู §4.15) |
| ประลอง (PvP) เล่นแล้ว | ไม่มีระบบนี้ | **6 แมตช์** (finished 4, abandoned 2) |

**กระจาย stage ของ pet (333 ตัว):** stage 1 = 85 · stage 2 = 81 · stage 3 = 48 · stage 4 = 119 (36%)
→ ยังไม่มีตัวไหนถึง stage 5 (เหมือนเดิม เป็นเจตนา — ดู §3.2)

**FOC/SPD หลังจูนสูตร (v1.0.1 apply แล้ว):** pet stage 4 ที่ evolve **ก่อน** 16 ส.ค. (n=80, ได้ backfill)
FOC 61.4% / SPD 58.5% ของ cap · pet ที่ evolve **หลัง** 15 ส.ค. (n=36, ใช้สูตรใหม่ตั้งแต่ต้น) FOC 66.2% /
SPD 59.0% — ทั้งสองกลุ่มใกล้เคียงกันมาก ยืนยันว่า backfill ทำงานถูกต้องและสูตรใหม่ให้ผลตรงกับที่จำลองไว้
ใน v1.0 §3.5.2 (เป้าหมาย FOC~60%/SPD~55%)

---

## 2. หลักการออกแบบที่ยึดตลอด (ไม่เคยเปลี่ยนตั้งแต่ v3 — v1.5 ยังยึดเป๊ะ)

1. **ไม่ลงโทษรุนแรง** — ตอบผิดได้ ไม่หักคะแนน สัตว์ไม่ตาย ลบไม่ได้ ไม่มีความหิว · ของสำคัญที่ต้องสุ่ม
   มีระบบการันตีเสมอ (pity meter) · ไม่มีกรณีไหนที่สุ่มแล้วผู้เล่น "แพ้/เสียของที่มีอยู่แล้ว" จากดวงล้วนๆ
2. **ให้คุณค่าความพยายามพอๆ กับความเก่ง** — ตัวคูณแม่นยำมีพื้นล่าง ×0.8
3. **ทุกคนมีที่ยืน** — บุคลิกเลือกเองได้ ทำให้เก็บสมุดครบ 12 ช่องได้จริง
4. **ความหายาก = สวย/ภูมิใจ ไม่ใช่แรงกว่า** — ไข่ทุกใบ caps รวม 500 เท่ากันหมด
5. **การเรียนคือแกน** — EXP และวิวัฒนาการต้องมาจากตอบคำถามเสมอ (Qmon AI **ห้าม** ให้ EXP)
6. **derive ดีกว่าเก็บซ้ำ** — แต่แยกให้ออก: counter เสี่ยง race → atomic RPC · event ครั้งเดียว → log
7. **feedback เชิงบวกทั้งหมด** — ไม่มีข้อความเชิงลบใน UI แม้แต่จุดเดียว (ระบบใหม่ทุกระบบยึดกฎนี้ต่อ —
   ดูตัวอย่างชัดใน PvP §4.16 "หน้าจอตอนแพ้ไม่พูดคำว่าแพ้เลย")
8. **Qmon เชียร์เพราะเด็กเก่งขึ้น ไม่ใช่เด็กทำเพราะกลัว Qmon เสียใจ** — ห้าม AI/Push ใช้ความรู้สึกของ
   ตัวละครเป็นแรงกดดัน (กฎนี้ถูกยกไปใช้ตรงๆ ใน Push Notification §4.17 ด้วย)

---

## 3. ระบบแกน (core progression)

### 3.1 EXP

```
EXP ต่อข้อ = base × ตัวคูณแม่นยำ × ตัวคูณคอมโบ
base = 10 (โหมดปกติ) / 12 (โหมดติวกลางภาค)
soft cap = 180 EXP ต่อวัน (Bangkok day)
```
ไฟล์: `src/lib/exp.ts` — **ไฟล์ protected ห้ามแก้เด็ดขาด** (import ใช้ได้อย่างเดียว)

**ข้อยกเว้นใหม่ที่ apply แล้ว (PvP):** `source='pvp'` **ข้าม soft-cap 180/วัน** — เป็น exception เฉพาะจุด
ที่ล็อกไว้ตั้งแต่ design draft (ดู §4.16) ตัดสินใจแล้วว่าคุ้มความเสี่ยง over-farm เพราะมีแรงเสียดทาน
ธรรมชาติจากตั๋ว + ต้องมีเพื่อนจริงมาเล่นด้วย

### 3.2 วิวัฒนาการ

- persisted 4 stage ที่ใช้จริง · CHECK ใน DB รับถึง 5 แต่ **ไม่มีเนื้อหา/รูปของ stage 5**
- threshold: `{1→2: 50, 2→3: 350, 3→4: 900}` · ขยับได้ทีละ 1 stage ต่อรอบ
- จุดเขียนจริงจุดเดียว: `finishQuizRound()` ใน `src/app/quiz/actions.ts`
- ไฟล์: `src/lib/evolution.ts` — **protected** (ยกเว้น `computeRawStats()`)

> **ประเด็น game design ที่ยังเปิดอยู่ (เหมือนเดิม):** stage 4 คือเพดานจริงในทางปฏิบัติ — ตอนนี้มี pet
> stage 4 แล้ว **119 จาก 333 (36%)** ตอนนี้มีผจญภัย/ท้าทาย/achievement/Boss Raid/PvP มารองรับหลัง
> stage 4 แล้ว (5 ระบบ ไม่ใช่ 3 เหมือน v1.0) แต่ยังไม่มีข้อมูล retention เจาะจงพอจะสรุปผล — ดู §7.1

### 3.3 สาย (subline) — 6 ค่าใน DB, แยกตาม band

`pets.subline` CHECK ปัจจุบัน (ไม่เปลี่ยนจาก v1.0): `NULL | math | science | balanced | physics |
chemistry | biology`

**junior** — ล็อกตอน stage 3 จากสัดส่วนข้อที่ตอบถูก ≥60%

| subline | ป้ายไทย | ตัวคูณสเตตัส |
|---|---|---|
| `math` | สายคณิต | ATK 1.3 · FOC 1.3 · HP 0.9 · DEF 0.9 |
| `science` | สายวิทย์ | HP 1.3 · DEF 1.3 · ATK 0.9 · FOC 0.9 |
| `balanced` | สายสมดุล | ทุกค่า 1.0 · SPD 1.1 |

**senior** — ล็อกตอน stage 3 จาก "สายที่ตอบถูกมากที่สุด" ผ่าน `get_pet_branch_counts()`

| subline | ป้ายไทย | เลนศิลป์/สเตตัสที่ map ไป (`artLane`) |
|---|---|---|
| `physics` | สายฟิสิกส์ | → `math` (ATK/FOC เด่น) |
| `chemistry` | สายเคมี | → `balanced` (สมดุล + SPD) |
| `biology` | สายชีวะ | → `science` (HP/DEF เด่น) |

**กฎเหล็กของสถาปัตยกรรมนี้ (Option C) ไม่เปลี่ยน:** ค่าที่ไหลเข้า `evolution.ts` ต้องผ่าน `artLane()`
ก่อนเสมอ · ค่าที่ไหลออกไปหาผู้ใช้ต้องไม่ผ่าน `artLane()` — ไฟล์แกน: `src/lib/petLine.ts`

### 3.4 บุคลิก (personality) — A/B

ไม่เปลี่ยนจาก v1.0 — `pets.personality` = A (ดุดัน: ATK·SPD +5%) หรือ B (สุขุม: HP·DEF +5%) ล็อกตอน
stage 4 จาก majority vote อาหารสะสม เขียนจุดเดียว `choosePersonalityAfterEvolve()`

> ⚠️ สับสนง่ายที่สุดในโปรเจกต์ (ย้ำจาก v1.0): `PersonalityKey` (TS, เลือก template บับเบิล) กับ
> `pets.personality` (DB, A/B คูณสเตตัส) **ไม่เกี่ยวกันเลย**

### 3.5 สเตตัส 5 ค่า — snapshot ตอน stage 4

| สเตตัส | raw มาจาก |
|---|---|
| **HP** | `science_correct` สะสม |
| **ATK** | `math_correct` สะสม |
| **DEF** | `min(math_correct, science_correct) × 2` |
| **FOC** | ความแม่นยำเฉลี่ย **× 0.7** ✅ (v1.0.1 — apply แล้ว) |
| **SPD** | `combo_milestones` **× 2** ✅ (v1.0.1 — apply แล้ว) |

pipeline: `computeRawStats()` → ตัวคูณ subline → บุคลิก +5% เฉพาะ 2 ค่า → egg curve → `Math.round()`
ครั้งเดียวท้ายสุด → clamp cap ของไข่ (**ไม่เปลี่ยนจาก v1.0** ยกเว้น 2 บรรทัดของ FOC/SPD ข้างบน)

**✅ ปิดประเด็นแล้ว — จูนสูตร FOC/SPD (เดิมคือ v1.0.1 §3.5.2 ของ v1.0):** apply เข้า production แล้ว
+ **backfill pet stage 4 เดิมทั้ง 80 ตัวด้วย** (คำถามเปิดของ v1.0 ที่ว่า "จะ backfill ไหม" ตอบแล้วว่า
**backfill** — ดูผลจริงใน §1.1 ด้านบน ตรงกับที่จำลองไว้)

**สเตตัสถูกใช้จริงในหลายระบบแล้ว (ไม่ใช่แค่ raid เหมือน v1.0):**
- ท้าทาย (raid) — ด่านอุปสรรค/บอส เหมือนเดิม (ดู §4.12)
- Boss Raid (ห้องเรียน) — average ต่อหัว scale HP บอส/คริสตัล (ดู §4.15)
- ประลอง (PvP) — HP เลือดตั้งต้น, ATK/DEF/FOC/SPD กลไกการต่อสู้เต็มรูปแบบ (ดู §4.16)

### 3.5.1 แนวคิดที่ยังไม่ทำ — แยกสูตรสเตตัส senior ตามวิชาจริง

**สถานะไม่เปลี่ยนจาก v1.0:** ยังพักเป็น backlog ไม่ได้ทำ ปอนด์ยังไม่เคาะ — รายละเอียดเต็มยังอยู่ใน
v1.0 §3.5.1 (ไม่ย้ำซ้ำในเอกสารนี้ อ้างอิงไฟล์เดิมได้ถ้าต้องการรายละเอียด)

### 3.6 ไข่ — 5 ชนิด (ไม่เปลี่ยนจาก v1.0)

| id | ชื่อไทย | tier | obtainable | ได้จากไหน (แหล่งใหม่ที่เพิ่มมา — ดูขวาสุด) |
|---|---|---|---|---|
| `egg_common_01` | ไข่แก่นเพลิง | common | ✅ | เริ่มต้น/เลือกเอง |
| `egg_common_02` | ไข่แก่นพฤกษ์ | common | ✅ | เริ่มต้น/เลือกเอง |
| `egg_rare_01` | ไข่ฤทธิ์ธาร | rare | ✅ | ผจญภัย 5% + collection_choice |
| `egg_epic_01` | ไข่ศักดิ์นภา | epic | ✅ | ท้าทาย (raid_reward) **+ Boss Raid reward ใหม่** (`boss_raid_reward`, ครูเลือกได้ตอน setup ห้อง) |
| `egg_legendary_01` | ไข่เทพทิพย์ | legendary | ❌ | รางวัลอันดับ 1 weekly เท่านั้น |

**caps รวมทุกใบ = 500 เท่ากันหมด** (ไม่เปลี่ยน) · **ยังไม่มีไข่ชนิดใหม่** — Boss Raid/PvP ใช้ไข่เดิมทั้งหมด
(ตั้งใจ ไม่สร้างไข่แยกเฉพาะโหมด — ดู §4.15)

**การกระจาย `player_eggs.source` จริง ณ 6 ก.ย.:** starter 242 · collection_choice 108 · dungeon_reward
20 · raid_reward 12 · weekly_leaderboard_reward 11 · **boss_raid_reward 2** (ใบใหม่ ยืนยันระบบรางวัล
Boss Raid ทำงานจริงแล้ว)

---

## 4. ฟีเจอร์ทั้งหมดที่ใช้งานจริงตอนนี้

> §4.1–§4.14 ไม่เปลี่ยนจาก v1.0 ในเชิงกลไก (ดูรายละเอียดเต็มในไฟล์เดิมถ้าต้องการ) — สรุปย่อ + จุดที่
> ตัวเลข/ข้อมูลเปลี่ยนไว้ด้านล่าง แล้วเพิ่มระบบใหม่ทั้งหมดที่ §4.15 เป็นต้นไป

### 4.1–4.10 ระบบเดิม (สรุปย่อ ไม่เปลี่ยนกลไก)

| § | ระบบ | อัปเดต |
|---|---|---|
| 4.1 | ทำโจทย์ + ภารกิจรายวัน | ไม่เปลี่ยน |
| 4.2 | ปุ่มเลือกฝึกแยกสาย | ยังเป็น presentation layer ล้วนเหมือนเดิม — **ตอนนี้มีฟีเจอร์ "เลือกบทฝึกฝน" ต่อยอดแล้ว ดู §4.18** |
| 4.3 | ระบบอาหาร + ป้อน | ไม่เปลี่ยน |
| 4.4 | สมุดสะสม 30 ช่อง | ไม่เปลี่ยน |
| 4.5 | เส้นทาง 7 วัน (Weekly Journey) | ไม่เปลี่ยน |
| 4.6 | ลีดเดอร์บอร์ดรายสัปดาห์ + Hall of Fame | กรอง guest (`is_anonymous`) ออกเพิ่มแล้ว (ดู §4.20) |
| 4.7 | Qmon พูดด้วย AI (Gemini) | สัดส่วน gemini/fallback **แย่ลงจาก v1.0**: 71/124 gemini (57.3%) vs fallback 53/124 (42.7%) — เทียบกับที่เคยดีขึ้นถึง 31.7% fallback ช่วงกลางเดือน ส.ค. ⚠️ **ยังไม่ได้สืบสาเหตุ** อาจเกี่ยวกับโควตาที่ต้องแบ่งกับ Question Factory (§4.19) ที่เพิ่งเปิดใช้ Gemini API เดียวกันหนักขึ้น — ควรตรวจ `error_reason`/`latency_ms` ต่อ |
| 4.8 | แบบสำรวจความเห็นผู้เล่น | มีคนตอบเพิ่มเป็น **17 คำตอบ** (จาก 14) |
| 4.9 | บับเบิลคำพูด (template) | ไม่เปลี่ยน |
| 4.10 | Analytics + หน้า admin | ไม่เปลี่ยน |

### 4.11 ผจญภัย (Adventure / Idle Dungeon) — อัปเดตตัวเลข

กลไกไม่เปลี่ยนจาก v1.0 (design doc: `idle-dungeon-design-2026-08-03-final.md`) **ตัวเลขจริง ณ 6 ก.ย.:**
269 รอบสะสม (256 claimed) · pity meter สูงสุดที่เจอ = 12/14 (ยังไม่มีใครแตะการันตีบังคับ)

### 4.12 ท้าทาย (Raid / Challenge) — เปิดเต็มแล้ว ไม่มี allowlist gate

design doc เดิม (`challenge-system-design-2026-08-06-v3.md` ฯลฯ) ยังตรงเกือบทั้งหมด **ยกเว้น 2 จุดที่
เปลี่ยนไปตั้งแต่ v1.0:**

1. **allowlist gate ถูกถอดออกจาก RPC ทั้งหมดแล้ว** (migration `remove_raid_allowlist_gate_from_rpcs`
   ×3 ส่วน, 4 ก.ย.) — ตาราง `raid_allowlist` ยังมี 178 แถวค้างอยู่แต่**ไม่มีผลอะไรแล้ว** เป็นตารางค้าง
   (vestigial) ไม่ใช่กลไกจริงอีกต่อไป — ทุกคนเล่นท้าทายได้โดยไม่ต้องอยู่ใน allowlist
2. **RPC คืน `image_url` แล้ว** (migration `raid_questions_return_image_url`, 5 ก.ย.) — `choose_raid_path`
   และ `start_raid_boss` ยืนยันจาก `pg_get_functiondef` ว่ามี `image_url` ในผลลัพธ์แล้วจริง (ชั้น SQL/RPC
   ปิดแล้ว) **แต่ชั้น JSX (`RaidObstacleQuizScreen.tsx`/`RaidBossScreen.tsx`) แสดงรูปจริงหรือยัง — ยังไม่
   ยืนยัน (ค้างไว้ก่อนตามที่ปอนด์แจ้ง)**

**ตัวเลขจริง (6 ก.ย., n=133 รอบ):** win 75 · lose_stat 41 · lose_quiz 16 · outcome ว่าง 1 (รอบค้าง/ไม่จบ)
— ชนะ 56.4% (ดีขึ้นจาก 50% ใน v1.0 ซึ่งสอดคล้องกับ FOC/SPD ที่จูนใหม่ทำให้ผ่านด่านง่ายขึ้นเล็กน้อยตามที่
คาดไว้ในผลจำลอง §3.5.2 ของ v1.0)

gear แจกแล้ว: q1=62, q2=26, q3=22, q4=22 (รวม 132 ชิ้น) สวมใส่แล้ว 54 ชิ้น · ไข่ epic แจกแล้ว 12 ใบผ่าน
`raid_reward` (บวก 2 ใบผ่าน `boss_raid_reward` แยกต่างหาก — ดู §3.6) · **gear same-stat auto-unequip
toast — ยังไม่ยืนยันว่า implement แล้วหรือยัง** (ค้างไว้ก่อน)

### 4.13 Achievement — เงียบมาก ⚠️ ดู §7.2

ไม่เปลี่ยนกลไก (pull-based, `evaluate_achievements()` เรียกครั้งเดียวตอนเปิดหน้า `/achievements`)
**ตัวเลขจริง:** ปลดล็อกแล้ว 1,036 ครั้งจาก **95 คนเท่าเดิม** (ไม่ใช่ 95 คนที่โต — เป็นคนเดิม 95 คนจาก
v1.0 เป๊ะ) — บัญชีเพิ่มมา 116 บัญชีใหม่นับตั้งแต่ v1.0 **ไม่มีใครปลดล็อกเหรียญเลยแม้แต่เหรียญเดียว**
ดูรายละเอียดที่ §7.2

### 4.14 Profile & Friends (สังคม) — อัปเดตตัวเลข

ไม่เปลี่ยนกลไก **ตัวเลขจริง ณ 6 ก.ย.:** เพื่อน 16 คู่ (จาก 4) · ถูกใจ 41 ครั้ง (จาก 1) · ส่งกำลังใจ 4 ครั้ง
(จาก 0 — เริ่มมีคนใช้แล้ว)

---

### 4.15 Classroom Boss Raid — ระบบใหม่ทั้งหมด

> Live ตั้งแต่ปลาย ส.ค. 2026 (Phase 0 เริ่ม 28 ส.ค.) ต่อเนื่องถึง Phase 2 (event ระบบเต็ม) 3 ก.ย.
> design doc ต้นฉบับ: `classroom-boss-raid-design-2026-08-28-v2.md` + `boss-raid-phase1-context-2026-08-31.md`
> **แยกจากระบบ "ท้าทาย" (`raid_*`) เดิมทั้งหมด** — schema คนละชุด ไม่ reuse (ตัดสินใจจริงจาก DB: ตาราง
> เริ่มด้วย `boss_raid_*` ทั้งหมด 6 ตาราง)

**Concept:** ทั้งห้องเรียนช่วยกันตอบคำถามสู้บอสพร้อมกัน (async — sync mode ถูกตัดออกถาวรตั้งแต่ 31 ส.ค.)
ตอบถูก → ตีบอส · ตอบผิดสะสม → บอสฟาดคริสตัล (ฐานที่ห้องต้องปกป้อง) · คริสตัลแตก = แพ้ / บอส HP หมด = ชนะ
ครูเปิดจอทีวี/โปรเจกเตอร์เป็นจอกลาง นักเรียนตอบบนมือถือตัวเอง

**Schema (6 ตาราง):** `boss_raid_sessions` `boss_raid_participants` `boss_raid_answers`
`boss_raid_tier_log` `boss_raid_event_log` `boss_raid_rewards`

**สูตร/กลไก — ยืนยันจาก RPC จริง (`start_boss_raid_game`, `submit_boss_raid_answer`):**

```
boss_hp_max    = round(125 × N × avg_atk/100)     ← ลดครึ่งจาก 250 (balance fix 5 ก.ย.)
crystal_hp_max = round(275 × N × avg_def/100)
damage/ข้อ     = round(10 × atk/100), crit ×1.5 (chance = min(50%, foc/2)%)
crystal_damage = tier_rank × 6                     ← เปลี่ยนจากสูตรเดิมที่หาร avg_def ซ้ำ (บั๊กที่แก้แล้ว)
timer          = config.timer_seconds (ครูปรับ) + round(spd/20)
tier threshold = round(base × N / 15.0) — 3 tier ตายตัว: light/medium/heavy
```
N = จำนวนคนเข้าร่วมตอนเริ่มเกม (`participant_count_at_start`) · avg_atk/avg_def = ค่าเฉลี่ยต่อหัวจาก
`stat_snapshot` ของทุกคนที่ join ตอนกดเริ่ม (คนมาสายหลังเริ่มไม่ถูกนับใน HP ตั้งต้น — ตามดีไซน์)

**✅ บั๊กที่เคยบันทึกว่า "รอ apply" ตอนนี้ apply เข้า production แล้ว:** `crystal_damage` double-dip
(เดิมหารด้วย `avg_def` ซ้ำทำให้ห้อง DEF สูงแพ้แทบไม่ได้) แก้เป็น `rank × 6` ตรงๆ + ลด `boss_hp` เป้าหมาย
จาก 250 → 125 ต่อคน — migration `boss_raid_balance_fix_crystal_damage_boss_hp` (5 ก.ย.) ยืนยันจาก
`pg_get_functiondef` ตรงๆ ว่าอยู่ใน prod แล้ว

**Event ระหว่างสู้ — ทั้ง 5 ตัวทำงานจริงแล้ว (Phase 2 ปิดครบ 3 ก.ย.):**

| Event | Trigger | ยืนยัน trigger จริงจาก `boss_raid_event_log` |
|---|---|---|
| นักรบถูกเลือก (`chosen_warrior`) | ผิดสะสมครบ N ติดกัน หรือ tier ขยับเข้า heavy | ✅ trigger แล้ว 3 ครั้ง |
| บอสโกรธ (`enrage`) | HP milestone 75%/50%/25% | ✅ trigger แล้ว 2 ครั้ง (บัฟดาเมจ ×2.5 นาน 15 วิ) |
| พลังรวมพลัง (`combo_burst`) | ตอบถูกติดกันสะสมครบ 8 ข้อข้ามคน | ✅ **trigger แล้ว 2 ครั้ง** (แก้ไขจากที่เคยบันทึกว่า "ยังไม่เคย" — หักบอส 40 คงที่ + reset streak) |
| จุดอ่อนเผย (`weak_point`) | สุ่ม 2% ต่อคำตอบ | ✅ trigger แล้ว 4 ครั้ง (บัฟดาเมจ ×2 นาน 20 วิ) |
| ฝนดาวตก (`meteor`) | สุ่ม 2% ต่อคำตอบ | ✅ trigger แล้ว 2 ครั้ง (คำถามบอนัส broadcast, ตอบถูกคนแรกได้โบนัส) |

**ระบบรางวัลจบเกม — implement แล้ว (ไม่ใช่ "ยังไม่เริ่ม" ตามบริบท 31 ส.ค.):**
`distribute_boss_raid_rewards()` — ครูเลือกไข่รางวัล + จำนวนคนที่ได้ (`reward_top_n`) ตอน setup ห้อง ·
จัดอันดับด้วย `total_damage` (นับรวม event bonus) · แจกเฉพาะห้องที่ชนะ (`result='win'`) · กัน
double-distribute ด้วย `reward_distributed_at` — ยืนยันแจกไข่ epic จริงแล้ว 2 ใบ (`boss_raid_reward`)

**หน้าสรุปผลท้ายเกม — implement แล้ว (RPC พร้อม):** `get_boss_raid_summary()` คืน accuracy รวมห้อง,
ดาเมจรวม, ranking รายคน (ดาเมจ/ถูก/ผิด/accuracy/อันดับ) — **ฝั่ง UI แสดงผลจริงหรือยัง ยังไม่ยืนยัน**
(ค้างไว้ก่อน)

**เลือก Qmon เข้าห้อง — จุดที่น่าสนใจทางเทคนิค:** `join_boss_raid_session()` ดึง Qmon `is_active` ของ
ผู้เล่นอัตโนมัติ ไม่ว่า stage ไหนก็เข้าได้ (stage <4 → stat แบน 50 ทุกแกนแทน) แต่ถ้าจะ**สลับ Qmon เอง**
ผ่าน `select_boss_raid_pet()` บังคับต้อง **stage 4 เท่านั้น** — เป็น asymmetry เล็กๆ ที่ตั้งใจหรือพลาด
ยังไม่ชัด (ไม่กระทบผู้เล่นจริงเพราะ default หา active pet ให้อยู่แล้ว) — บันทึกไว้เป็นข้อสังเกต

**ตัวเลขจริง ณ 6 ก.ย.:** เล่นแล้ว 2 ห้อง เท่านั้น
1. `0e0acbcc` — จบแล้ว **ชนะ** (8 คน, easy, timer 50s, แจกไข่ epic 1 ใบให้ top 1) — enrage trigger ครบ
   ทั้ง 3 milestone (75/50/25) ก่อนจบ
2. `28e73bca` — **ยังค้างอยู่ใน `in_progress`** ตั้งแต่ 5 ก.ย. 02:16 น. (15 คนเข้าร่วม, ผ่านไปแล้วกว่า
   19 ชม. ณ ตอนเขียนเอกสาร) `wrong_streak_current=12`, tier `heavy` — **ปอนด์ยืนยันว่าเป็นห้องเล่นจริง
   ที่เล่นไม่จบ ไม่ใช่ห้องเทสที่ลืมปิด** → เก็บไว้เป็นข้อมูลจริง ไม่ต้องลบ **แต่เป็นสัญญาณว่าระบบยังไม่มี
   กลไก timeout/force-end ห้องที่ค้าง** ครูไม่มีปุ่ม "จบห้องฉุกเฉิน" ที่ชัดเจน — ควรพิจารณาเพิ่มใน backlog

**สิ่งที่ยังไม่ยืนยัน (ปอนด์ขอค้างไว้ก่อน — ดูหมายเหตุหัวเอกสาร):**
- Layout จอทีวี/จอครู (mockup v7) — เคาะเสร็จหรือยัง แก้ปัญหา "ขบวนกระจุกติดบอส" แล้วหรือไม่
- ระบบเสียง (SFX 13 ไฟล์ + BGM) — status: ยังไม่เริ่ม survey เลยตามความจำล่าสุด
- accuracy threshold ขั้นต่ำสำหรับ MVP/Top N — จาก config ห้องจริงที่ตรวจ (`reward_top_n=1`, ไม่มี field
  accuracy threshold ใน config) **ดูเหมือนยังไม่ implement** — ตรงกับที่เคยบันทึกไว้ว่าเป็น gap

---

### 4.16 ประลอง (PvP) — ระบบใหม่ทั้งหมด

> Live ตั้งแต่ 3 ก.ย. 2026 (สไลซ์ 1) ต่อเนื่องถึงสไลซ์ 5 (4-5 ก.ย.) — **ทุกสไลซ์ปิดครบแล้วตามแผนเดิม**
> design doc ต้นฉบับ: `claude_pvp-system-design-2026-09-03-draft.md` + `pvp-phase-plan-2026-09-03.md`
> + `pvp-status-2026-09-04-pre-slice2.md`

**Concept:** เล่นเฉพาะเพื่อนกัน — ท้า → รับ → เลือก Qmon+อุปกรณ์ (blind) → ดวลแบบสลับกันทีละยก (async,
ไม่ใช่ realtime) จั่วการ์ดบอกบท/วิชา/ความยาก 5 ใบ → เลือก 1 ใบให้อีกฝั่งทำ ทำถูก=ไม่โดน/ทำผิด=โดนดาเมจ

**Schema (7 ตาราง):** `pvp_challenges` `pvp_matches` `pvp_match_cards` `pvp_card_effects` `pvp_tickets`
`pvp_config` `pvp_allowlist` (เหลือค้างแบบเดียวกับ `raid_allowlist` — ดูด้านล่าง)

**Stat mapping (เวอร์ชันสุดท้ายที่ implement จริง, ยืนยันจาก `_pvp_resolve_round()`):**

| Stat | บทบาท |
|---|---|
| HP | เลือดตั้งต้น (`greatest(stat.hp, 1)`) |
| ATK | ดาเมจฐาน = `round(atk × 0.55)` เมื่ออีกฝั่งตอบการ์ดผิด |
| DEF | ลดดาเมจที่รับ % = `1 - def/200` |
| SPD | กำหนดวินาทีตอบ = `60 + round(spd/20)` (ไม่ใช่ตัดสินตาแรก — **แก้จาก handoff เดิมที่เคยเขียนผิด**) |
| FOC | โอกาสคริ % ตรงๆ (`random()*100 < foc`) คูณดาเมจ ×1.5 |

**ตาแรกของแมตช์ = ฝั่งรับคำท้าเสมอ** (ไม่ใช่ SPD สูงกว่าอย่างที่เคยเข้าใจผิด) — ยืนยันจาก
`accept_pvp_challenge()`: `attacker_id = v_ch.opponent_id` ตรงๆ

**เอฟเฟกต์การ์ด 6 แบบ — ยืนยันจาก `pvp_card_effects` จริง:** สวนกลับ(reprisal, เสี่ยงคนส่ง) ·
เจาะเกราะ(pierce, เข้าข้างคนส่ง) · ฮีลเมื่อสำเร็จ(heal, เข้าข้างคนตอบ) · เดิมพันสูง(high_stake, คนส่ง) ·
ดูดเลือด(lifesteal, คนส่ง) · เร่งเวลา(haste, คนส่ง, timer 30s แทน 60s) — สุ่ม 40% ไม่มีเอฟเฟกต์เลย
(การ์ด "เปล่า") ตรงกับที่ล็อกไว้ในดีไซน์เป๊ะ

**การ์ดจากไหน:** `_draw_pvp_hand()` สุ่มเอียงตาม subline ของ Qmon ที่เลือก (4 ใบจาก lane + fill ให้ครบ 5)
ไม่ใช้เกณฑ์ขั้นต่ำจำนวนข้อแบบ topic-select — ตั้งใจต่างกัน

**ตั๋ว + EXP — ยืนยันจาก `_pvp_grant_tickets()`/`create_pvp_challenge()`:**
แจกฟรี 2 ใบ/วัน + ได้เพิ่ม 1 ใบเมื่อ raid `status='completed'` จบ 1 รอบ (นับตั้งแต่ `raid_bonus_since`,
ตั้งไว้ 4 ก.ย.) · เพดานสะสม 15 ใบ · หักตั๋วจากผู้ท้าเท่านั้นตอนกดส่งคำท้า · คำท้าค้างสูงสุด 5 รายการ ·
EXP ชนะ 50 / แพ้ 20 (lump-sum ไม่ผูก per-question) **ไม่ติด soft-cap 180/วัน** (ดู §3.1)

**✅ เปิดกว้างขึ้นเรื่อยๆ ในช่วง 4-5 ก.ย. (3 รอบเปลี่ยนใจ ยืนยันจาก migration history จริง):**
1. เริ่มต้น: จำกัด stage 4 เท่านั้น (`pvp_slice_4`)
2. เปลี่ยนเป็น: ทุก stage เล่นได้ stage<4 ใช้ stat แบน 50 (`pvp_allow_any_stage_flat_stat_50`, 5 ก.ย.)
3. ปรับอีกรอบ: stage 4 ใช้ stat จริง, stage อื่นแบน 50 (`pvp_stage4_real_stat_others_flat_50`)
4. **ถอด `pvp_allowlist` gate ออกจาก RPC แล้ว** (`open_pvp_remove_allowlist_gate`, 5 ก.ย.) — เปิดให้
   ทุกคนใช้ได้ (ยกเว้น guest — ดู §4.20) ตาราง `pvp_allowlist` เหลือ 4 แถวค้าง เป็น vestigial เหมือน
   `raid_allowlist`

**Junior/Senior แยกขาด** ท้าได้เฉพาะ grade_band เดียวกัน — ยืนยันจาก `create_pvp_challenge()` ตรงๆ

**ตัวเลขจริง ณ 6 ก.ย.:** คำท้า 9 ครั้ง · แมตช์ 6 (finished 4, abandoned 2) · ตั๋วออกแล้ว 16 ใบ

**เมนู/ทางเข้า:** แทนที่ "หอเกียรติยศ" ในเมนูล่าง 4 ปุ่ม (บ้าน/สังคม/ฟาร์ม/**ประลอง**) — หอเกียรติยศย้าย
เป็นลิงก์ในแท็บ "อันดับ" ของหน้าสังคมแทน — **ยังไม่ยืนยันว่า UI ทำตามนี้จริงหรือยัง** (ตรวจได้แค่ schema/
RPC จาก DB ไม่ใช่หน้าจอ)

---

### 4.17 Push Notification — ระบบใหม่ทั้งหมด

> Locked baseline 23 ส.ค. 2026 · design doc: `QuizMon-Push-Notification-Design.md`
> Infra: Capacitor remote URL + `@capacitor/push-notifications` + Firebase (`quizmon-9b643`) — Android
> wiring ผ่านการทดสอบ end-to-end แล้วตั้งแต่ก่อน 23 ส.ค. (BrowserStack Pixel 7 Pro/Android 13)

**หลักการล็อก:** ห้าม negative framing เด็ดขาด (ห้ามพูด "ไม่ได้เข้าเกม 24 ชม.แล้ว", "Qmon กำลังเหงา" ฯลฯ)
· Qmon ตัวปัจจุบันเป็นผู้พูดเสมอ

**Schema (4 ตาราง) — ยืนยันจาก DB จริง:** `push_devices` `push_preferences` `notification_jobs`
`notification_deliveries`

**Event types ที่ยิงจริงแล้ว (ยืนยันจาก `notification_jobs` ตรงๆ):**

| Notification type | ส่งสำเร็จ | ล้มเหลว |
|---|---|---|
| `daily_exp_evening` (20:00 น.) | 49 | 1 |
| `daily_quest_morning_weekday` (07:00 น.) | 31 | 2 |
| `daily_quest_morning_weekend` (09:00 น.) | 14 | 0 |
| `adventure_returned` | 3 | 0 |
| `friend_request_received` | 2 | 0 |

รวม 103 deliveries (สำเร็จ 99 / ล้มเหลว 4) · cron `adventure-return-push` ทำงานทุก 5 นาทีจริง (ยืนยัน
จาก `cron.job`) · device ลงทะเบียนแล้ว 10 เครื่อง (เปิดรับ push 6 / ปิด 4) ทั้งหมดเป็น Android (iOS
ยังรอ Apple Developer Program ตามเดิม)

**⚠️ Push สำหรับ PvP — ยังไม่มีสัญญาณใน DB:** ดีไซน์ระบุชัดว่าต้องมี push "คำท้าใหม่" + "ถึงตาคุณ" แต่
`notification_jobs` **ไม่มี notification_type ไหนเกี่ยวกับ PvP เลย** และไม่มี trigger ใน DB ที่ผูกกับ
`pvp_challenges`/`pvp_matches` (มีแค่ trigger คืนตั๋ว `trg_pvp_refund_ticket`) — เป็นช่องว่างที่ยัง
ไม่ implement จริง ไม่ใช่แค่ยังไม่มีข้อมูล

**สิ่งที่ยังไม่ยืนยัน (ค้างไว้ก่อน):** verify รอบสองที่ชน quiet hours + หน้าตั้งค่า toggle บนจอจริง —
ตรวจได้แค่ว่า schema/cron/log มีข้อมูลจริง แต่ไม่เห็นหน้าจอ UI

---

### 4.18 เลือกบทฝึกฝน + คลังหลักสูตร (Topic Select / Curriculum) — ระบบใหม่ที่ live แล้ว

> design doc: `claude_topic-select-practice-design-2026-08-26.md` (สถานะเอกสารเดิมยังเขียนว่า
> "Survey + Draft ยังไม่จบ") **แต่ยืนยันจาก DB ว่าโหมดนี้ live ในสนามจริงแล้ว** — `quiz_attempts` มี
> `source='topic_select'` จริง 122 แถว ไม่ใช่แค่แผน

**คลังหลักสูตร (`curriculum_chapters` + `curriculum_chapter_availability`):** 96 บท/ระดับชั้น รวม —
junior คณิต 20 บท (ม.1-3) · junior วิทย์ 18 บท · senior ฟิสิกส์ 20 บท · senior ชีวะ 25 บท · senior เคมี
13 บท ยึด `grade_level` เป็นหน่วยจัดกลุ่มหลักตามที่เคาะไว้ (ไม่ใช้โครงสร้าง category→chapter 2 ชั้นแบบเดิม)

**✅ ยืนยันแล้ว — ตัดสินใจสุดท้าย (ปอนด์ยืนยัน 6 ก.ย.): topic_select attempt ไม่นับ leaderboard สัปดาห์
เป็นความตั้งใจ** ไม่ใช่หลุด — แก้จากที่เอกสาร 26 ส.ค. เคยเขียนไว้ว่า "จะให้นับเหมือนโหมดคละ" (§1.2 ของ
เอกสารเดิม) `weekly_scores_bkk()` ยืนยันจาก `pg_get_functiondef` ว่ากรอง `source is null` ตรงๆ — เด็กที่
ฝึกผ่านโหมดเลือกบท **ไม่ได้คะแนนสัปดาห์** ปอนด์เคาะแล้วว่าเป็นพฤติกรรมที่ต้องการ (ไม่ต้องแก้)

**AI gen ข้อสอบใหม่ (batch offline, ไม่มี Gemini ใน hot path):** สโคปเดิมเจาะจงบทที่ระดับความยากยังไม่
ครบ 3 ขั้น — ตอนนี้ integrate เข้ากับ Question Factory เต็มรูปแบบแล้ว (ดู §4.19 แทนที่จะเป็น pipeline
แยก 5 ขั้นตามที่ร่างไว้ตอนแรก)

**Escalate ความยากอัตโนมัติ:** เกณฑ์ยังไม่เคาะรายละเอียด (accuracy threshold, hysteresis) เหมือนที่
เอกสารเดิมบันทึกไว้ — **ยังไม่ยืนยันว่า implement ส่วนนี้แล้วหรือยัง**

---

### 4.19 Question Factory — ระบบใหม่ทั้งหมด (AI content pipeline)

> ไม่มี design doc รวมเล่มเดียว — ระบบนี้สร้างขึ้นจากการ implement ต่อเนื่องหลายเฟส (27-29 ส.ค.)
> สรุปจากโครงสร้าง DB จริงเท่านั้น เพราะไม่มีเอกสารดีไซน์ต้นฉบับใน project knowledge

**Schema (11 ตาราง):** `question_factory_runs` `question_factory_slots` `question_factory_assets`
`question_factory_blueprint_snapshots` `question_factory_budget_reservations`
`question_factory_category_registry` `question_factory_events` `question_factory_product_mappings`
`question_factory_profile_snapshots` `question_factory_reviews` `question_factory_run_budgets`
`question_factory_run_leases`

**RPC ~30 ตัว** ครอบคลุม lifecycle เต็ม: `question_factory_create_run` → `start_run` → `claim_run` →
`transition_text_slot` (batch 3 slots/call) → `record_asset_qc` → `record_human_review` →
`promote_asset` → `publish_draft` → `activate_draft` → `complete_run` — มี lease/budget/revision-limit
guard ครบ (trigger `question_factory_slots_revision_limit`, `question_factory_assets_verify_staging_object`)

**สถานะ run จริง:** completed 17 · cancelled 2 (รวม 19 run ที่เคยเปิด) — ตัวเลข active questions ที่
เพิ่มขึ้นจาก v1.0 (physics 400→418, chemistry 400→405) สอดคล้องกับงาน batch เล็กๆ ที่ผ่าน pipeline นี้
**แต่ biology กระโดดจาก 400→600 (+200 ข้อ) — เพิ่มเยอะกว่าที่ pipeline เชิง manual QC ทีละ ~20 ข้อ/run
น่าจะทำได้ในเวลาสั้นขนาดนี้** ควรถามปอนด์ว่ามาจาก batch ใหญ่ผ่าน factory จริง หรือมาจากแหล่งอื่น
(import ชุดใหญ่?) — ไม่ได้สืบสาเหตุในรอบตรวจนี้

**Guest content safety guard ที่เกี่ยวข้อง:** `secure_questions_active_reads` +
`remove_question_images_anon_writes` (27 ส.ค.) — ล็อกไม่ให้ anon เขียนรูปคำถามได้โดยตรง

**ตามความจำเดิม:** actor สำหรับ senior physics คือ `claude-manual-senior-physics` (Claude ทำ Author+QC
ผ่าน RPC ตรง) Run 52 (18 ข้อ "การเคลื่อนที่แนวตรง") ที่เคยรอ approve — **สถานะปัจจุบันของ run นั้น
เจาะจงยังไม่ตรวจแยก** (ไม่มี `created_by`/`actor_id` column ให้ query กรองตรงๆ ในรอบนี้)

---

### 4.20 Guest Mode — ใหม่ล่าสุด (เพิ่งขึ้น production วันเดียวกับที่เขียนเอกสาร)

> Live 5 ก.ย. 2026 — ปิดงานสมบูรณ์แล้ว (PR #120 ตามความจำ, HEAD `c3ab542`)

**สถาปัตยกรรม:** Supabase Anonymous Auth (`signInAnonymously` พร้อม metadata username+grade_level) —
`handle_new_user()` trigger เดิมทำงานกับ anon user ได้อัตโนมัติ ไม่ต้องเขียน backend onboarding ใหม่

**Hard gate:** guest เล่นได้อิสระจนกว่า pet stage 1→2 ถึงเจอ full-screen block บังคับผูกไอดี (เช็ค
`is_anonymous && stage>=2` ทุก app load) + ปุ่มผูกไอดีสมัครใจในเมนู "ตั้งค่า" ด้วย

**ผูกไอดี 2 เส้นทาง:** Google (`linkIdentity`, เสร็จทันที) หรือ email/password (2 ขั้นแยกกันจริงตาม
Supabase — `updateUser({email})` → รอ confirm → `updateUser({password})` แยกคำสั่ง)

**Guard ที่ apply พ่วงกันทั้งชุด (ยืนยันจาก migration 5 ก.ย.):**
- `block_guest_from_pvp` — anon เล่น PvP ไม่ได้ (กันปั้ม EXP)
- `exclude_guest_from_weekly_leaderboard` — `weekly_scores_bkk()` กรอง `is_anonymous` ออกแล้วจริง
  (ยืนยันจาก `pg_get_functiondef` ตรงๆ — เห็น `and qa.user_id not in (select au.id from auth.users au
  where au.is_anonymous = true)`)
- `cleanup_abandoned_guest_accounts` — ลบ anon user ที่ไม่ active เกิน 7 วัน ผ่าน pg_cron รายวัน
  (20:00 UTC) ยกเว้นคนที่กรอกฟอร์มผูกไปแล้วรอ confirm (`email is not null`) ไม่ลบ
- `exclude_pending_link_from_guest_cleanup` — แก้เพิ่มอีกรอบกันลบคนที่กำลังผูกไอดีอยู่พลาด

**Boss Raid เปิดรับ guest ได้ทันที** เพราะ `join_boss_raid_session()` ไม่มีเช็ค allowlist/anon อยู่แล้ว
(กันด้วย `join_code` ของครูแทน)

**ตัวเลขจริง ณ 6 ก.ย. (เพิ่งเปิด <24 ชม.):** anon user 1 คนในระบบตอนนี้ · โปรไฟล์ที่ `grade_band is null`
8 คน (สร้างระหว่าง 19 ส.ค. - 5 ก.ย., ส่วนใหญ่ก่อน guest mode เปิดตัวจริง — น่าจะเป็นบัญชีที่ยังกรอก
ข้อมูลไม่ครบตอนสมัคร ไม่ใช่ guest ทั้งหมด)

---

## 5. Data model

### 5.1 ตาราง — 71 ตารางรวม (จาก 41 ใน v1.0)

| กลุ่ม | ตาราง |
|---|---|
| แกนเดิม (14 ตาราง) | `profiles` `questions` `quiz_attempts` `pets` `egg_types` `player_eggs` `player_food` `pet_feedings` `daily_missions` `analytics_events` `qmon_messages` `qmon_menu_cache` `weekly_leaderboard_rewards` `player_feedback` |
| ผจญภัย | `dungeon_types` `dungeon_runs` `dungeon_pity` |
| ท้าทาย (raid) | `raid_types` `raid_obstacles` `raid_gear_qualities` `raid_quality_thresholds` `raid_tickets` `raid_runs` `raid_run_steps` `raid_boss_questions` `raid_gear_items` `raid_allowlist` (vestigial) `raid_pity` |
| Achievement | `achievement_definitions` `user_achievements` `user_pinned_achievements` `achievement_tester_eligibility` |
| Profile & Friends | `profile_settings` `friendships` `friend_requests` `profile_likes` `encouragements` `blocks` |
| **Classroom Boss Raid** (ใหม่) | `boss_raid_sessions` `boss_raid_participants` `boss_raid_answers` `boss_raid_tier_log` `boss_raid_event_log` `boss_raid_rewards` |
| **ประลอง (PvP)** (ใหม่) | `pvp_challenges` `pvp_matches` `pvp_match_cards` `pvp_card_effects` `pvp_tickets` `pvp_config` `pvp_allowlist` (vestigial) |
| **Push Notification** (ใหม่) | `push_devices` `push_preferences` `notification_jobs` `notification_deliveries` |
| **คลังหลักสูตร** (ใหม่) | `curriculum_chapters` `curriculum_chapter_availability` |
| **Question Factory** (ใหม่) | `question_factory_runs` `question_factory_slots` `question_factory_assets` `question_factory_blueprint_snapshots` `question_factory_budget_reservations` `question_factory_category_registry` `question_factory_events` `question_factory_product_mappings` `question_factory_profile_snapshots` `question_factory_reviews` `question_factory_run_budgets` `question_factory_run_leases` |
| โครงสร้างรองรับ | `schools` `zones` `test_accounts` |

### 5.2 คลังคำถาม (active เท่านั้น — ตัวเลข 6 ก.ย.)

**junior — 2,523 ข้อ active** (+220 inactive)

| subject | diff 1 | diff 2 | diff 3 | รวม active |
|---|---|---|---|---|
| math | 491 | 477 | 331 | 1,299 |
| science | 472 | 401 | 351 | 1,224 |

**senior — 1,423 ข้อ active**

| branch | subject | diff 1 | diff 2 | diff 3 | รวม |
|---|---|---|---|---|---|
| physics | `math` | 224 | 129 | 65 | 418 |
| chemistry | `science` | 242 | 126 | 37 | 405 |
| biology | `science` | 207 | 259 | 134 | 600 |

> ⚠️ **เคมี diff 3 ยังบางสุด (37 ข้อ = 9%)** เหมือนที่ v1.0 เคยบันทึกไว้ — ยังไม่ได้เติม
> ⚠️ **biology โตจาก 400→600 (+50%) เร็วผิดปกติเทียบกับ physics/chemistry ที่โตทีละ ~5-18 ข้อ** —
> ควรถามปอนด์ว่าแหล่งที่มาคืออะไร (ไม่ได้สืบในรอบตรวจนี้ ดู §4.19)

**mapping ที่ห้ามพลาด (ไม่เปลี่ยน):** `branch` เป็นตัวตั้ง แล้ว derive `subject` เสมอ

### 5.3 RPC หลักที่เพิ่มมาใหม่ (แยกตามระบบ — ดูรายละเอียดสูตรในหมวด §4 ที่เกี่ยวข้อง)

**Boss Raid:** `create_boss_raid_session` `join_boss_raid_session` `select_boss_raid_pet`
`start_boss_raid_game` `get_next_boss_raid_question` `submit_boss_raid_answer`
`submit_boss_raid_event_answer` `submit_chosen_warrior_answer` `dismiss_boss_raid_event`
`compute_boss_raid_stat_snapshot` `distribute_boss_raid_rewards` `get_boss_raid_summary`
`get_boss_raid_participant_display` `get_boss_raid_rewards` `is_boss_raid_member`
`gen_boss_raid_join_code`

**PvP:** `create_pvp_challenge` `accept_pvp_challenge` `decline_pvp_challenge` `cancel_pvp_challenge`
`draw_pvp_cards` `assign_pvp_card` `start_pvp_answer` `submit_pvp_card` `_pvp_resolve_round`
`_draw_pvp_hand` `_pvp_grant_tickets` `_pvp_refund_ticket_on_challenge_close` `pvp_gc`
`pvp_gc_round_timeouts` `is_pvp_match_member`

**Question Factory:** `question_factory_create_run` `_start_run` `_claim_run` `_command_run`
`_control_run` `_next_work_order` `_transition_text_slot` `_configure_run_budget`
`_reserve_run_budget` `_release_run_lease` `_renew_run_lease` `_register_asset` `_record_asset_qc`
`_record_human_review` `_promote_asset` `_publish_draft` `_activate_draft` `_complete_run`
`_reconcile_run` `_verify_staging_object` `_enforce_slot_revision_limit`

**Guest/บัญชี:** `cleanup_abandoned_guest_accounts` `delete_own_account`

### 5.4 RLS pattern (ไม่เปลี่ยนจาก v1.0)
การเขียนทุกอย่างผ่าน `SECURITY DEFINER` RPC เท่านั้น · `questions` ไม่มี SELECT RLS สำหรับ user (ยัง
ต้อง `createAdminClient()`) — **เพิ่ม guard ใหม่:** `secure_questions_active_reads` +
`remove_question_images_anon_writes` (27 ส.ค., คู่กับ Question Factory)

---

## 6. ไฟล์สำคัญ

> ⚠️ หมวดนี้ตรวจจาก DB ไม่ได้โดยตรง (ต้องดู repo) — คงเนื้อหาเดิมจาก v1.0 ไว้ (ไม่ได้ verify ซ้ำในรอบนี้
> เพราะแชทนี้ไม่มีสิทธิ์ push/pull repo) รายการไฟล์ใหม่ที่เพิ่มมาจากระบบใหม่ **ยังไม่ยืนยันชื่อไฟล์จริง**

| ไฟล์ (v1.0 เดิม) | หน้าที่ |
|---|---|
| `src/lib/exp.ts` | สูตร EXP · 🔒 protected (ยกเว้น exception `source='pvp'` ข้าม soft-cap — ต้อง verify ว่า apply แล้วจริง) |
| `src/lib/evolution.ts` | threshold · `SUBLINE_MULTIPLIER` · `computeRawStats()` — 🔒 protected (ยกเว้น `computeRawStats`) |
| `src/lib/petLine.ts` | `artLane()` — แกนของระบบ senior |
| `src/lib/gradeBand.ts` | choke point ของ band |
| `src/lib/petImage.ts` | `getPetImagePath()` |
| `src/app/quiz/actions.ts` | `submitAnswer()` / `finishQuizRound()` |
| `src/app/pet/actions.ts` | `collectPet()` · `choosePersonalityAfterEvolve()` |

**ไฟล์ใหม่ที่คาดว่ามีตามระบบใหม่ (ชื่อยังไม่ยืนยัน 100% — อนุมานจากโครงสร้าง RPC):**
`RaidObstacleQuizScreen.tsx` / `RaidBossScreen.tsx` (ท้าทาย, ยังไม่ยืนยันว่ารับ `image_url` แล้ว) ·
คอมโพเนนต์จอทีวี Boss Raid (ยังไม่ยืนยัน) · หน้า `/pvp` หรือ `/duel` (ชื่อ route ยังไม่ยืนยัน)

**Design tokens (ไม่เปลี่ยน):** `bg` `card` `border` `text`/`text2`/`text3` `amber` `amber-dim` `gold`
`gold-dim` `gold-hi` `indigo` `indigo-dim` `indigo-hi` `red` `track`

---

## 7. แผนในอนาคต

### 7.1 ลำดับความสำคัญสูงสุด — ปัญหา game design ที่ค้างมานาน (ไม่เปลี่ยนจาก v1.0)

**(1) stage 4 คือกำแพง** — ตอนนี้มี 5 ระบบรองรับหลัง stage 4 แล้ว (ผจญภัย/ท้าทาย/achievement/Boss
Raid/PvP) มากกว่า v1.0 ที่มีแค่ 3 — แต่ยังไม่มีข้อมูล retention เจาะจงพอจะสรุปว่าช่วยได้แค่ไหน ยิ่งสำคัญ
ขึ้นเพราะ §7.2 ด้านล่างชี้ว่าแม้มีระบบเยอะขึ้น การมีส่วนร่วม (achievement) ของผู้เล่นใหม่กลับเป็นศูนย์

**(2) จอฉลอง stage 4 แยก** — ยังค้างเหมือนเดิม ไม่เปลี่ยนสถานะ

**(3) เปิดฟักซ้ำหลังเก็บสัตว์ทุกครั้ง** — ยังค้างเหมือนเดิม

### 7.2 ⚠️ ปัญหาใหม่ที่พบในรอบตรวจนี้ — Achievement ไม่มีผู้เล่นใหม่แตะเลย

**ข้อเท็จจริงจาก DB:** ตั้งแต่ v1.0 (15 ส.ค.) ถึงตอนนี้ (6 ก.ย.) บัญชีเพิ่มขึ้น **+116 คน** (126→242)
แต่จำนวนคนที่เคยปลดล็อก achievement **ยังคงเป็น 95 คนเท่าเดิมเป๊ะ** — ปลดล็อกเพิ่มขึ้นแค่ 4 ครั้ง (จาก
1,032 → 1,036) ทั้งหมดมาจากผู้เล่นเก่ากลุ่มเดิม **ไม่มีผู้เล่นใหม่แม้แต่คนเดียวที่เคยเปิดหน้า
`/achievements`**

**ปอนด์ตอบ (6 ก.ย.): "ไว้ค่อยแก้"** — รับทราบเป็นปัญหาจริง แต่เลื่อนไปทำทีหลัง ไม่ใช่ priority ตอนนี้
บันทึกไว้เป็น backlog ที่มีข้อมูลชัดรองรับแล้วว่าเป็นปัญหา (ต่างจาก v1.0 ที่ยังไม่มีข้อมูลสรุปเรื่อง
achievement adoption rate ของผู้เล่นใหม่)

**ข้อสังเกตเพิ่มเติมที่เกี่ยวโยงกัน:** กิจกรรมรวมทั้งระบบกำลังลดลงในช่วงเดียวกัน (ดู §7.3) — เป็นไปได้ว่า
ผู้เล่นใหม่จำนวนมากที่เพิ่มเข้ามาช่วง ส.ค. (จาก closed testing / เปิดตัวแอป) ยังไม่ได้ engage ลึกพอจะ
เจอ achievement เลย ไม่ใช่แค่ปัญหาการออกแบบ pull-based เพียงอย่างเดียว

### 7.3 กิจกรรมผู้เล่นรายสัปดาห์ลดลง — บริบท: ใกล้ปิดเทอม/ช่วงสอบ

**ข้อมูลจริง (attempts/สัปดาห์, Bangkok week):**

| สัปดาห์เริ่ม | attempts | ผู้เล่น |
|---|---|---|
| 3 ส.ค. | 5,061 | 79 |
| 10 ส.ค. | 4,975 | 56 |
| 17 ส.ค. | 2,827 | 55 |
| 24 ส.ค. | 2,297 | 58 |
| 31 ส.ค. (ยังไม่ครบสัปดาห์ ณ วันเขียน) | 1,078 | 26 |

**ปอนด์ยืนยัน (6 ก.ย.): ช่วงนี้ใกล้ปิดเทอม/ช่วงสอบ** — เป็นบริบทตามฤดูกาลการเรียน ไม่ใช่สัญญาณปัญหา
product โดยตรง บันทึกไว้เพื่ออ้างอิงเทียบกับข้อมูลสัปดาห์ถัดๆ ไปหลังเปิดเทอมใหม่ ว่ากิจกรรมกลับมาตาม
คาดหรือไม่ — **ไม่ควรตีความตัวเลขนี้เป็น retention ที่แย่ลงจริงจนกว่าจะเทียบกับหลังเปิดเทอม**

### 7.4 Qmon AI fallback rate แย่ลง (§4.7) — ยังไม่สืบสาเหตุ

จาก 31.7% (บันทึกไว้ระหว่าง v1.0) กลับขึ้นไป 42.7% (53/124 ข้อความ) — ยังไม่ได้ตรวจว่าเกี่ยวกับโควตา
Gemini API ที่ต้องแบ่งกับ Question Factory (§4.19) ที่เปิดใช้งานหนักขึ้นช่วงเดียวกันหรือไม่ ควรตรวจ
`error_reason`/`latency_ms` ใน `qmon_messages` ต่อ

### 7.5 คำถามเปิดที่ค้างไว้ (ตามที่ปอนด์ระบุ 6 ก.ย. — ยังไม่ตรวจในรอบนี้)

- Raid image ชั้น JSX (`RaidObstacleQuizScreen`/`RaidBossScreen`) แสดงรูปจริงหรือยัง — SQL/RPC พร้อมแล้ว
- Push notification verify รอบสอง (ชน quiet hours) + หน้า settings toggle บนจอจริง
- Boss Raid TV screen mockup v7 + ระบบเสียง (SFX/BGM) — สถานะล่าสุด
- Native app: iOS Apple Developer Program / Android Play Store Google Developer Verification — คืบหน้าถึงไหน
- English subject: 3 คำถามเปิดเดิม (ออกใน Boss Raid ไหม / junior+senior หรือแค่อันใดอันหนึ่งก่อน / EXP เท่ากันไหม)
- gear same-stat auto-unequip toast (v1.0.1 เดิม) — implement แล้วหรือยัง
- Boss Raid escalate ความยากอัตโนมัติของ topic-select — เกณฑ์ accuracy/hysteresis เคาะหรือยัง

### 7.6 ห้อง Boss Raid ที่ค้างจริง (`28e73bca`) — ต้องมีทางแก้เชิงระบบ

ยืนยันจากปอนด์ว่าเป็นห้องเล่นจริงที่เล่นไม่จบ (ไม่ใช่ทดสอบลืมปิด) — สะท้อนว่า**ระบบยังไม่มีกลไก
timeout อัตโนมัติหรือปุ่ม "จบห้องฉุกเฉิน" ให้ครู** เมื่อห้องค้างกลางคาบ (เช่น หมดเวลาเรียน, เน็ตหลุดทั้งห้อง)
ควรพิจารณาเพิ่มในสไลซ์ถัดไปของ Boss Raid — ไม่กระทบเด็ก แต่กระทบครูที่ต้องรอ/ไม่มีทางปิดห้องเองได้ทันที

---

## 8. Technical debt / จุดเสี่ยงที่ต้องรู้

> รายการ #1-18 จาก v1.0 ไม่เปลี่ยนสถานะ (อ้างอิงไฟล์เดิมได้) ยกเว้นที่ระบุใหม่ด้านล่าง

| # | เรื่อง | สถานะ v1.5 |
|---|---|---|
| 15 (เดิม) | สเตตัส scaling FOC/SPD ไม่สมดุล | ✅ **ปิดแล้วจริง** — apply + backfill แล้ว ผลตรงเป้า |
| 18 (เดิม) | gear same-stat auto-unequip ไม่มี toast | ⏳ ยังไม่ยืนยันสถานะ (ค้างไว้ก่อน) |
| 19 (ใหม่) | `raid_allowlist` (178 แถว) และ `pvp_allowlist` (4 แถว) เหลือค้างในตารางแต่ไม่มีผลจริงกับ RPC แล้ว | ต่ำ — ตารางไม่ถูกลบ ไม่ก่อความเสียหาย แต่สร้างความสับสนถ้าใครมาอ่าน schema ทีหลังคิดว่ายัง gate อยู่ ควรมี comment กำกับหรือ drop ทิ้งเมื่อมั่นใจว่าไม่ใช้แล้ว |
| 20 (ใหม่) | Boss Raid ไม่มีกลไก timeout/force-end ห้องที่ค้าง | กลาง — ดู §7.6 |
| 21 (ใหม่) | Push notification ยังไม่มี event สำหรับ PvP ("คำท้าใหม่"/"ถึงตาคุณ") ทั้งที่ดีไซน์ระบุไว้ชัด | กลาง — ฟีเจอร์ async ที่พึ่ง push แจ้งเตือนเป็นหลัก ถ้าไม่มี push คนอาจไม่รู้ตัวว่าถึงตาต้องเล่น |
| 22 (ใหม่) | senior biology คำถาม active โต +200 ข้อ (400→600) เร็วผิดปกติเทียบกับ physics/chemistry | ต่ำ→ควรถาม — ไม่ใช่บั๊ก แต่ที่มาไม่ชัดเจนจาก pipeline ที่มองเห็น |
| 23 (ใหม่) | Qmon AI fallback rate แย่ลงจาก 31.7%→42.7% หลัง Question Factory เริ่มใช้ Gemini หนักขึ้น | กลาง — อาจเป็น quota contention ระหว่าง 2 ระบบที่ใช้ Gemini free tier ร่วมกัน ยังไม่ยืนยัน |
| 24 (ใหม่) | Achievement adoption = 0% สำหรับผู้เล่นใหม่ทั้งหมดตั้งแต่ v1.0 | กลาง — ปอนด์รับทราบแล้ว "ไว้ค่อยแก้" (ดู §7.2) |

---

## 9. กฎการทำงาน (ไม่เปลี่ยน)

### 9.1 Workflow
**Survey → Draft → Confirm → Execute → Verify** — ห้ามข้ามเฟส ห้ามแก้โค้ดก่อน survey · หยุดให้ตรวจ
ทีละเฟสสำหรับงานที่แตะ production ไม่รันรวดเดียว

### 9.2 ข้อห้ามเด็ดขาด
- 🔒 **ห้ามแก้** `src/lib/exp.ts` และ `src/lib/evolution.ts` (ยกเว้น exception ที่อนุมัติแล้วเป็นจุดๆ:
  `computeRawStats()` ใน evolution.ts, และ `source='pvp'` soft-cap skip ใน exp.ts)
- **ห้ามให้ AI/agent จัดการ credential**
- **ห้าม apply migration เข้า production โดยไม่มีไฟล์ใน repo คู่กัน**
- **ห้าม log ข้อความ AI ลง `analytics_events`** — ใช้ `qmon_messages`
- **มีเด็กจริง 242 คนใช้งานอยู่** (junior 167 / senior 67) ทุกการแก้ต้องพิสูจน์ว่าไม่กระทบผู้ใช้จริง
- **Browser verification เท่านั้นที่นับเป็นหลักฐานปิดงาน** — SQL/build ผ่านไม่นับ (ย้ำจากบทเรียน Boss Raid)
- **Test session/account ต้องลบออกก่อนเก็บ baseline จริง** — ใช้บัญชีเทสเท่านั้น ห้ามใช้บัญชีนักเรียนจริง

### 9.3 บทเรียนที่ต้องจำ (สะสมจาก v1.0 + เพิ่มใหม่)

รายการเดิมจาก v1.0 (DB source of truth, PostgREST 1000-row cutoff, race condition, Bangkok timezone,
`CREATE OR REPLACE FUNCTION` overload, migration timestamp, Next.js router.push+refresh,
`track()` server-side no-op, `balanced` vs `balance`, `quiz_attempts.question_id` bigint, answer bias,
browser test) **ยังใช้ได้ทั้งหมด ไม่เปลี่ยน** — เพิ่มบทเรียนใหม่จากรอบนี้:

| เรื่อง | สิ่งที่ต้องทำ |
|---|---|
| **draft ของ Claude มักไม่ตรง 100% กับ base function ล่าสุดใน prod** | ทุกครั้งที่ร่าง migration ต้อง diff เทียบ `pg_get_functiondef` ของจริงก่อนส่งให้ Claude Code apply เสมอ (ย้ำจากบทเรียน `total_damage` migration ที่ค้างเพราะยังไม่ diff) |
| **allowlist gate อาจอยู่ 2 ชั้น** | ชั้น DB function (WHERE clause จริง) กับชั้น RLS ของตาราง allowlist เอง (ใช้เป็น client-side feature flag) — ต้องแก้ทั้งคู่เวลาเปิดฟีเจอร์เต็มรูปแบบ ไม่ใช่แค่ชั้นเดียว (เจอเคสจริงกับทั้ง raid และ pvp) |
| **ตารางค้าง (vestigial) หลังถอด gate ออก** | เมื่อถอด allowlist check ออกจาก RPC แล้ว ตารางเดิมยังอยู่และมีข้อมูลเก่าปนอยู่ — ต้องบันทึกชัดว่า "มีอยู่แต่ไม่มีผลแล้ว" กันคนงงตอนอ่าน schema ทีหลัง |
| **Gemini free tier เป็นทรัพยากรร่วมที่แย่งกันได้** | Qmon AI chat + Question Factory generate ใช้โควตาเดียวกัน — เพิ่มงานฝั่งหนึ่งกระทบอีกฝั่งได้ (สงสัยว่าเป็นสาเหตุ fallback rate สูงขึ้น ยังไม่ยืนยัน) |
| **ห้องเรียน/แมตช์แบบ async ที่ไม่มี timeout อาจค้างถาวร** | ต้องออกแบบทางออกฉุกเฉินให้ครู/ผู้เล่นเสมอ (Boss Raid ยังไม่มี — ดู §7.6) |

---

## 10. เอกสารอื่นในโปรเจกต์

**เอกสารที่ใช้อ้างอิงคู่กับ GDD v1.5 นี้ (24 ไฟล์ใน project knowledge ณ วันเขียน):**

| ไฟล์ | สถานะ |
|---|---|
| `idle-dungeon-design-2026-08-03-final.md` | ใช้งานจริง (§4.11) |
| `challenge-system-design-2026-08-06-v3.md` + `raid-naming-handoff` + `raid-obstacles-copy` | ใช้งานจริง (§4.12) — allowlist gate ถูกถอดแล้ว ต้องอัปเดตความเข้าใจ |
| `quizmon-achievement-system-design.md` | ใช้งานจริง (§4.13) — แต่ adoption ผู้เล่นใหม่ = 0% (§7.2) |
| `quizmon-profile-friends-system-design.md` | ใช้งานจริง (§4.14) |
| `qmon-naming-conventions.md` | กฎการตั้งชื่อทั้งหมด ยังใช้ได้เต็มที่ |
| `stat-formula-VERIFIED-2026-08-05.md` | สูตรเดิมก่อนจูน FOC/SPD — ใช้อ้างอิงประวัติได้ สูตรปัจจุบันดู §3.5 ของเล่มนี้ |
| `senior-subline-implementation-plan-2026-07-26.md` | งานเสร็จแล้ว เก็บไว้อ่านเหตุผลสถาปัตยกรรม Option C |
| `handoff-stat-tuning-foc-spd-2026-08-15.md` | งาน v1.0.1 เดิม — **ปิดงานแล้ว** ดู §3.5 |
| `classroom-boss-raid-design-2026-08-28-v2.md` | ต้นฉบับ Boss Raid (§4.15) — sync mode ที่ตัดออกยังตรง |
| `boss-raid-phase1-context-2026-08-31.md` | บริบท Boss Raid Phase 1 — **ล้าสมัยบางจุดแล้ว** (เขียนว่า reward/summary "ยังไม่เริ่ม" ซึ่งตอนนี้ implement แล้ว — ดู §4.15) |
| `claude_pvp-system-design-2026-09-03-draft.md` | ต้นฉบับ PvP (§4.16) — มติที่ล็อกไว้ตรงกับที่ implement จริงเกือบทั้งหมด |
| `pvp-phase-plan-2026-09-03.md` + `pvp-status-2026-09-04-pre-slice2.md` | แผนสไลซ์ PvP — **ทุกสไลซ์ปิดแล้ว** (ตอนเขียนเอกสารนี้ยังเหลือแค่สไลซ์ 2-5 ที่ยังไม่เริ่ม ตอนนี้เสร็จหมด) |
| `QuizMon-Push-Notification-Design.md` | ต้นฉบับ Push (§4.17) — locked baseline ยังตรง ยกเว้น PvP push ที่ยังไม่ implement |
| `claude_topic-select-practice-design-2026-08-26.md` | ต้นฉบับเลือกบทฝึกฝน (§4.18) — **มติเรื่อง leaderboard เปลี่ยนจากที่เอกสารเขียนไว้** (ดู §4.18) |
| `claude_junior-curriculum-grade-mapping-2026-08-27.md` | mapping หลักสูตร junior — เสร็จสมบูรณ์ 100% ตามที่บันทึก |
| `claude_image-question-pilot-2026-08-27.md` | pilot รูปภาพคำถาม — ตอนนี้มี 299 ข้อมีรูปแล้ว (junior เท่านั้น) |
| `claude_closed-testing-launch-plan-2026-08-25.md` + `claude_play-console-content-2026-08-25.md` + `claude_privacy-policy-draft-2026-08-25.md` | เอกสาร launch Android — สถานะปัจจุบันยังไม่ยืนยัน (§7.5) |
| `claude_quizmon-tester-list-2026-08-26.csv` | รายชื่อ tester |

---

## ภาคผนวก A: สรุปการตัดสินใจสำคัญที่ปิดระหว่างทำเอกสารฉบับนี้ (6 ก.ย. 2026)

| เรื่อง | การตัดสินใจ |
|---|---|
| topic_select ไม่นับ leaderboard สัปดาห์ | **ตั้งใจ** — ยืนยันเป็นมติสุดท้าย ไม่ใช่หลุด (แก้จากที่เอกสาร 26 ส.ค. เคยเขียนตรงข้าม) |
| Achievement adoption = 0% สำหรับผู้เล่นใหม่ทั้งหมด | รับทราบเป็นปัญหาจริง — **"ไว้ค่อยแก้"** ไม่ใช่ priority ตอนนี้ |
| กิจกรรมผู้เล่นลดลงต่อเนื่อง 5 สัปดาห์ | มีบริบท **ใกล้ปิดเทอม/ช่วงสอบ** รองรับ ไม่ตีความเป็นสัญญาณ product แย่ลงจนกว่าจะเทียบหลังเปิดเทอม |
| Boss Raid TV UI / ระบบเสียง / native app store / raid image ชั้น JSX / English subject | **ค้างไว้ก่อน** — เป็นคำถามเปิดที่ตรวจจาก DB ไม่ได้ ไม่ใช่การยืนยันว่าเสร็จหรือไม่เสร็จ |
| ห้อง Boss Raid `28e73bca` ที่ค้าง in_progress | **เป็นห้องเล่นจริงที่เล่นไม่จบ** ไม่ใช่ทดสอบลืมปิด — เก็บข้อมูลไว้ ไม่ลบ แต่ชี้ปัญหาเชิงระบบ (§7.6) |
| ระบบรางวัล + หน้าสรุปผล Boss Raid | ยืนยันจาก DB ว่า **implement จริงแล้ว** ไม่ใช่ "ยังไม่เริ่ม" ตามบริบท 31 ส.ค. |
| บั๊ก `crystal_damage` double-dip | ยืนยันว่า **แก้เข้า production แล้ว** ไม่ใช่ "รอ apply" ตามความจำเดิม |
| `combo_burst` trigger จริงหรือยัง | ยืนยันว่า **trigger แล้ว 2 ครั้ง** ไม่ใช่ "ยังไม่เคย" ตามความจำเดิม |

---

## ภาคผนวก B: ประวัติเอกสาร (changelog)

**v6 → v7 (26 มิ.ย. → 2 ส.ค. 2026):** grade band, คลังคำถาม ม.6, subline senior, Qmon AI (Gemini),
weekly leaderboard แยก band + ไข่ legendary, Hall of Fame, แบบสำรวจ

**v7 → v1.0 (2 ส.ค. → 15 ส.ค. 2026):** ผจญภัย, ท้าทาย, Achievement, Profile & Friends · ไข่ rare/epic ·
บัญชี 66→126 · migration drift · จูนสูตร FOC/SPD (ตัดสินใจแล้ว รอ implement)

**v1.0 → v1.5 (15 ส.ค. → 6 ก.ย. 2026):** จูนสูตร FOC/SPD apply+backfill จริง · **5 ระบบใหม่**: Classroom
Boss Raid (Phase 0-2 ครบ), ประลอง/PvP (สไลซ์ 1-5 ครบ), Push Notification (2 รอบ/วัน + adventure/friend
event), เลือกบทฝึกฝน + คลังหลักสูตร 96 บท, Question Factory (AI content pipeline เต็มรูปแบบ) · Guest
Mode เพิ่งขึ้น production · allowlist gate ถูกถอดออกจากทั้งท้าทายและประลอง (เปิดเต็มทุกคน) · บัญชี
126→242 · แก้ไขความเข้าใจผิดสะสม 3 จุด (crystal_damage bug, combo_burst trigger, reward/summary system
ของ Boss Raid) · พบปัญหาใหม่ 2 จุด (achievement adoption ผู้เล่นใหม่=0%, ห้อง Boss Raid ค้างไม่มี
force-end) · custom domain `quizmon.xyz` ใช้งานจริงแล้ว
