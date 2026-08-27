-- เพิ่ม user_id ของ tester closed testing (Google Play) เข้า test_accounts
-- กันสถิติของ tester ปนกับผู้เล่นจริง (ตาม doc/closed-testing-launch-plan-2026-08-25.md เฟส 3)
-- ON CONFLICT DO NOTHING เผื่อบางคนถูกเพิ่มไว้แล้ว (เช่นซ้ำกับบัญชีที่มีอยู่เดิม)
insert into public.test_accounts (user_id, note) values
  ('a966f038-fe0d-4ab8-9dcf-09411ca41534', 'ซันซัน - closed testing tester (ม.3)'),
  ('5a813021-da12-46b2-a57e-4e4747f87970', 'น้ำหวาน - closed testing tester (ม.6)'),
  ('1e5746dc-8115-4bab-aaef-8f2c412bd4dd', 'อั่งเปา - closed testing tester (ม.3)'),
  ('a5fecac1-ee5d-47e9-981f-9569395ac46a', 'ปันปัน - closed testing tester (ม.3)'),
  ('6481d787-2d6d-4e80-882e-6320f70e1dfd', 'ออมสิน - closed testing tester (ม.6)'),
  ('5f939117-13ef-4802-8e86-2675093958e3', 'กุนซือ - closed testing tester (ม.6)'),
  ('d43b10cd-674e-4b66-a031-1d2bc06ffd82', 'มิกซ์ - closed testing tester (ม.3)'),
  ('7d69a1eb-75ae-444f-acc9-07d7b6f69882', 'ภาค - closed testing tester (ม.3)'),
  ('5a63c765-a46e-4bcb-ba9b-b1c694d15d7c', 'เตเต - closed testing tester (ม.3)'),
  ('8d2ab077-7349-4479-8135-c6508e96249f', 'ณดา - closed testing tester (ม.3)'),
  ('1d42f2c9-54df-4c04-897a-5ba289fc5b2d', 'Deer - closed testing tester (ม.3)'),
  ('390838ac-6b29-4e71-a6a8-1bef3121e1cb', 'ไบรท์ - closed testing tester (ม.3)')
on conflict (user_id) do nothing;
