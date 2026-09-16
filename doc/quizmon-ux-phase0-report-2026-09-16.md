# Quizmon UX Phase 0 — Review Report

วันที่: 2026-09-16
ขอบเขต: Phase 0 เท่านั้น — safety net, Guest recovery, analytics contract และ browser regression harness

## สถานะสรุป

โค้ดและ migration สำหรับ Phase 0 พร้อมบน branch `codex/quizmon-ux-phase0` ใน worktree แยก และ migration ถูก apply ไปยังโปรเจกต์ `monschool` แล้ว

## สิ่งที่ส่งมอบ

- Guest Mode recovery แบบ idempotent สำหรับ anonymous session ที่ trigger สร้างข้อมูลได้ไม่ครบ
- retry UI เมื่อ provisioning ยังไม่สมบูรณ์ แทนการส่งผู้ใช้ต่อไปยังหน้าที่ใช้งานไม่ได้
- analytics funnel contract 11 events พร้อม context บังคับ `route`, `viewport_group`, `user_state`
- instrumentation สำหรับ `guest_started`, `guest_ready`, `starter_egg_viewed`, `pet_hatched`
- API guard ที่ไม่รับ funnel event ซึ่งขาด context โดยไม่กระทบ legacy event อื่น
- repeatable Playwright regression harness สำหรับ desktop และ mobile viewport matrix
- browser checklist ครอบคลุม Guest, Home, Quiz, Adventure, Raid, Social, PvP และ Boss Raid

## ผลตรวจอัตโนมัติ

| รายการ | ผล |
| --- | --- |
| Phase 0 contract tests | ผ่าน 4/4 |
| Targeted ESLint | ผ่าน |
| TypeScript `--noEmit` | ผ่าน |
| Production build | ผ่าน |
| Public Login → Guest setup browser matrix | ผ่าน 5/5 |

Viewport ที่ผ่าน: 1440×900, 360×800, 375×667, 393×852 และ 412×915

Browser test ตรวจว่าแต่ละหน้ามีเนื้อหาที่ใช้งานได้, ไม่มี Next.js error overlay, ไม่มี horizontal overflow, form label ผูกกับ control และ CTA หลักมีพื้นที่กดสูงอย่างน้อย 44px

## ปัญหาที่พบและแก้แล้ว

1. label ของชื่อและระดับชั้นยังไม่ผูกกับ form control ทำให้ browser/assistive technology หา field จากชื่อไม่ได้ — เพิ่ม `htmlFor` และ `id`
2. CTA `เริ่มเลย` สูง 42px ต่ำกว่า touch target baseline — เพิ่มความสูงขั้นต่ำเป็น 44px
3. Guest provisioning อาจจบครึ่งทางและส่งผู้ใช้เข้าสู่ state ที่ไม่มี profile หรือ starter egg — เพิ่ม anonymous-only recovery RPC พร้อม transaction advisory lock และตรวจผลซ้ำก่อน redirect
4. funnel event สามารถถูกส่งโดยไม่มี route/viewport/user state — เพิ่ม shared contract และ API validation

## Database safety

- recovery RPC ตรวจ `auth.uid()` และยืนยัน `auth.users.is_anonymous is true`
- ใช้ `SECURITY DEFINER` เฉพาะเพราะต้องซ่อมข้อมูลหลัง RLS พร้อม `search_path = ''` และ schema-qualified references ทุกจุด
- revoke สิทธิ์จาก `public` และ `anon`; grant เฉพาะ `authenticated`
- serialized ต่อ user และไม่สร้าง starter egg ซ้ำเมื่อมี pet หรือไข่ starter ที่ยังไม่ฟัก
- ไม่มีการเปลี่ยน notification, native หรือ Store schema/behavior

## การยืนยันหลัง deploy

- migration `guest_provisioning_recovery` ถูกบันทึกใน migration history แล้ว
- RPC เป็น `SECURITY DEFINER`, ใช้ `search_path = ''`, `authenticated` เรียกได้ และ `anon` เรียกไม่ได้
- Guest → Eggs → Home ผ่าน browser matrix 5/5 ด้วย disposable anonymous test accounts
- authenticated all-mode route harness พร้อมแล้ว แต่ยังไม่รันเคสที่ต้องใช้อีเมล/รหัสผ่าน

## ข้อเสนอสำหรับการอนุมัติ Phase 0

Phase 0 database gate ปิดแล้ว สามารถรีวิว change set เพื่อ merge พร้อม Phase 1 ได้
