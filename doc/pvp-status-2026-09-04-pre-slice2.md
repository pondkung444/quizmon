# QuizMon "ประลอง" (PvP) — สถานะล่าสุด ณ 4 ก.ย. 2026 (ก่อนเริ่มสไลซ์ 2)

> เอกสารนี้สรุปทุกอย่างที่ตัดสินใจ/ทำไปแล้วในสไลซ์ 1 เพื่อให้แชทใหม่สานงานต่อได้โดยไม่ต้องเล่าซ้ำ
> อ้างอิงคู่กับเอกสารที่มีอยู่แล้วในโปรเจกต์: `claude_pvp-system-design-2026-09-03-draft.md` (ดีไซน์เต็ม) และ `pvp-phase-plan-2026-09-03.md` (แผนแบ่งสไลซ์เดิม 1-5)

---

## สถานะ: สไลซ์ 1 ("ลูปที่เล่นจบได้") ปิดแล้ว — merge เข้า main แล้ว (PR #104, 7 commits)

**พร้อมเริ่มสไลซ์ 2 (เอฟเฟกต์การ์ด) ได้ทันที** — ตาม `pvp-phase-plan-2026-09-03.md` §2

---

## Schema/RPC จริงที่ apply แล้วบน `wmndxiuqzrnqbhrznmfg` (verify แล้ว ไม่ใช่แค่แผน)

- ตาราง: `pvp_allowlist`, `pvp_challenges`, `pvp_matches`, `pvp_match_cards`
- คอลัมน์เพิ่ม: `quiz_attempts.pvp_match_id` (uuid) + ขยาย `source` CHECK เพิ่ม `'pvp'`
- RLS: member-scoped, เขียนได้ผ่าน RPC เท่านั้น, มี realtime publication + replica identity
- RPC: `create/accept/decline/cancel_pvp_challenge`, `draw_pvp_cards`, `assign_pvp_card`, `submit_pvp_card`, `pvp_gc`, internal `_draw_pvp_hand`
- Deviation จาก handoff เดิม: แยก `submit_pvp_card` เดิมเป็น `assign_pvp_card` (ฝั่งท้าเลือกโจทย์ให้) + `submit_pvp_card` (ฝั่งรับตอบจริง) — เพราะเป็นคนละ action ของคนละคน
- EXP: log เข้า `quiz_attempts` (`source='pvp'`) เท่านั้น **ไม่แตะ pet โดยตรง** — ยังไม่มี exp.ts exception (ของสไลซ์ 3)
- `current_round` นับ +1 ต่อการ์ด 1 ใบที่ตอบ (ไม่ใช่ 1 ยกสมบูรณ์ 2 ฝั่ง) — ยังไม่ verify ว่าตรงกับ "เพดาน 30 ยก" ที่ตั้งใจไว้ 100% ควรเช็คอีกทีตอนเริ่มสไลซ์ 2 ถ้าเกี่ยวข้องกับจังหวะจบแมตช์

## Interface ที่ล็อกแล้ว (ห้ามรื้อ)

```ts
// src/lib/pvp/stats.ts
function pvpEffectiveStat(pet, stat: 'hp'|'atk'|'def'|'spd'|'foc'): number
// สไลซ์ 1-3: return raw + 0 เสมอ
// สไลซ์ 4 (อุปกรณ์ PvP) จะเติมโบนัสอุปกรณ์ตรงนี้จุดเดียว — ยังไม่เริ่ม
```

```ts
type PvpCard = {
  id: string;
  chapter: string;
  subject: string;
  difficulty: number;
  effect_id: string | null; // สไลซ์ 1: null เสมอ — สไลซ์ 2 เติมค่าจริง 6 แบบ
  question_id: number | null;
};
```

## Mechanic ที่แก้จาก handoff เดิม (สำคัญ — อย่าเข้าใจผิดว่า SPD ตัดสินตาแรก)

- **ตาแรกของแมตช์ = ฝั่งรับ (คนกดตอบรับคำท้า) เสมอ** ไม่ใช่ SPD สูงกว่า (แก้ไปจาก handoff เดิมที่เคยเขียนผิดไว้)
- **SPD ทำหน้าที่เดียว:** กำหนดความยาว timer ต่อยก — `timer_seconds = 60 + round(pvpEffectiveStat(current_turn_pet,'spd')/20)`
- เลขดาเมจ/timer อื่นๆ (ATK, DEF, crit จาก FOC) **ยังเป็นเลขชั่วคราวที่ยังไม่จูน** อยู่ในโค้ดพร้อม comment กำกับไว้ — จะจูนจริงหลังมีข้อมูลเล่นจริงหลายแมตช์ ไม่ใช่ตอนนี้

