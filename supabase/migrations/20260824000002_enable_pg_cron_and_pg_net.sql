-- เปิด extension สำหรับให้ Supabase ยิง HTTP call ไปยัง Vercel route ได้ตามความถี่ที่ต้องการ
-- (Vercel Hobby cron ยิงได้แค่วันละครั้ง/job ไม่พอสำหรับ event "Qmon กลับจากผจญภัย" ที่ต้อง
-- detect แบบ near-real-time — ดู memory 2026-08-24 สำหรับเหตุผลเต็ม)
--
-- หมายเหตุ: apply ผ่าน Supabase MCP ไปแล้วจริงบน production DB (project wmndxiuqzrnqbhrznmfg)
-- ไฟล์นี้แค่เอามาใส่ supabase/migrations/ เพื่อกัน drift — ห้าม apply ซ้ำ

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
