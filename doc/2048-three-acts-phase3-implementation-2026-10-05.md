# QuizMon 2048 — Phase 3: กลไกประจำด่าน
วันที่: 5 ตุลาคม 2026

สถานะ: implement บน branch `codex/2048-three-acts-phase3` จาก main ที่รวมเฟส 2 แล้ว ยังไม่ได้ merge/deploy

## พฤติกรรมที่เพิ่ม
- รันใหม่ที่ `/2048/?journey=three-acts` ขอ `journeyVersion:1, mechanicsVersion:1` รันเฟส 2 และ Endless ที่มีอยู่ยังใช้กฎเดิม; API ปฏิเสธเวอร์ชันที่ไม่รองรับ
- ผลึกถ้ำแยกจากรูน เป็นกำแพงสองชั้น เกิดทุก 4 ปัดที่มีผล (บอส 3 ปัด/เฟสสอง 2 ปัด) cap 2/3 พร้อมเตือนช่องล่วงหน้าหนึ่งปัด ช่องเตือนถูกใช้จะข้ามโดยไม่ย้ายเป้า
- การรวมติดผลึกทุบหนึ่งชั้นต่อก้อนต่อปัด รวมแรงโน้มถ่วง/ลูกโซ่; ชุดโจมตีใช้จำนวนก้อนก่อนทุบ แล้วเหตุการณ์ถัดไปใช้จำนวนหลังทุบ
- ถ้ำชนิดเกราะ/หนัก/ฟื้นตัวได้ผลลดดาเมจ/เพิ่มหมัด/ฟื้น HP ตามก้อนที่ยังอยู่ บอสมีเกราะและพลัง; Auto มาร์คและกระจกไม่ใช้ช่องผลึก
- รูนร้าวฟ้าติด identity รูน เดินตามรูน อายุสามปัด ไม่เลือก newborn จากปัดนั้น มีเลขคู่จึงเลือกได้; รวมจริงช่วยร้าว เพิ่มเลข/เปลี่ยนชนิดไม่ช่วย กระจกไม่คัดลอกรอยร้าว
- รูนร้าวแตกท้ายปัดหลังศัตรูและแรงโน้มถ่วง ลบพร้อมกันก่อนล้างเกราะ/ลด countdown/เพิ่มพิษตามศัตรู ชนิดผลแต่ละอย่างเกิดครั้งเดียวแม้แตกหลายก้อน
- พิษ cap สามชั้น อายุสามปัด ลดดาเมจผู้เล่นและเกราะใหม่ชั้นละ 10% ไม่ลดฮีลหรือเกราะเก่า ไม่หัก HP; ฮีลจากชุดรวมจริงล้างก่อนคำนวณทุก merge ในชุด แม้ HP เต็ม
- ลดพิษที่ปล่อยพลังจริง รวม Auto มาร์ค และผลต่อเนื่อง ไม่ลดค่าที่เก็บใน buff แล้วหักซ้ำตอนปล่อย หนามสะท้อนผ่านเกราะผลึกแต่ไม่ผ่านโทษพิษ
- บอส HP ≤50% ตั้ง pending ครั้งเดียว พร้อมคำเตือน ใช้เฟสสองตั้งแต่ปัดถัดไปที่มีผล ไม่ย้อนเมื่อฮีล กวาง interval 4 ปัด ราก 2→3; ถ้ำและฟ้าเร่งกลไก 3→2 ปัด
- กระดานตัน/ระเบิดล้างผลึกและร้าวแบบ neutral ไม่ให้รางวัลทุบ/ช่วยหรือโทษแตก ชุบเก็บสถานะถ้ายังขยับได้ ชนะล้างสถานะต่อสู้ก่อน carry
- เซฟตรวจสถานะกลไกที่เสียหาย; snapshot/replay เก็บคิวเตือน ชั้นผลึก identity/อายุร้าว พิษ clock และเฟสบอส ใช้ seeded RNG
- เก็บตัวนับเกิด/ทุบผลึก ติด/ช่วย/แตกของรูนร้าว และ neutral clears ต่อห้องใน history เพื่อรองรับการวิเคราะห์ภายหลัง

