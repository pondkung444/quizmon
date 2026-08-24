-- เพิ่ม image_url สำหรับ Rich Notification (แสดงรูป Qmon แนบ push)
-- Android: FCM notification.image field -> Big Picture อัตโนมัติ ไม่ต้องเขียนโค้ด native เพิ่ม
-- iOS: ต้องมี Notification Service Extension ก่อน (ยังไม่ทำ รอ Apple Dev Program)
--
-- หมายเหตุ: migration นี้ apply ผ่าน Supabase MCP ไปแล้วจริงบน production DB
-- (project wmndxiuqzrnqbhrznmfg) ไฟล์นี้แค่เอามาใส่ supabase/migrations/
-- เพื่อกัน drift ระหว่าง repo กับ DB จริง — ห้าม apply ซ้ำถ้า DB มี column อยู่แล้ว

alter table public.notification_jobs
  add column image_url text;
