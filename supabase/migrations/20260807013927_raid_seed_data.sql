insert into public.raid_gear_qualities (code, label_th, main_value, sub_value, sort_order) values
  ('q1', null, 8, null, 1),
  ('q2', null, 11, 4, 2),
  ('q3', null, 14, 6, 3),
  ('q4', null, 18, 7, 4);

insert into public.raid_types (slug, name_th, description_th, background_path, obstacle_count, boss_threshold_pct, boss_question_count, boss_pass_count, color_quota, sort_order, is_active) values
  ('easy', 'ด่านง่าย', '[ชั่วคราว] ด่านทดสอบระบบท้าทาย รอชื่อ/คำอธิบายจริงจาก naming session', '/dungeons/cave_frost.webp', 3, 45, 5, 3, '{"green":3,"yellow":2,"red":1}'::jsonb, 1, true);

insert into public.raid_quality_thresholds (raid_type_id, min_score_pct, quality_code) values
  (null, 90, 'q4'),
  (null, 60, 'q3'),
  (null, 30, 'q2'),
  (null, 0, 'q1');

insert into public.raid_obstacles (slug, name_th, stat, reveal_th, text_pass_roll_th, text_pass_quiz_th, text_fail_th, is_active) values
  ('tmp_storm', '[ชั่วคราว] พายุหิมะ', 'def', '[ชั่วคราว] ด่านนี้วัดพลังป้องกัน (DEF)', '[ชั่วคราว] ทนพายุไหวสบายๆ ผ่านไปได้เลย!', '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้', '[ชั่วคราว] พายุแรงเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้', true),
  ('tmp_cliff', '[ชั่วคราว] หน้าผาน้ำแข็ง', 'atk', '[ชั่วคราว] ด่านนี้วัดพลังโจมตี (ATK)', '[ชั่วคราว] ฟันหน้าผาแตกง่ายๆ ผ่านไปได้เลย!', '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้', '[ชั่วคราว] หน้าผาแข็งเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้', true),
  ('tmp_crevasse', '[ชั่วคราว] รอยแยกธารน้ำแข็ง', 'spd', '[ชั่วคราว] ด่านนี้วัดความเร็ว (SPD)', '[ชั่วคราว] กระโดดข้ามได้ทันใจ ผ่านไปได้เลย!', '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้', '[ชั่วคราว] กระโดดไม่ทัน ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้', true),
  ('tmp_trek', '[ชั่วคราว] เดินทางไกลในความหนาว', 'hp', '[ชั่วคราว] ด่านนี้วัดพลังชีวิต (HP)', '[ชั่วคราว] ร่างกายแข็งแรงพอ เดินฝ่าไปได้เลย!', '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้', '[ชั่วคราว] อ่อนล้าเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้', true);