## UI/UX ที่ทำไปแล้ว (ผ่านการเทสจริงในเบราว์เซอร์ verify แล้ว)

- หน้าดวลแบบ "arena" 2 คลัสเตอร์ชิดมุม (เราซ้ายล่าง/คู่ต่อสู้ขวาบน), VS กลาง, glow สีต่างฝั่ง (เราน้ำเงิน คู่ต่อสู้แดง), glow ตามตาใคร, idle bob animation ทั้งสองฝั่ง (เยื้องเฟส, guard `prefers-reduced-motion`)
- Panel คำถาม/ช้อยแยกจาก arena: radio indicator, chip วิชา/บท, timer เป็นแถบลดลงเหนือคำถาม (ไม่ใช่นาฬิกามุมจอ), spacing กว้างขึ้น, font Sarabun
- ตัวเลือกคำตอบเป็น **list แนวตั้ง ไม่ใช่ grid 2×2** (ตัดสินใจแล้วว่า grid ใช้ไม่ได้เพราะช้อยบางอันยาว)
- แก้ layout bug ไปแล้ว 4 รอบ (A.1 กล่องขยับสูง → A.3 ชื่อยาวล้นทับ HP → A.4 **ความกว้าง**ทั้งคอลัมน์หดตามเนื้อหา panel ล่าง) — ทั้งหมด verify ผ่านจริงใน production (`quizmon.xyz`) แล้ว ไม่ใช่แค่ build ผ่าน
- ชื่อ Qmon ยาวสุดที่เทสแล้วไม่พัง: `MegaPlutoniumPikachu` (อังกฤษ) และ `น้องเมล่อนมินิคิ้วท์` (ไทย) — truncate + ellipsis ทำงานถูกต้อง

## ยังไม่ทำ (ตั้งใจเว้นไว้ตามสโคปสไลซ์ 1)

- เอฟเฟกต์การ์ด (สไลซ์ 2 — งานถัดไป)
- ตั๋วเข้าเล่น + `exp.ts` exception ข้าม soft-cap สำหรับ `source='pvp'` (สไลซ์ 3)
- อุปกรณ์ PvP แยกชุดจาก raid (สไลซ์ 4 — ปอนด์ยืนยันแล้วว่ารอได้ ไม่ต้องดึงมาก่อน)
- เมนูล่าง/entry point จริง — ตอนนี้เข้าผ่าน URL ตรง (`/pvp`) เท่านั้น ยังไม่มีปุ่มในเมนูล่าง (สไลซ์ 5)
- **Decision ที่ล็อกไว้แล้วสำหรับสไลซ์ 5:** ย้ายหอเกียรติยศเข้าไปอยู่ในกลุ่มปุ่มของแท็บ "อันดับ" หน้าสังคม (หลัง "การฝึกประจำสัปดาห์/ความสม่ำเสมอ/Achievement/นักสะสม Qmon") แล้วเอาปุ่ม "ประลอง" มาแทนที่ปุ่มหอเกียรติยศเดิมในเมนูล่าง 4 ปุ่ม

## กติกา/ข้อจำกัดที่ยังใช้อยู่เหมือนเดิม (ย้ำไว้กันหลุด)

- Workflow: Survey → Draft → Confirm → Execute → Verify — ห้ามข้ามขั้น, verify ต้องเป็นเบราว์เซอร์จริงเท่านั้น
- แชทนี้ไม่มี git push/merge credential — ปอนด์กด Merge เองที่ GitHub ทุกครั้ง
- ห้ามแก้ `src/lib/exp.ts` / `src/lib/evolution.ts` นอกเหนือ exception ที่ระบุไว้ (ยังไม่ถึงจุดที่ต้องแก้จนกว่าจะถึงสไลซ์ 3)
- Junior/senior guard ต้องใช้ `profiles.grade_band` **ห้ามใช้ `questions.subject`** (senior ฟิสิกส์เก็บเป็น `subject='math'`)
- `friendships` เก็บคู่แบบ normalized `(user_id_low, user_id_high)` — query ต้อง sort UUID ก่อนเช็คเพื่อน
- บัญชีทดสอบที่ใช้ได้: PonDKunG (`792b8e1d`, junior), Dawu (`b497d6dd`, junior), Daou/ต้าอู๋ห์ (`abbc806f`, senior), ซันซัน (`a966f038`, junior) — **ห้ามใช้บัญชีนักเรียนจริงทดสอบเด็ดขาด**
