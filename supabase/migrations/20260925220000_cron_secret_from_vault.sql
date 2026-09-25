-- =====================================================================
-- หมุน (rotate) token ที่ pg_cron ใช้ยิง https://quizmon.xyz/api/cron/* และเลิกเขียน token ในโค้ด
--
-- ที่มา: token เดิมถูก commit ไว้ใน migration (20260907112944 / 20260908115238) ตั้งแต่ 2026-09-08
-- และ repo เป็น public — ใครก็ยิง /api/cron/adventure-return และ /api/cron/pvp-gc ได้
--
-- ทำอะไร:
--   1) สร้าง secret ใหม่ใน Supabase Vault ชื่อ cron_secret — สุ่มในฐานข้อมูลเอง
--      ค่าจริงไม่อยู่ใน repo / migration history / แชท (ดูได้ทาง Vault ใน Supabase dashboard เท่านั้น)
--   2) ให้ cron adventure-return-push และ pvp-gc อ่าน token จาก Vault ทุกครั้งที่รัน
--      (cron.schedule ชื่อเดิม = อัปเดต job เดิม ตาราง/เวลาเดิม)
--
-- หลัง apply ต้องตั้ง ADVENTURE_CRON_SECRET บน Vercel (Production) ให้ตรงกับ Vault แล้ว redeploy
-- ระหว่างนั้น 2 route นี้ตอบ 401 (pvp-gc เก็บกวาดแมตช์ช้าลง / แจ้งเตือนผจญภัยจบช้าลง) — ไม่มีข้อมูลเสีย
--
-- หมุนรอบหน้า: select vault.update_secret(
--   (select id from vault.secrets where name = 'cron_secret'), encode(extensions.gen_random_bytes(32), 'hex'));
-- แล้วอัปเดต Vercel ตาม — ไม่ต้องแก้ cron
-- =====================================================================

begin;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cron_secret',
  'Bearer token ที่ pg_cron ส่งไป /api/cron/* — ต้องตรงกับ ADVENTURE_CRON_SECRET บน Vercel'
);

select cron.schedule(
  'adventure-return-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://quizmon.xyz/api/cron/adventure-return',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'pvp-gc',
  '45 seconds',
  $$
  select net.http_post(
    url := 'https://quizmon.xyz/api/cron/pvp-gc',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

commit;
