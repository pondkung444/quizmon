-- ย้อนกลับ migration 20260826120000_add_closed_testing_tester_accounts.sql
-- ปอนด์เปลี่ยนใจ: ไม่ต้องการกัน tester ออกจากสถิติ/leaderboard แล้ว อยากให้ tester
-- ได้ประสบการณ์เหมือนผู้เล่นจริงทุกอย่างรวมถึงขึ้น leaderboard จริงด้วย
-- ลบเฉพาะ 12 แถวที่เพิ่ง insert ไปโดย delete ตาม user_id ตรงๆ (ไม่แตะ 3 แถวเดิมของ
-- ปอนด์/Dawu/Daou ซึ่งเป็นคนละวัตถุประสงค์ - ยังต้องกันบัญชีปอนด์เองออกจาก leaderboard อยู่)
delete from public.test_accounts
where user_id in (
  'a966f038-fe0d-4ab8-9dcf-09411ca41534', -- ซันซัน
  '5a813021-da12-46b2-a57e-4e4747f87970', -- น้ำหวาน
  '1e5746dc-8115-4bab-aaef-8f2c412bd4dd', -- อั่งเปา
  'a5fecac1-ee5d-47e9-981f-9569395ac46a', -- ปันปัน
  '6481d787-2d6d-4e80-882e-6320f70e1dfd', -- ออมสิน
  '5f939117-13ef-4802-8e86-2675093958e3', -- กุนซือ
  'd43b10cd-674e-4b66-a031-1d2bc06ffd82', -- มิกซ์
  '7d69a1eb-75ae-444f-acc9-07d7b6f69882', -- ภาค
  '5a63c765-a46e-4bcb-ba9b-b1c694d15d7c', -- เตเต
  '8d2ab077-7349-4479-8135-c6508e96249f', -- ณดา
  '1d42f2c9-54df-4c04-897a-5ba289fc5b2d', -- Deer
  '390838ac-6b29-4e71-a6a8-1bef3121e1cb'  -- ไบรท์
);