กรณีแก้กระดานตันแล้วเหลือแต่รูนติดรากจนยังขยับไม่ได้ คลายรากหนึ่งก้อนเพื่อคืน legal move; หากรูนหมดทั้งกระดาน เกิดรูนหนึ่งก้อนด้วย seed เดิม ไม่เสีย HP ซ้ำหรือให้โบนัสเพิ่ม เป็น fallback เฉพาะโหมดใหม่

## ไฟล์หลัก
- `public/2048/regional.js`: engine กลไกแบบ opt-in และ hooks กับ Auto/relic engine
- `public/2048/regional-ui.js`, `regional.css`: ผลึก คำเตือน อายุรูนร้าว พิษ และเฟสบอสบนมือถือ (ภาพ/เอฟเฟกต์ชั่วคราว)
- `acts.js`, `skills.js`, `competition.js`, `index.html`: version negotiation, carry, ช่องกระจก และโหลดไฟล์
- `src/lib/forest2048/replay.ts`, start API: โหลด engine เดียวกับ client และรักษา compatibility

## ผลตรวจ
- `node --test tests/forest2048/*.test.mjs`: 41 รายการผ่าน รวม 36 Auto casts ภายใต้กลไก, shadow, marks, gravity, poison, boss, neutral recovery, revive, corrupted save และชุดเดิม
- `node tests/forest2048/regional-browser.mjs`: Edge headless ปัดจริง ผ่านผลึกพร้อมเตือนที่ 320px, ร้าว/พิษที่ 390px, กวางเฟสสองที่ 430px; offline/reload/lost acknowledgement แล้ว client/server state ตรงกัน ไม่มี page errors
- `node tests/forest2048/acts-browser.mjs`: ครบ 30 ห้อง/สามบอสที่ 320/390/430px รวม reload รางวัลบอสและ retry; เทียบ board, HP, charge, hazards, poison, history และ sessions ตรงกับ replay
- ESLint ของ TypeScript ที่แก้, syntax checks ของ JS ใหม่ และ `git diff --check` ผ่าน
- Production build ผ่านด้วย `npm run build -- --webpack` รวม TypeScript; ตรวจ route trace ของ start/checkpoint API พบ `regional.js` ถูกแพ็กไปด้วย ดู `output/regional-phase3/build.log`
- `node tests/forest2048/competition-browser.mjs`: Endless เดิมผ่านที่ 320/390/430px ถึงห้อง 9 พร้อม offline/resume/lost acknowledgement และ client/server equality

หลักฐาน: `output/regional-phase3/browser.json` และภาพสถานะกลไก; `output/acts-phase3/` สำหรับรันครบสามด่าน; `output/endless-phase3-regression/` สำหรับตรวจเกมเดิม

## ขอบเขตที่ยังเหลือ
เรลิคประจำภูมิภาคและรายละเอียดศัตรูเป็นเฟส 4; ภาพทั้งหมดเป็นเฟส 5; สมดุล/อัตราผ่าน/อันดับและรางวัลเป็นเฟส 6 ไม่มี schema migration หรือเขียนฐานข้อมูล production ในเฟสนี้

ค่าพลัง browser fixture ตั้งเพื่อเห็นกลไกและตรวจ flow ไม่ใช่ข้อมูลผ่านด่านของเด็กจริง มีตัวนับช่วย/แตกแล้ว แต่ยังต้องประเมินสัดส่วนเป้าร้าวที่ช่วยไม่ได้ภายใน deadline ด้วย simulation/playtest ในงานสมดุล

อ้างอิง: [กติกาเฟส 1](2048-three-acts-phase1-design-2026-10-05.md), [เฟส 2](2048-three-acts-phase2-implementation-2026-10-05.md)
