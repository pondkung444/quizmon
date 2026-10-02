# Prompt ส่งต่องาน — วิเคราะห์ผลซิม QuizMon 2048

> คัดลอกทั้งบล็อกด้านล่างไปวางในแชท Codex ใหม่

```
ภารกิจ: วิเคราะห์ผลจำลอง (simulation) ของเกม QuizMon 2048 เพื่อเตรียมจูนสมดุล ตอบเป็นภาษาไทย

## ที่อยู่ข้อมูล
repo pondkung444/quizmon (workspace ในเครื่อง C:/Users/ASUS FX505/Documents/study-pet-game)
branch claude/2048-sim-kit โฟลเดอร์ output/2048-sim/
(ถ้า branch ยังไม่ merge ให้ checkout/worktree แยก อย่า reset/stash/discard งานค้างในเครื่อง)

## อ่านตามลำดับนี้ก่อนทำอะไร
1. output/2048-sim/HANDOFF.md — บริบท กับดัก ข้อสังเกตเบื้องต้น งานถัดไป คำถามค้าง
2. output/2048-sim/results/main-p0.7/REPORT.md — ตารางสรุปหลัก + ข้อจำกัด + validation
3. output/2048-sim/README.md — data dictionary ของทุกคอลัมน์
4. output/2048-sim/FINDINGS-engine-vs-design.md — จุดที่เอนจินต่าง/กำกวมจากดีไซน์
5. Notion (ดีไซน์ล็อก = Source of Truth ของสกิล):
   https://app.notion.com/p/3ec7cdca67f181dbabe0dc6a955850b7
   และ https://app.notion.com/p/3eb7cdca67f181eeb272c1a75a0fec0e , https://app.notion.com/p/3ec7cdca67f1814ab2a4dd3232746743

## ข้อมูลที่มี
- results/main-p0.7/ (ควิซตอบถูก 70%), sens-p0.5/, sens-p0.9/ — แต่ละชุด 25,200 run (42 ร่าง × 3 policy × 200 seed)
  ใน git มีเฉพาะ REPORT.md, run-config.json, summary/*.csv
- ไฟล์ดิบ runs.csv / rooms.csv / relic_events.csv ไม่อยู่ใน git (ใหญ่) สร้างใหม่ได้ ~8 นาที:
    cd output/2048-sim
    node sim.mjs --seeds 200 --label main-p0.7
    node summarize.mjs results/main-p0.7
  (Node >= 22.18; ผลเป็น deterministic: คำสั่งเดิม = CSV เดิมทุกไบต์)
- ถ้าต้องการเฉพาะบางร่าง: --forms egg6 --policies greedy --seeds 50 --label ชื่อใหม่ (ห้ามเขียนทับ results/main-p0.7)

## ข้อมูลสรุปที่ได้แล้ว (bot-only — เป็นสมมติฐาน ไม่ใช่ข้อสรุป)
- win rate Stage 4: Common/Rare ≈0%, Epic 1.5–9%, Legendary 38–78% มีแค่เทพ(egg3)/ธรา(egg6) ที่ชนะจริง
- run ส่วนใหญ่แพ้ห้อง 2–4; ถึงกวางแค่ ~32–41%; run ที่ชนะใช้ ~3–6 นาที(ประมาณ) เทียบเป้า 10–15
- สกิล Auto ให้ดาเมจแค่ ~13–17% ของทั้งหมด; กระดานตัน ~5–10% ของ HP ที่เสีย

## งานที่ขอ (เรียงตามความสำคัญ)
1. ตรวจสอบก่อนเชื่อ: ลองสุ่มตรวจ 3–5 run จาก rooms.csv/runs.csv ว่าตัวเลขสอดคล้องกติกาใน Notion และ harness
   (ctx-driver.js ไม่แก้กติกา; ส่วนที่คัดลอกจาก run.js ติดป้าย "MIRROR run.js") รายงานถ้าเจอ bug ของ harness
2. หาสาเหตุที่ Common/Rare แพ้ห้อง 2–3 (ดู rooms.csv: enemy_hp_lost, moves, total_dmg เทียบ enemy_hp_max) แยกว่าเป็นปัญหาดาเมจพื้นฐาน, bot, หรือค่าศัตรู
3. วิเคราะห์ประโยชน์ของสกิลรายร่าง (skill_dmg/armor/heal_share, casts_per_100_swipes) หาสกิลที่แทบไม่มีผล / แรงเกิน
4. ทำ ablation `--no-auto` (เพิ่ม flag ใน ctx-driver.js/sim.mjs ที่ปิด autoSkill เฉพาะ Stage 4) เพื่อแยกผลของ Auto จาก stat
5. (ถ้าทำได้) bot ที่เก่งขึ้น เช่น lookahead 1 ชั้น หรือเลี่ยงกระดานตัน เพื่อดูว่า win rate ≈0% ของ Common เป็นเพราะ bot หรือเกม
6. สรุปเป็นตาราง/ข้อเสนอสำหรับเจ้าของ: อะไรควรจูนก่อน พร้อมช่วงความเชื่อมั่น ไม่ใช่ค่าเดียว

## กฎเหล็ก
- ห้ามเปลี่ยนกติกาที่ล็อก ห้ามปรับ stat/สกิล/ค่าเกมเอง แค่วัดและรายงาน (ข้อเสนอปรับค่า = เขียนเป็นข้อเสนอเท่านั้น)
- ผล bot/จัดสถานะไม่ถือเป็นหลักฐานว่าสมดุลผ่าน ต้องเขียนข้อจำกัดนี้ในทุกรายงาน
- ไม่แตะ public/2048, src, production, DB, บัญชีจริง; ไม่เพิ่ม learning counter/EXP/รางวัลใด ๆ
- ไฟล์ใหม่ไว้ใน output/2048-sim/ (ชื่อ results ใหม่) เท่านั้น
- ห้าม commit/push จนกว่าเจ้าของเห็น diff และอนุมัติ; ถ้าจะทำนอกขอบเขตนี้ให้หยุดและถาม
- เปรียบเทียบภายใน policy เดียวกันและจับคู่ด้วย seed (seed เดียวกัน = RNG เกมเดียวกันทุกร่าง)
- ใช้ relic_effect_early.csv สำหรับผลเรลิค (relic_ownership_naive.csv มี survivorship bias)

## คำถามที่ยังค้างกับเจ้าของ (อย่าตัดสินเอง)
1. สกิล "เลขต่ำสุด N ช่อง" ควรข้ามช่องที่เพิ่งเกิดหรือไม่ (FINDINGS #2)
2. ท่าตั้งรับด้วงปัดครึ่งต่อฮิตหรือรวมก่อนปัด (FINDINGS #1)
3. วินาทีต่อปัดจริงจากการเล่น (ตอนนี้สมมติ 1.5–2.5)
4. Common ชนะ ≈0% ที่ห้อง 2–3 ตั้งใจไหม

## รูปแบบผลลัพธ์ที่ต้องส่งกลับ
สรุปไทยสั้น ๆ + ตาราง + path ไฟล์ที่เพิ่ม + รายการสิ่งที่ยังไม่แน่ใจ/ข้อจำกัด
```
