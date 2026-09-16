# Quizmon UX Phase 1 — Review Report

วันที่: 2026-09-16
ขอบเขต: Home next action, hero CTA, progressive disclosure และ responsive verification

## สถานะสรุป

Phase 1 implementation พร้อมรีวิวบน branch `codex/quizmon-ux-phase0` โดยยังไม่เริ่ม Phase 2 โค้ดผ่าน unit, lint, type, production build และ browser viewport matrix ครบแล้ว

## สิ่งที่ส่งมอบ

- pure next-action resolver พร้อม state table และลำดับเดียวสำหรับ UI/analytics
- Home hero ที่มี primary CTA เดียว พร้อมเวลา/จำนวนข้อ/รางวัลตาม state
- รองรับ no pet, evolution ready, pending adventure reward, daily mission, PvP turn, Adventure, Raid, new learner และ returning learner
- “กิจกรรมอื่น” แบบ progressive disclosure โดยกิจกรรมเดิมไม่หาย
- analytics `home_next_action_viewed` และ `home_next_action_clicked` พร้อม action id และ activity context
- browser journey สำหรับ new Guest → Home hero ครบ viewport matrix โดยใช้ disposable anonymous test accounts

## State priority

1. ไม่มี Qmon → เลือกไข่
2. Qmon โตเต็มที่ → รับการเติบโต/เก็บเข้าฟาร์ม
3. Adventure มีรางวัลรอรับ → รับผล
4. Daily Mission ยังไม่ครบ → ทำภารกิจ
5. มี PvP turn → เล่นต่อ
6. Adventure พร้อม → ออกผจญภัย
7. มีกุญแจ Raid → ท้าทายด่าน
8. fallback → Practice พร้อมหัวข้อที่ควรทบทวนเมื่อมีข้อมูล

## ผลตรวจ

| รายการ | ผล |
| --- | --- |
| Phase 0 + Phase 1 unit/contract tests | ผ่าน 6/6 |
| Targeted ESLint | ผ่าน |
| TypeScript `--noEmit` | ผ่าน |
| Production build | ผ่าน |
| Public Phase 0 viewport matrix | ผ่าน 5/5 จากรอบก่อนหน้า |
| Phase 1 Guest → Eggs → Home viewport matrix | ผ่าน 5/5 |

Viewport ที่ผ่าน: 1440×900, 360×800, 375×667, 393×852 และ 412×915

## Database gate

Recovery migration ถูก apply ผ่าน Supabase Connector ไปยังโปรเจกต์ `monschool` แล้ว ตรวจยืนยันสิทธิ์และ `search_path` ผ่าน และ Guest → Eggs → Home ผ่านครบทุก viewport

Database advisor ยังรายงานรายการเดิมของระบบหลายจุด เช่นตารางบางส่วนที่เปิด RLS แต่ไม่มี policy และ policy บางส่วนที่ควรปรับเพื่อประสิทธิภาพ รายการเหล่านี้ไม่ได้เกิดจาก Phase 0–1 migration และควรแยกเป็นงานตรวจฐานข้อมูลต่างหาก
