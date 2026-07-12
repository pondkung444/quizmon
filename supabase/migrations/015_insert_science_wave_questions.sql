-- Import คำถามวิทยาศาสตร์ หมวด "คลื่น" 35 ข้อ (18 ง่าย / 10 ปานกลาง / 7 ยาก)
-- ที่มา: science_wave_questions_35.json (source_id ใช้แค่ระบุที่มา ไม่ได้เก็บลง DB เพราะตาราง questions ไม่มีคอลัมน์เก็บรหัสอ้างอิงภายนอก)
-- กันการ import ซ้ำด้วย WHERE NOT EXISTS เทียบ question_text ทีละแถว (ตาราง questions ไม่มี unique constraint ให้ใช้ ON CONFLICT)

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'เมื่อสะบัดปลายเชือกให้เกิดคลื่น สิ่งใดถ่ายทอดไปตามเชือกเป็นหลัก', '["มวลของเชือก","พลังงาน","อนุภาคของเชือกทั้งหมด","อากาศรอบเชือก"]'::jsonb, 1, 'คลื่นถ่ายทอดพลังงานไปตามเชือก ส่วนแต่ละจุดของเชือกเพียงสั่นรอบตำแหน่งเดิม'
where not exists (select 1 from public.questions where question_text = 'เมื่อสะบัดปลายเชือกให้เกิดคลื่น สิ่งใดถ่ายทอดไปตามเชือกเป็นหลัก');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'จุดสูงสุดของคลื่นตามขวางเรียกว่าอะไร', '["สันคลื่น","ท้องคลื่น","แนวสมดุล","แอมพลิจูด"]'::jsonb, 0, 'สันคลื่นคือจุดสูงสุดของคลื่น ส่วนจุดต่ำสุดเรียกว่าท้องคลื่น'
where not exists (select 1 from public.questions where question_text = 'จุดสูงสุดของคลื่นตามขวางเรียกว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'ระยะจากสันคลื่นหนึ่งไปยังสันคลื่นถัดไปเรียกว่าอะไร', '["คาบ","ความถี่","ความยาวคลื่น","แอมพลิจูด"]'::jsonb, 2, 'ความยาวคลื่นคือระยะระหว่างจุดที่มีเฟสเดียวกันซึ่งอยู่ติดกัน เช่น สันถึงสันถัดไป'
where not exists (select 1 from public.questions where question_text = 'ระยะจากสันคลื่นหนึ่งไปยังสันคลื่นถัดไปเรียกว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'หน่วยของความถี่คือข้อใด', '["เมตร","วินาที","เฮิรตซ์","เมตรต่อวินาที"]'::jsonb, 2, 'ความถี่มีหน่วยเป็นเฮิรตซ์ (Hz) ซึ่งหมายถึงจำนวนรอบต่อวินาที'
where not exists (select 1 from public.questions where question_text = 'หน่วยของความถี่คือข้อใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นชนิดใดจำเป็นต้องอาศัยตัวกลางในการเคลื่อนที่', '["คลื่นกล","คลื่นแสง","คลื่นวิทยุ","รังสีเอกซ์"]'::jsonb, 0, 'คลื่นกลเกิดจากการสั่นของอนุภาคในตัวกลาง จึงเดินทางในสุญญากาศไม่ได้'
where not exists (select 1 from public.questions where question_text = 'คลื่นชนิดใดจำเป็นต้องอาศัยตัวกลางในการเคลื่อนที่');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'ข้อใดเป็นคลื่นแม่เหล็กไฟฟ้า', '["คลื่นบนเชือก","คลื่นน้ำ","คลื่นเสียง","คลื่นวิทยุ"]'::jsonb, 3, 'คลื่นวิทยุเป็นคลื่นแม่เหล็กไฟฟ้า จึงเดินทางผ่านสุญญากาศได้'
where not exists (select 1 from public.questions where question_text = 'ข้อใดเป็นคลื่นแม่เหล็กไฟฟ้า');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'ถ้าแอมพลิจูดของคลื่นบนเชือกเพิ่มขึ้น คลื่นจะมีสิ่งใดเพิ่มขึ้น', '["พลังงาน","ความถี่เสมอ","ความยาวคลื่นเสมอ","จำนวนตัวกลาง"]'::jsonb, 0, 'เมื่อปัจจัยอื่นคงเดิม คลื่นที่มีแอมพลิจูดมากกว่าจะถ่ายทอดพลังงานมากกว่า'
where not exists (select 1 from public.questions where question_text = 'ถ้าแอมพลิจูดของคลื่นบนเชือกเพิ่มขึ้น คลื่นจะมีสิ่งใดเพิ่มขึ้น');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'เวลาที่คลื่นสั่นครบหนึ่งรอบเรียกว่าอะไร', '["คาบ","ความถี่","อัตราเร็ว","ความยาวคลื่น"]'::jsonb, 0, 'คาบคือเวลาที่ใช้ในการสั่นครบหนึ่งรอบ มีหน่วยเป็นวินาที'
where not exists (select 1 from public.questions where question_text = 'เวลาที่คลื่นสั่นครบหนึ่งรอบเรียกว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'เมื่อโยนก้อนหินลงในสระ ใบไม้ที่ลอยอยู่มักขยับขึ้นลงแต่ไม่เคลื่อนไปไกล แสดงว่าอะไร', '["น้ำหายไปจากสระ","คลื่นถ่ายทอดพลังงาน แต่น้ำไม่ได้เคลื่อนตามไปทั้งหมด","ใบไม้หยุดคลื่นได้ทั้งหมด","คลื่นไม่มีพลังงาน"]'::jsonb, 1, 'อนุภาคน้ำสั่นรอบตำแหน่งเดิม ขณะที่พลังงานของคลื่นเคลื่อนออกจากจุดกำเนิด'
where not exists (select 1 from public.questions where question_text = 'เมื่อโยนก้อนหินลงในสระ ใบไม้ที่ลอยอยู่มักขยับขึ้นลงแต่ไม่เคลื่อนไปไกล แสดงว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'ในคลื่นตามขวาง อนุภาคของตัวกลางสั่นอย่างไรเมื่อเทียบกับทิศทางของคลื่น', '["ตั้งฉากกัน","ทิศเดียวกันเสมอ","สวนทางกันเสมอ","ไม่สั่น"]'::jsonb, 0, 'คลื่นตามขวางมีทิศการสั่นของอนุภาคตั้งฉากกับทิศการเคลื่อนที่ของคลื่น'
where not exists (select 1 from public.questions where question_text = 'ในคลื่นตามขวาง อนุภาคของตัวกลางสั่นอย่างไรเมื่อเทียบกับทิศทางของคลื่น');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นตามยาวมีลักษณะสำคัญอย่างไร', '["อนุภาคสั่นตั้งฉากกับทิศคลื่น","อนุภาคสั่นขนานกับทิศคลื่น","ไม่มีบริเวณอัดและขยาย","เดินทางได้เฉพาะในสุญญากาศ"]'::jsonb, 1, 'ในคลื่นตามยาว อนุภาคสั่นไปกลับในแนวขนานกับทิศทางที่คลื่นเคลื่อนที่'
where not exists (select 1 from public.questions where question_text = 'คลื่นตามยาวมีลักษณะสำคัญอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นสั่นครบ 5 รอบในเวลา 1 วินาที มีความถี่เท่าใด', '["0.2 Hz","1 Hz","5 Hz","10 Hz"]'::jsonb, 2, 'ความถี่คือจำนวนรอบต่อวินาที จึงมีค่า 5 รอบ ÷ 1 วินาที = 5 Hz'
where not exists (select 1 from public.questions where question_text = 'คลื่นสั่นครบ 5 รอบในเวลา 1 วินาที มีความถี่เท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'สูตรใดแสดงความสัมพันธ์ระหว่างอัตราเร็วคลื่น ความถี่ และความยาวคลื่น', '["v = fλ","v = f/λ","v = λ/f","v = f + λ"]'::jsonb, 0, 'อัตราเร็วคลื่นเท่ากับความถี่คูณความยาวคลื่น หรือ v = fλ'
where not exists (select 1 from public.questions where question_text = 'สูตรใดแสดงความสัมพันธ์ระหว่างอัตราเร็วคลื่น ความถี่ และความยาวคลื่น');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'เมื่อคลื่นกระทบสิ่งกีดขวางแล้วเคลื่อนย้อนกลับ เรียกปรากฏการณ์ใด', '["การหักเห","การสะท้อน","การแทรกสอด","การเลี้ยวเบน"]'::jsonb, 1, 'การสะท้อนเกิดเมื่อคลื่นกระทบขอบเขตหรือสิ่งกีดขวางแล้วกลับเข้าสู่ตัวกลางเดิม'
where not exists (select 1 from public.questions where question_text = 'เมื่อคลื่นกระทบสิ่งกีดขวางแล้วเคลื่อนย้อนกลับ เรียกปรากฏการณ์ใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นเปลี่ยนทิศเมื่อผ่านจากบริเวณน้ำลึกสู่น้ำตื้น เพราะเหตุใด', '["อัตราเร็วคลื่นเปลี่ยน","คลื่นหมดพลังงานทันที","ความถี่จากแหล่งกำเนิดหายไป","น้ำหยุดสั่นทั้งหมด"]'::jsonb, 0, 'เมื่ออัตราเร็วคลื่นเปลี่ยนที่รอยต่อ คลื่นอาจเปลี่ยนทิศทาง เกิดเป็นการหักเห'
where not exists (select 1 from public.questions where question_text = 'คลื่นเปลี่ยนทิศเมื่อผ่านจากบริเวณน้ำลึกสู่น้ำตื้น เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นน้ำแผ่เข้าไปด้านหลังช่องแคบได้ แสดงสมบัติใดของคลื่น', '["การดูดกลืน","การโพลาไรซ์","การเลี้ยวเบน","การสลายตัว"]'::jsonb, 2, 'การเลี้ยวเบนคือการที่คลื่นอ้อมขอบสิ่งกีดขวางหรือแผ่ผ่านช่องเปิด'
where not exists (select 1 from public.questions where question_text = 'คลื่นน้ำแผ่เข้าไปด้านหลังช่องแคบได้ แสดงสมบัติใดของคลื่น');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'คลื่นสองขบวนมาพบกันและรวมกันชั่วขณะ เรียกปรากฏการณ์ใด', '["การแทรกสอด","การหักเห","การสะท้อน","การดูดกลืน"]'::jsonb, 0, 'การแทรกสอดเกิดจากการซ้อนทับกันของคลื่น ทำให้ผลรวมอาจมากขึ้นหรือลดลง'
where not exists (select 1 from public.questions where question_text = 'คลื่นสองขบวนมาพบกันและรวมกันชั่วขณะ เรียกปรากฏการณ์ใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 1, 'ถ้าความถี่ของคลื่นเพิ่มขึ้น คาบของคลื่นจะเปลี่ยนอย่างไร', '["เพิ่มขึ้น","ลดลง","คงที่เสมอ","เป็นศูนย์ทันที"]'::jsonb, 1, 'คาบและความถี่สัมพันธ์กันด้วย T = 1/f จึงเปลี่ยนแปลงสวนทางกัน'
where not exists (select 1 from public.questions where question_text = 'ถ้าความถี่ของคลื่นเพิ่มขึ้น คาบของคลื่นจะเปลี่ยนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'คลื่นมีความถี่ 4 Hz และความยาวคลื่น 3 m มีอัตราเร็วเท่าใด', '["0.75 m/s","7 m/s","12 m/s","24 m/s"]'::jsonb, 2, 'จาก v = fλ ได้ v = 4 × 3 = 12 m/s'
where not exists (select 1 from public.questions where question_text = 'คลื่นมีความถี่ 4 Hz และความยาวคลื่น 3 m มีอัตราเร็วเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'คลื่นมีความถี่ 8 Hz คาบของคลื่นมีค่าเท่าใด', '["0.125 s","0.8 s","8 s","16 s"]'::jsonb, 0, 'จาก T = 1/f ได้ T = 1/8 = 0.125 s'
where not exists (select 1 from public.questions where question_text = 'คลื่นมีความถี่ 8 Hz คาบของคลื่นมีค่าเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'คลื่นเคลื่อนที่ในตัวกลางเดิมด้วยอัตราเร็วคงที่ หากเพิ่มความถี่เป็น 2 เท่า ความยาวคลื่นจะเป็นอย่างไร', '["เพิ่มเป็น 2 เท่า","ลดเหลือครึ่งหนึ่ง","คงเดิม","เพิ่มเป็น 4 เท่า"]'::jsonb, 1, 'เมื่อ v คงที่ จาก λ = v/f ความถี่เพิ่มเป็น 2 เท่าจึงทำให้ความยาวคลื่นเหลือครึ่งหนึ่ง'
where not exists (select 1 from public.questions where question_text = 'คลื่นเคลื่อนที่ในตัวกลางเดิมด้วยอัตราเร็วคงที่ หากเพิ่มความถี่เป็น 2 เท่า ความยาวคลื่นจะเป็นอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'นักเรียนสะบัดเชือกด้วยความถี่เท่าเดิม แต่สะบัดแรงขึ้น สิ่งใดควรเปลี่ยนชัดเจนที่สุด', '["แอมพลิจูดเพิ่มขึ้น","ความถี่เพิ่มขึ้น","คาบเพิ่มขึ้น","ความยาวเชือกเพิ่มขึ้น"]'::jsonb, 0, 'การสะบัดแรงขึ้นเพิ่มพลังงานและแอมพลิจูด แต่ความถี่ยังคงตามจังหวะการสะบัดเดิม'
where not exists (select 1 from public.questions where question_text = 'นักเรียนสะบัดเชือกด้วยความถี่เท่าเดิม แต่สะบัดแรงขึ้น สิ่งใดควรเปลี่ยนชัดเจนที่สุด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'คลื่นน้ำเดินทางจากน้ำลึกสู่น้ำตื้นในแนวเฉียง โดยความถี่คงเดิม ข้อใดถูกต้อง', '["อัตราเร็วและความยาวคลื่นลดลง","อัตราเร็วเพิ่ม แต่ความยาวคลื่นลด","อัตราเร็วลด แต่ความยาวคลื่นเพิ่ม","อัตราเร็วและความยาวคลื่นคงเดิม"]'::jsonb, 0, 'ในน้ำตื้นคลื่นน้ำช้าลง และเมื่อความถี่คงเดิม λ = v/f ทำให้ความยาวคลื่นลดลงด้วย'
where not exists (select 1 from public.questions where question_text = 'คลื่นน้ำเดินทางจากน้ำลึกสู่น้ำตื้นในแนวเฉียง โดยความถี่คงเดิม ข้อใดถูกต้อง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'ต้องการให้คลื่นเลี้ยวเบนผ่านช่องเปิดได้เด่นชัด ควรเลือกช่องเปิดแบบใด', '["กว้างกว่าความยาวคลื่นมาก","กว้างใกล้เคียงความยาวคลื่น","กว้างเท่าใดก็ให้ผลเหมือนกัน","ปิดช่องเปิดทั้งหมด"]'::jsonb, 1, 'การเลี้ยวเบนเห็นได้ชัดเมื่อขนาดช่องเปิดใกล้เคียงหรือน้อยกว่าความยาวคลื่น'
where not exists (select 1 from public.questions where question_text = 'ต้องการให้คลื่นเลี้ยวเบนผ่านช่องเปิดได้เด่นชัด ควรเลือกช่องเปิดแบบใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'เมื่อสันคลื่นสองขบวนที่มีขนาดเท่ากันมาพบกัน จะเกิดผลอย่างไรชั่วขณะ', '["แอมพลิจูดรวมเป็นศูนย์","แอมพลิจูดรวมมากขึ้นเป็น 2 เท่า","ความถี่ทั้งสองหายไป","คลื่นหยุดถาวร"]'::jsonb, 1, 'สันพบสันเป็นการแทรกสอดแบบเสริม แอมพลิจูดจึงรวมกันชั่วขณะ'
where not exists (select 1 from public.questions where question_text = 'เมื่อสันคลื่นสองขบวนที่มีขนาดเท่ากันมาพบกัน จะเกิดผลอย่างไรชั่วขณะ');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'สันคลื่นกับท้องคลื่นที่มีแอมพลิจูดเท่ากันมาพบกันพอดี จะเกิดอะไรขึ้นชั่วขณะ', '["แอมพลิจูดรวมเป็นศูนย์","แอมพลิจูดเพิ่มเป็น 2 เท่า","อัตราเร็วเพิ่มเป็น 2 เท่า","ความถี่เพิ่มเป็น 2 เท่า"]'::jsonb, 0, 'คลื่นที่มีการกระจัดตรงข้ามและเท่ากันหักล้างกันชั่วขณะ เป็นการแทรกสอดแบบหักล้าง'
where not exists (select 1 from public.questions where question_text = 'สันคลื่นกับท้องคลื่นที่มีแอมพลิจูดเท่ากันมาพบกันพอดี จะเกิดอะไรขึ้นชั่วขณะ');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'สันคลื่น 6 สันเรียงกัน โดยระยะจากสันแรกถึงสันที่หกเท่ากับ 10 m ความยาวคลื่นเท่าใด', '["1 m","2 m","5 m","10 m"]'::jsonb, 1, 'จากสันแรกถึงสันที่หกมี 5 ช่วงคลื่น ดังนั้น λ = 10/5 = 2 m'
where not exists (select 1 from public.questions where question_text = 'สันคลื่น 6 สันเรียงกัน โดยระยะจากสันแรกถึงสันที่หกเท่ากับ 10 m ความยาวคลื่นเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 2, 'เมื่อคลื่นทะเลเข้าสู่ชายฝั่งในแนวเฉียง แนวคลื่นมักเบนให้ขนานชายฝั่งมากขึ้น เพราะเหตุใด', '["ส่วนที่ถึงน้ำตื้นก่อนเคลื่อนที่ช้าลง","ส่วนที่ถึงน้ำตื้นก่อนเคลื่อนที่เร็วขึ้น","ความถี่ของคลื่นหายไปทันที","ชายฝั่งสร้างคลื่นใหม่ทั้งหมด"]'::jsonb, 0, 'ส่วนของหน้าคลื่นที่เข้าสู่น้ำตื้นก่อนจะช้าลงก่อน ทำให้หน้าคลื่นหมุนและเกิดการหักเห'
where not exists (select 1 from public.questions where question_text = 'เมื่อคลื่นทะเลเข้าสู่ชายฝั่งในแนวเฉียง แนวคลื่นมักเบนให้ขนานชายฝั่งมากขึ้น เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'คลื่นเดินทาง 24 m ใน 3 s และมีความถี่ 4 Hz ความยาวคลื่นเท่าใด', '["0.5 m","2 m","8 m","32 m"]'::jsonb, 1, 'อัตราเร็ว v = 24/3 = 8 m/s แล้ว λ = v/f = 8/4 = 2 m'
where not exists (select 1 from public.questions where question_text = 'คลื่นเดินทาง 24 m ใน 3 s และมีความถี่ 4 Hz ความยาวคลื่นเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'แหล่งกำเนิดสร้างคลื่นในตัวกลางเดิม จาก 5 Hz เพิ่มเป็น 10 Hz ถ้าอัตราเร็วคงที่ ข้อใดถูกต้อง', '["คาบและความยาวคลื่นเพิ่มเป็น 2 เท่า","คาบและความยาวคลื่นลดเหลือครึ่งหนึ่ง","คาบลดครึ่งหนึ่ง แต่ความยาวคลื่นเพิ่มสองเท่า","คาบเพิ่มสองเท่า แต่ความยาวคลื่นลดครึ่งหนึ่ง"]'::jsonb, 1, 'ทั้ง T = 1/f และ λ = v/f จึงลดเหลือครึ่งหนึ่งเมื่อความถี่เพิ่มเป็น 2 เท่า'
where not exists (select 1 from public.questions where question_text = 'แหล่งกำเนิดสร้างคลื่นในตัวกลางเดิม จาก 5 Hz เพิ่มเป็น 10 Hz ถ้าอัตราเร็วคงที่ ข้อใดถูกต้อง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'ทดลองคลื่นในถาดน้ำโดยให้แหล่งกำเนิดสั่นคงที่ เมื่อคลื่นเข้าสู่น้ำตื้น นักเรียนควรพบชุดผลใด', '["ความถี่ลด อัตราเร็วลด ความยาวคลื่นคงเดิม","ความถี่คงเดิม อัตราเร็วลด ความยาวคลื่นลด","ความถี่เพิ่ม อัตราเร็วคงเดิม ความยาวคลื่นลด","ความถี่คงเดิม อัตราเร็วเพิ่ม ความยาวคลื่นเพิ่ม"]'::jsonb, 1, 'ความถี่กำหนดโดยแหล่งกำเนิดจึงคงเดิม แต่น้ำตื้นทำให้คลื่นช้าลงและความยาวคลื่นลดลง'
where not exists (select 1 from public.questions where question_text = 'ทดลองคลื่นในถาดน้ำโดยให้แหล่งกำเนิดสั่นคงที่ เมื่อคลื่นเข้าสู่น้ำตื้น นักเรียนควรพบชุดผลใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'คลื่นมีสมการสัมพันธ์ v = fλ ถ้าคาบเท่ากับ 0.25 s และความยาวคลื่น 1.5 m อัตราเร็วเท่าใด', '["0.375 m/s","1.5 m/s","4 m/s","6 m/s"]'::jsonb, 3, 'f = 1/T = 4 Hz ดังนั้น v = 4 × 1.5 = 6 m/s'
where not exists (select 1 from public.questions where question_text = 'คลื่นมีสมการสัมพันธ์ v = fλ ถ้าคาบเท่ากับ 0.25 s และความยาวคลื่น 1.5 m อัตราเร็วเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'คลื่น A และ B เดินทางในตัวกลางเดียวกัน A มีความถี่เป็น 3 เท่าของ B ข้อใดถูกต้อง', '["A มีอัตราเร็วเป็น 3 เท่า","A มีความยาวคลื่นเป็น 3 เท่า","A มีความยาวคลื่นเป็นหนึ่งในสามของ B","A มีคาบเป็น 3 เท่าของ B"]'::jsonb, 2, 'ในตัวกลางเดียวกันอัตราเร็วคงที่ ความยาวคลื่นจึงแปรผกผันกับความถี่'
where not exists (select 1 from public.questions where question_text = 'คลื่น A และ B เดินทางในตัวกลางเดียวกัน A มีความถี่เป็น 3 เท่าของ B ข้อใดถูกต้อง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'ถ้าคลื่นสองขบวนหักล้างกันหมด ณ จุดหนึ่ง ข้อใดอธิบายได้ดีที่สุด', '["คลื่นทั้งสองถูกทำลายและไม่เดินทางต่อ","การกระจัดรวมเป็นศูนย์ชั่วขณะ แต่คลื่นยังเดินทางต่อ","พลังงานทั้งหมดเปลี่ยนเป็นมวล","อัตราเร็วของคลื่นเป็นศูนย์ถาวร"]'::jsonb, 1, 'หลักการซ้อนทับทำให้การกระจัดรวมเป็นศูนย์ชั่วขณะ หลังจากนั้นคลื่นแต่ละขบวนยังเคลื่อนที่ต่อ'
where not exists (select 1 from public.questions where question_text = 'ถ้าคลื่นสองขบวนหักล้างกันหมด ณ จุดหนึ่ง ข้อใดอธิบายได้ดีที่สุด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'คลื่น', 3, 'คลื่น 12 รอบผ่านจุดหนึ่งใน 6 s และเดินทางได้ 9 m ใน 3 s ความยาวคลื่นเท่าใด', '["0.5 m","1.0 m","1.5 m","6.0 m"]'::jsonb, 2, 'f = 12/6 = 2 Hz, v = 9/3 = 3 m/s ดังนั้น λ = 3/2 = 1.5 m'
where not exists (select 1 from public.questions where question_text = 'คลื่น 12 รอบผ่านจุดหนึ่งใน 6 s และเดินทางได้ 9 m ใน 3 s ความยาวคลื่นเท่าใด');
