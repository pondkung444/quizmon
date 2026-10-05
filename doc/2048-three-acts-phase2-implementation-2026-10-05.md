# 2048 Three Acts — Phase 2

สถานะ: ลงมือทำและตรวจใน managed worktree บน origin/main d7a74f7; ยังไม่ได้ merge หรือ deploy

## สิ่งที่เล่นได้

- โหมดทดลองเปิดด้วย `/2048/?journey=three-acts` โดย API start รับ `journeyVersion: 1`
- ป่าผลึก → ถ้ำผลึก → ภูเขาลอยฟ้า ด่านละ 10 ห้อง รวม 30 ห้อง ห้อง 1–9 มีสองทาง ห้อง 10 เป็นบอสหนึ่งทาง
- ห้องสุ่ม 3/5/6/8 ใช้น้ำหนัก 20/30/30/20 และเลือกบริการได้สูงสุดสามครั้งต่อด่าน ห้อง 9 แยกจากเพดานนี้
- ห้อง 2/4 รับเรลิค; ชนะบอสแรกและบอสสองฟื้น HP 50% รับเรลิคแล้วเข้าด่านถัดไป บอสสามจบรัน
- ส่งต่อ HP, charge, เรลิค และกระดาน โดยล้างรูนเล็กครึ่งหนึ่งครั้งเดียวเมื่อเข้าห้องต่อสู้ ช่วยชีวิตครั้งเดียวต่อรัน
- คงการพัก 30% และ recovery ป่าต้นเกม 20%; ถอด crown ออกจากกองของโหมดใหม่
- เซฟก่อนห้องแรก พัก/กลับมาเล่น และบันทึก journey log/session counts รองรับ server replay
- เวอร์ชันเดิมยังใช้ Endless; ผลทดลองใหม่เก็บ snapshot แต่ส่งคะแนนห้อง/บอสเป็นศูนย์ให้ระบบอันดับเดิม เพื่อไม่ปะปนกัน

## ขอบเขตเฟสถัดไป

ถ้ำและฟ้าใช้ชื่อศัตรูและภาพแทนชั่วคราว พร้อมการต่อสู้พื้นฐาน กลไกผลึก/ร้าว/พิษ/เฟสบอส/เรลิคภูมิภาค ภาพจริง การปรับสมดุลและอันดับใหม่ยังเป็นงานเฟสถัดไป กองรางวัลบอสมี extension point สำหรับเรลิคภูมิภาคและ fallback กอง Rare/Epic ในเฟสนี้

ไม่มีการแก้ schema หรือเขียนฐานข้อมูล production; API tests ใช้ handlers จริงกับ auth/database transport ที่จำลอง

## ผลตรวจ

- `node --test tests/forest2048/*.test.mjs`: 22 รายการผ่าน รวม route/API/replay และชุดทดสอบเกมเดิม
- `node tests/forest2048/acts-browser.mjs`: Edge headless ที่ 320/390/430px เล่นครบ 30 ห้อง ชนะสามบอส ตรวจ touch, reload, offline, lost acknowledgement และเทียบ client/server state รวม board, HP, charge, history, journal และ session counts
- `node tests/forest2048/competition-browser.mjs`: Endless เดิมผ่านทั้งสามขนาด พร้อม offline/resume/retry และ client/server equality
- ESLint เฉพาะ TypeScript ที่เปลี่ยน และ TypeScript noEmit ผ่าน
- production build ผ่านด้วย `npm run build -- --webpack`; Turbopack บนเครื่องนี้ติด node_modules junction ที่ชี้นอก worktree จึงใช้ webpack ตรวจแทน

Browser ใช้ companion fixture สเตตัสสูงเพื่อทดสอบ flow ไม่ใช่หลักฐานว่าผู้เล่นจริงผ่านหรือเกมสมดุล ภาพและผลล่าสุดอยู่ `output/acts-phase2/browser.json` กับ `output/acts-phase2/*.png`; ผลเดิมอยู่ `output/endless-competition/`

ระหว่างตรวจพบ fresh() สร้างคิวรูนด้วย Math.random แล้วคิวนั้นติดเข้าห้องใหม่ จึงทิ้งคิวสาธิตก่อน spawn ด้วย seed ของรัน เพิ่ม regression test ที่บังคับ Math.random ให้ต่างกันแล้วตรวจว่ากระดาน/คิว/seed ตรงกัน

อ้างอิงกติกาที่อนุมัติ: [Phase 1](2048-three-acts-phase1-design-2026-10-05.md)
