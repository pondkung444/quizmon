-- Import คำถามวิทยาศาสตร์ หมวด "เสียง" 30 ข้อ และ "แสง" 35 ข้อ (รวม 65 ข้อ)
-- ที่มา: science_sound_light_questions_65.json (ต่อเนื่องจาก migration 015 ที่ import หมวด "คลื่น" ไปแล้ว)
-- source_id ใช้แค่ระบุที่มา ไม่ได้เก็บลง DB เพราะตาราง questions ไม่มีคอลัมน์เก็บรหัสอ้างอิงภายนอก
-- กันการ import ซ้ำด้วย WHERE NOT EXISTS เทียบ question_text ทีละแถว (ตาราง questions ไม่มี unique constraint ให้ใช้ ON CONFLICT)

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงเกิดจากสิ่งใด', '["การสั่นของแหล่งกำเนิด","การเปลี่ยนสีของวัตถุ","การหยุดนิ่งของอากาศ","การเกิดเงา"]'::jsonb, 0, 'เสียงเกิดเมื่อแหล่งกำเนิดสั่นและถ่ายทอดการสั่นผ่านตัวกลางมายังหู'
where not exists (select 1 from public.questions where question_text = 'เสียงเกิดจากสิ่งใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เพราะเหตุใดเสียงจึงเดินทางผ่านสุญญากาศไม่ได้', '["สุญญากาศร้อนเกินไป","ไม่มีอนุภาคให้ถ่ายทอดการสั่น","สุญญากาศดูดเสียงทั้งหมด","เสียงเดินทางได้เฉพาะในน้ำ"]'::jsonb, 1, 'เสียงเป็นคลื่นกล ต้องอาศัยอนุภาคของตัวกลางในการส่งต่อการสั่น'
where not exists (select 1 from public.questions where question_text = 'เพราะเหตุใดเสียงจึงเดินทางผ่านสุญญากาศไม่ได้');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'โดยทั่วไปเสียงเดินทางได้เร็วที่สุดในตัวกลางชนิดใด', '["สุญญากาศ","แก๊ส","ของเหลว","ของแข็ง"]'::jsonb, 3, 'อนุภาคในของแข็งอยู่ชิดและยึดโยงกันดี จึงส่งต่อการสั่นได้รวดเร็ว'
where not exists (select 1 from public.questions where question_text = 'โดยทั่วไปเสียงเดินทางได้เร็วที่สุดในตัวกลางชนิดใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงสูงหรือเสียงต่ำขึ้นอยู่กับปริมาณใดเป็นหลัก', '["ความถี่","อัตราเร็วลมเท่านั้น","ระยะทางเท่านั้น","ขนาดห้องเท่านั้น"]'::jsonb, 0, 'ความถี่สูงทำให้ได้ยินเสียงสูง ส่วนความถี่ต่ำทำให้ได้ยินเสียงต่ำ'
where not exists (select 1 from public.questions where question_text = 'เสียงสูงหรือเสียงต่ำขึ้นอยู่กับปริมาณใดเป็นหลัก');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'ความดังของเสียงสัมพันธ์กับลักษณะใดของคลื่นมากที่สุด', '["แอมพลิจูด","คาบเพียงอย่างเดียว","ความยาวคลื่นเพียงอย่างเดียว","ทิศเหนือ–ใต้"]'::jsonb, 0, 'คลื่นเสียงที่มีแอมพลิจูดมากมีความเข้มเสียงมาก จึงมักได้ยินดังขึ้น'
where not exists (select 1 from public.questions where question_text = 'ความดังของเสียงสัมพันธ์กับลักษณะใดของคลื่นมากที่สุด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'ระดับความดังของเสียงนิยมวัดด้วยหน่วยใด', '["เฮิรตซ์","เดซิเบล","เมตร","นิวตัน"]'::jsonb, 1, 'ระดับเสียงวัดเป็นเดซิเบล (dB) ส่วนเฮิรตซ์เป็นหน่วยของความถี่'
where not exists (select 1 from public.questions where question_text = 'ระดับความดังของเสียงนิยมวัดด้วยหน่วยใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เราเห็นฟ้าแลบก่อนจะได้ยินเสียงฟ้าร้อง เพราะเหตุใด', '["ฟ้าร้องเกิดทีหลังเสมอ","แสงเดินทางเร็วกว่าเสียงมาก","เสียงเดินทางผ่านอากาศไม่ได้","ตารับข้อมูลช้ากว่าหู"]'::jsonb, 1, 'แสงเดินทางเร็วกว่าเสียงมาก จึงมาถึงผู้สังเกตก่อนแม้เกิดขึ้นเกือบพร้อมกัน'
where not exists (select 1 from public.questions where question_text = 'เราเห็นฟ้าแลบก่อนจะได้ยินเสียงฟ้าร้อง เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงสะท้อนเกิดขึ้นเมื่อใด', '["เสียงกระทบพื้นผิวแล้วกลับมา","แหล่งกำเนิดหยุดสั่น","เสียงเดินทางในสุญญากาศ","เสียงเปลี่ยนเป็นแสง"]'::jsonb, 0, 'เสียงสะท้อนคือเสียงที่สะท้อนจากพื้นผิวและกลับมาถึงผู้ฟังภายหลังเสียงเดิม'
where not exists (select 1 from public.questions where question_text = 'เสียงสะท้อนเกิดขึ้นเมื่อใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'การติดวัสดุนุ่มที่ผนังห้องอัดเสียงมีประโยชน์อย่างไร', '["เพิ่มเสียงสะท้อน","ดูดกลืนเสียงและลดเสียงสะท้อน","ทำให้เสียงเดินทางในสุญญากาศได้","เพิ่มความถี่ทุกเสียง"]'::jsonb, 1, 'วัสดุนุ่มและมีรูพรุนช่วยดูดกลืนพลังงานเสียง จึงลดเสียงสะท้อนในห้อง'
where not exists (select 1 from public.questions where question_text = 'การติดวัสดุนุ่มที่ผนังห้องอัดเสียงมีประโยชน์อย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงที่มีความถี่สูงกว่า 20,000 Hz เรียกว่าอะไร', '["อินฟราซาวด์","อัลตราซาวด์","เสียงก้อง","เสียงบีต"]'::jsonb, 1, 'อัลตราซาวด์มีความถี่สูงกว่าช่วงการได้ยินโดยทั่วไปของมนุษย์'
where not exists (select 1 from public.questions where question_text = 'เสียงที่มีความถี่สูงกว่า 20,000 Hz เรียกว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงที่มีความถี่ต่ำกว่า 20 Hz เรียกว่าอะไร', '["อินฟราซาวด์","อัลตราซาวด์","เสียงสะท้อน","เสียงดนตรี"]'::jsonb, 0, 'อินฟราซาวด์เป็นเสียงความถี่ต่ำกว่าช่วงที่มนุษย์ทั่วไปได้ยิน'
where not exists (select 1 from public.questions where question_text = 'เสียงที่มีความถี่ต่ำกว่า 20 Hz เรียกว่าอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'ค้างคาวหลบสิ่งกีดขวางในความมืดได้โดยอาศัยหลักการใด', '["ส่งอัลตราซาวด์แล้วรับเสียงสะท้อน","มองเห็นรังสีเอกซ์","สร้างแสงจากปีก","หยุดเสียงรอบตัว"]'::jsonb, 0, 'ค้างคาวใช้เสียงความถี่สูงและวิเคราะห์เสียงสะท้อนเพื่อระบุตำแหน่งวัตถุ'
where not exists (select 1 from public.questions where question_text = 'ค้างคาวหลบสิ่งกีดขวางในความมืดได้โดยอาศัยหลักการใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เมื่อดีดสายกีตาร์ให้ตึงขึ้น โดยปัจจัยอื่นใกล้เคียงเดิม เสียงจะเปลี่ยนอย่างไร', '["ต่ำลง","สูงขึ้น","หายไป","เดินทางช้าลงเสมอ"]'::jsonb, 1, 'สายที่ตึงขึ้นสั่นด้วยความถี่สูงขึ้น จึงให้เสียงสูงขึ้น'
where not exists (select 1 from public.questions where question_text = 'เมื่อดีดสายกีตาร์ให้ตึงขึ้น โดยปัจจัยอื่นใกล้เคียงเดิม เสียงจะเปลี่ยนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'ส่วนใดของหูสั่นเมื่อคลื่นเสียงเดินทางมาถึง', '["เยื่อแก้วหู","เส้นผม","เปลือกตา","ลิ้น"]'::jsonb, 0, 'คลื่นเสียงทำให้เยื่อแก้วหูสั่น ก่อนส่งต่อการสั่นผ่านโครงสร้างในหู'
where not exists (select 1 from public.questions where question_text = 'ส่วนใดของหูสั่นเมื่อคลื่นเสียงเดินทางมาถึง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'วิธีใดช่วยลดความเสี่ยงต่อการสูญเสียการได้ยินจากหูฟัง', '["เพิ่มเสียงให้ดังที่สุด","ฟังต่อเนื่องหลายชั่วโมง","ลดระดับเสียงและพักหูเป็นระยะ","ใช้หูฟังเพียงข้างเดียวแต่เปิดดังมาก"]'::jsonb, 2, 'การลดระดับเสียงและจำกัดเวลารับเสียงดังช่วยลดความเสียหายต่อเซลล์รับเสียง'
where not exists (select 1 from public.questions where question_text = 'วิธีใดช่วยลดความเสี่ยงต่อการสูญเสียการได้ยินจากหูฟัง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 1, 'เสียงของเครื่องดนตรีสองชนิดอาจมีความถี่และความดังเท่ากัน แต่เรายังแยกได้เพราะสิ่งใด', '["คุณภาพเสียง","สีของเครื่องดนตรี","ความเร็วแสง","อุณหภูมิร่างกายผู้ฟัง"]'::jsonb, 0, 'รูปคลื่นและฮาร์มอนิกต่างกันทำให้คุณภาพเสียงต่างกัน เราจึงแยกแหล่งกำเนิดได้'
where not exists (select 1 from public.questions where question_text = 'เสียงของเครื่องดนตรีสองชนิดอาจมีความถี่และความดังเท่ากัน แต่เรายังแยกได้เพราะสิ่งใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'นักบินอวกาศสองคนอยู่นอกยานและไม่มีวิทยุ เหตุใดจึงพูดคุยกันโดยตรงไม่ได้', '["ชุดอวกาศสะท้อนแสง","บริเวณนั้นเกือบเป็นสุญญากาศ ไม่มีตัวกลางส่งเสียง","เสียงเดินทางเร็วเกินกว่าจะได้ยิน","อุณหภูมิต่ำทำให้หูหยุดทำงานทันที"]'::jsonb, 1, 'เสียงต้องอาศัยตัวกลาง แต่วิทยุใช้คลื่นแม่เหล็กไฟฟ้าซึ่งเดินทางผ่านสุญญากาศได้'
where not exists (select 1 from public.questions where question_text = 'นักบินอวกาศสองคนอยู่นอกยานและไม่มีวิทยุ เหตุใดจึงพูดคุยกันโดยตรงไม่ได้');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'เสียงมีอัตราเร็ว 340 m/s และความถี่ 170 Hz ความยาวคลื่นเท่าใด', '["0.5 m","2 m","170 m","510 m"]'::jsonb, 1, 'λ = v/f = 340/170 = 2 m'
where not exists (select 1 from public.questions where question_text = 'เสียงมีอัตราเร็ว 340 m/s และความถี่ 170 Hz ความยาวคลื่นเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'นักเรียนได้ยินเสียงสะท้อน 2 s หลังตะโกน ถ้าเสียงเดินทางด้วย 340 m/s หน้าผาอยู่ห่างเท่าใด', '["170 m","340 m","680 m","1,360 m"]'::jsonb, 1, 'เสียงเดินทางไปและกลับ ระยะถึงหน้าผาเท่ากับ (340 × 2)/2 = 340 m'
where not exists (select 1 from public.questions where question_text = 'นักเรียนได้ยินเสียงสะท้อน 2 s หลังตะโกน ถ้าเสียงเดินทางด้วย 340 m/s หน้าผาอยู่ห่างเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'เมื่อเคาะส้อมเสียงแล้วแตะก้านกับกล่องไม้ เสียงดังขึ้นเพราะเหตุใด', '["กล่องไม้สั่นร่วมและแผ่เสียงได้มากขึ้น","ความถี่ของส้อมเสียงเป็นศูนย์","กล่องไม้หยุดการสั่นทั้งหมด","เสียงเปลี่ยนเป็นแสง"]'::jsonb, 0, 'กล่องไม้รับการสั่นและทำให้อากาศบริเวณกว้างสั่นตาม จึงได้ยินเสียงดังขึ้น'
where not exists (select 1 from public.questions where question_text = 'เมื่อเคาะส้อมเสียงแล้วแตะก้านกับกล่องไม้ เสียงดังขึ้นเพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'ขณะรถพยาบาลเปิดไซเรนเคลื่อนเข้าหาผู้ฟัง ผู้ฟังจะได้ยินเสียงอย่างไรเมื่อเทียบกับตอนรถหยุด', '["ความถี่สูงขึ้น","ความถี่ต่ำลง","ความถี่เป็นศูนย์","ไม่มีการเปลี่ยนแปลงใดเลย"]'::jsonb, 0, 'การเคลื่อนเข้าหาทำให้หน้าคลื่นมาถึงถี่ขึ้น ผู้ฟังจึงได้ยินความถี่สูงขึ้นตามปรากฏการณ์ดอปเพลอร์'
where not exists (select 1 from public.questions where question_text = 'ขณะรถพยาบาลเปิดไซเรนเคลื่อนเข้าหาผู้ฟัง ผู้ฟังจะได้ยินเสียงอย่างไรเมื่อเทียบกับตอนรถหยุด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'เมื่อรถพยาบาลเคลื่อนผ่านและออกห่าง ผู้ฟังจะสังเกตว่าเสียงไซเรนเปลี่ยนอย่างไร', '["สูงขึ้นทันที","ต่ำลง","ดังเท่าเดิมและสูงเท่าเดิม","กลายเป็นอัลตราซาวด์เสมอ"]'::jsonb, 1, 'เมื่อแหล่งกำเนิดออกห่าง หน้าคลื่นมาถึงห่างขึ้น ความถี่ที่ผู้ฟังรับจึงลดลง'
where not exists (select 1 from public.questions where question_text = 'เมื่อรถพยาบาลเคลื่อนผ่านและออกห่าง ผู้ฟังจะสังเกตว่าเสียงไซเรนเปลี่ยนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'สายกีตาร์สองเส้นยาวและตึงเท่ากัน แต่สายหนึ่งมีมวลต่อความยาวมากกว่า สายนั้นมักให้เสียงอย่างไร', '["สูงกว่า","ต่ำกว่า","ดังเป็นศูนย์","มีอัตราเร็วแสงมากกว่า"]'::jsonb, 1, 'สายที่หนักกว่าต่อหน่วยความยาวสั่นได้ช้ากว่า จึงมีความถี่และระดับเสียงต่ำกว่า'
where not exists (select 1 from public.questions where question_text = 'สายกีตาร์สองเส้นยาวและตึงเท่ากัน แต่สายหนึ่งมีมวลต่อความยาวมากกว่า สายนั้นมักให้เสียงอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'ห้องประชุมมีเสียงก้องจนฟังคำพูดไม่ชัด วิธีแก้ใดเหมาะสมที่สุด', '["ปูพรมและติดม่านหนา","เพิ่มผนังกระจกเรียบ","เอาเก้าอี้นุ่มออกทั้งหมด","เพิ่มลำโพงให้ดังที่สุด"]'::jsonb, 0, 'พรมและม่านช่วยดูดกลืนเสียง ลดการสะท้อนหลายครั้งที่ทำให้คำพูดซ้อนกัน'
where not exists (select 1 from public.questions where question_text = 'ห้องประชุมมีเสียงก้องจนฟังคำพูดไม่ชัด วิธีแก้ใดเหมาะสมที่สุด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'ถ้าแหล่งกำเนิดเสียงสั่นด้วยความถี่เท่าเดิมแต่แอมพลิจูดเพิ่มขึ้น ผู้ฟังมักได้ยินอย่างไร', '["เสียงดังขึ้นแต่ระดับเสียงสูง–ต่ำใกล้เดิม","เสียงสูงขึ้นแต่ความดังเท่าเดิม","เสียงต่ำลงและเบาลง","ไม่เกิดเสียง"]'::jsonb, 0, 'แอมพลิจูดสัมพันธ์กับความดัง ส่วนความถี่สัมพันธ์กับเสียงสูง–ต่ำ'
where not exists (select 1 from public.questions where question_text = 'ถ้าแหล่งกำเนิดเสียงสั่นด้วยความถี่เท่าเดิมแต่แอมพลิจูดเพิ่มขึ้น ผู้ฟังมักได้ยินอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 2, 'โซนาร์บนเรือใช้หลักการใดในการหาระยะถึงวัตถุใต้น้ำ', '["วัดเวลาที่เสียงเดินทางไปและสะท้อนกลับ","วัดสีของน้ำ","วัดความเร็วแสงในอากาศ","วัดความดังของเครื่องยนต์เท่านั้น"]'::jsonb, 0, 'โซนาร์ส่งเสียงในน้ำและใช้เวลาไป–กลับของเสียงสะท้อนคำนวณระยะทาง'
where not exists (select 1 from public.questions where question_text = 'โซนาร์บนเรือใช้หลักการใดในการหาระยะถึงวัตถุใต้น้ำ');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 3, 'เรือส่งคลื่นเสียงลงสู่ก้นทะเลและรับสัญญาณกลับใน 0.8 s ถ้าเสียงในน้ำเร็ว 1,500 m/s ทะเลลึกเท่าใด', '["300 m","600 m","1,200 m","1,875 m"]'::jsonb, 1, 'ระยะทางไป–กลับคือ 1,500 × 0.8 = 1,200 m ดังนั้นความลึกเท่ากับ 600 m'
where not exists (select 1 from public.questions where question_text = 'เรือส่งคลื่นเสียงลงสู่ก้นทะเลและรับสัญญาณกลับใน 0.8 s ถ้าเสียงในน้ำเร็ว 1,500 m/s ทะเลลึกเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 3, 'เสียงความถี่ 500 Hz เดินทางจากอากาศเข้าสู่น้ำ ข้อใดถูกต้อง', '["ความถี่เพิ่มและอัตราเร็วลด","ความถี่ลดและอัตราเร็วคงเดิม","ความถี่คงเดิม แต่อัตราเร็วและความยาวคลื่นเปลี่ยน","ความถี่และความยาวคลื่นคงเดิมเสมอ"]'::jsonb, 2, 'ความถี่กำหนดโดยแหล่งกำเนิดจึงคงเดิม แต่อัตราเร็วต่างกันในแต่ละตัวกลาง ทำให้ความยาวคลื่นเปลี่ยน'
where not exists (select 1 from public.questions where question_text = 'เสียงความถี่ 500 Hz เดินทางจากอากาศเข้าสู่น้ำ ข้อใดถูกต้อง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 3, 'คลื่นเสียงมีความยาวคลื่น 0.85 m ในอากาศที่เสียงเร็ว 340 m/s คาบของคลื่นเท่าใด', '["0.0025 s","0.25 s","2.5 s","400 s"]'::jsonb, 0, 'f = v/λ = 340/0.85 = 400 Hz และ T = 1/400 = 0.0025 s'
where not exists (select 1 from public.questions where question_text = 'คลื่นเสียงมีความยาวคลื่น 0.85 m ในอากาศที่เสียงเร็ว 340 m/s คาบของคลื่นเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'เสียง', 3, 'ส้อมเสียงสองอันให้เสียงเกือบเท่ากัน แต่เมื่อดังพร้อมกันได้ยินเสียงดัง–ค่อยสลับกัน ปรากฏการณ์นี้เกิดจากอะไร', '["การหักเหของแสง","การแทรกสอดของเสียงที่มีความถี่ใกล้กัน","เสียงเดินทางในสุญญากาศ","ความถี่ทั้งสองเป็นศูนย์"]'::jsonb, 1, 'คลื่นเสียงความถี่ใกล้กันเสริมและหักล้างสลับกัน ทำให้เกิดบีตที่ได้ยินดัง–ค่อยเป็นจังหวะ'
where not exists (select 1 from public.questions where question_text = 'ส้อมเสียงสองอันให้เสียงเกือบเท่ากัน แต่เมื่อดังพร้อมกันได้ยินเสียงดัง–ค่อยสลับกัน ปรากฏการณ์นี้เกิดจากอะไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'ในตัวกลางเนื้อเดียวกัน แสงมีแนวโน้มเดินทางอย่างไร', '["เป็นเส้นตรง","เป็นวงกลมเสมอ","หยุดนิ่ง","ย้อนเวลา"]'::jsonb, 0, 'แสงเดินทางเป็นเส้นตรงในตัวกลางโปร่งใสที่มีสมบัติสม่ำเสมอ'
where not exists (select 1 from public.questions where question_text = 'ในตัวกลางเนื้อเดียวกัน แสงมีแนวโน้มเดินทางอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'วัตถุชนิดใดยอมให้แสงผ่านและมองเห็นสิ่งด้านหลังได้ชัด', '["วัตถุโปร่งใส","วัตถุโปร่งแสง","วัตถุทึบแสง","วัตถุดำทุกชนิด"]'::jsonb, 0, 'วัตถุโปร่งใสให้แสงผ่านได้มากและเป็นระเบียบ จึงมองเห็นด้านหลังชัด'
where not exists (select 1 from public.questions where question_text = 'วัตถุชนิดใดยอมให้แสงผ่านและมองเห็นสิ่งด้านหลังได้ชัด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'ข้อใดเป็นวัสดุโปร่งแสง', '["กระจกใส","กระดาษไข","แผ่นโลหะ","กระจกเงา"]'::jsonb, 1, 'กระดาษไขให้แสงผ่านบางส่วนแต่กระจายแสง ทำให้มองสิ่งด้านหลังไม่ชัด'
where not exists (select 1 from public.questions where question_text = 'ข้อใดเป็นวัสดุโปร่งแสง');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'กฎการสะท้อนของแสงระบุว่าอย่างไร', '["มุมตกกระทบเท่ากับมุมสะท้อน","มุมตกกระทบเป็นสองเท่าของมุมสะท้อน","แสงสะท้อนตั้งฉากกับผิวเสมอ","แสงไม่สะท้อนจากผิวเรียบ"]'::jsonb, 0, 'มุมตกกระทบและมุมสะท้อนวัดจากเส้นปกติ และมีค่าเท่ากัน'
where not exists (select 1 from public.questions where question_text = 'กฎการสะท้อนของแสงระบุว่าอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'ภาพจากกระจกเงาราบมีลักษณะใด', '["ภาพจริง กลับหัว","ภาพเสมือน หัวตั้ง ขนาดเท่าวัตถุ","ภาพจริง ขยายเสมอ","ภาพเสมือน เล็กลงเสมอ"]'::jsonb, 1, 'กระจกเงาราบให้ภาพเสมือน หัวตั้ง ขนาดเท่าวัตถุ และอยู่หลังกระจก'
where not exists (select 1 from public.questions where question_text = 'ภาพจากกระจกเงาราบมีลักษณะใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'หลอดที่แช่ในแก้วน้ำดูเหมือนหัก เกิดจากปรากฏการณ์ใด', '["การสะท้อนเสียง","การหักเหของแสง","การเกิดเงา","การดูดกลืนทั้งหมด"]'::jsonb, 1, 'แสงเปลี่ยนอัตราเร็วและทิศทางเมื่อผ่านรอยต่อระหว่างน้ำกับอากาศ จึงเห็นตำแหน่งคลาดเคลื่อน'
where not exists (select 1 from public.questions where question_text = 'หลอดที่แช่ในแก้วน้ำดูเหมือนหัก เกิดจากปรากฏการณ์ใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'เลนส์นูนมีสมบัติเด่นอย่างไรต่อแสงขนาน', '["ทำให้แสงรวมกัน","ทำให้แสงหยุดนิ่ง","สะท้อนแสงกลับทั้งหมด","เปลี่ยนแสงเป็นเสียง"]'::jsonb, 0, 'เลนส์นูนเป็นเลนส์รวมแสง ทำให้ลำแสงขนานหักเหไปพบกันใกล้จุดโฟกัส'
where not exists (select 1 from public.questions where question_text = 'เลนส์นูนมีสมบัติเด่นอย่างไรต่อแสงขนาน');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'เลนส์เว้าทำให้ลำแสงขนานเป็นอย่างไร', '["รวมกันที่จุดจริง","กระจายออกจากกัน","เดินทางย้อนกลับทั้งหมด","มีความถี่เป็นศูนย์"]'::jsonb, 1, 'เลนส์เว้าเป็นเลนส์กระจายแสง ทำให้ลำแสงหักเหแยกออกจากกัน'
where not exists (select 1 from public.questions where question_text = 'เลนส์เว้าทำให้ลำแสงขนานเป็นอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'แว่นขยายใช้เลนส์ชนิดใด', '["เลนส์นูน","เลนส์เว้า","กระจกเงาราบ","ปริซึมทึบแสง"]'::jsonb, 0, 'เมื่อวางวัตถุใกล้เลนส์นูนกว่าระยะโฟกัส จะเห็นภาพเสมือนหัวตั้งและขยาย'
where not exists (select 1 from public.questions where question_text = 'แว่นขยายใช้เลนส์ชนิดใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'ภาพชนิดใดสามารถรับบนฉากได้', '["ภาพจริง","ภาพเสมือนเท่านั้น","ภาพในกระจกเงาราบเท่านั้น","ภาพที่ไม่มีแสง"]'::jsonb, 0, 'ภาพจริงเกิดจากลำแสงมารวมกันจริง จึงรับภาพบนฉากได้'
where not exists (select 1 from public.questions where question_text = 'ภาพชนิดใดสามารถรับบนฉากได้');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'แสงขาวผ่านปริซึมแล้วแยกเป็นหลายสี เรียกปรากฏการณ์ใด', '["การกระจายแสง","การสะท้อนเสียง","การเกิดบีต","การสั่นพ้อง"]'::jsonb, 0, 'สีต่าง ๆ ในแสงขาวหักเหไม่เท่ากัน จึงแยกออกเป็นแถบสเปกตรัม'
where not exists (select 1 from public.questions where question_text = 'แสงขาวผ่านปริซึมแล้วแยกเป็นหลายสี เรียกปรากฏการณ์ใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'รุ้งกินน้ำเกิดจากสมบัติใดของแสงในหยดน้ำเป็นสำคัญ', '["การหักเห การกระจายแสง และการสะท้อนภายใน","การสั่นของอากาศเท่านั้น","การดูดกลืนแสงทุกสี","การเปลี่ยนแสงเป็นเสียง"]'::jsonb, 0, 'แสงอาทิตย์หักเหและแยกสีเมื่อเข้าหยดน้ำ สะท้อนภายใน แล้วหักเหออกสู่ตา'
where not exists (select 1 from public.questions where question_text = 'รุ้งกินน้ำเกิดจากสมบัติใดของแสงในหยดน้ำเป็นสำคัญ');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'วัตถุสีแดงภายใต้แสงขาวดูเป็นสีแดง เพราะเหตุใด', '["สะท้อนแสงสีแดงเข้าสู่ตาได้มาก","สร้างแสงขาวใหม่ทั้งหมด","ดูดกลืนเฉพาะสีแดง","ไม่มีแสงสะท้อนจากวัตถุ"]'::jsonb, 0, 'วัตถุสีแดงสะท้อนแสงสีแดงได้ดีและดูดกลืนสีอื่นเป็นส่วนใหญ่'
where not exists (select 1 from public.questions where question_text = 'วัตถุสีแดงภายใต้แสงขาวดูเป็นสีแดง เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'การผสมแสงสีแดง เขียว และน้ำเงินในสัดส่วนเหมาะสมให้แสงสีใด', '["ดำ","ขาว","เหลืองเท่านั้น","น้ำตาล"]'::jsonb, 1, 'แดง เขียว และน้ำเงินเป็นแม่สีของแสง เมื่อรวมอย่างเหมาะสมจะเห็นเป็นแสงขาว'
where not exists (select 1 from public.questions where question_text = 'การผสมแสงสีแดง เขียว และน้ำเงินในสัดส่วนเหมาะสมให้แสงสีใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'เงามืดเกิดขึ้นเพราะเหตุใด', '["แสงเดินทางเป็นเส้นตรงและถูกวัตถุทึบแสงบัง","แสงเดินทางอ้อมวัตถุทุกชนิดได้หมด","วัตถุสร้างความมืดออกมา","อากาศหยุดสั่น"]'::jsonb, 0, 'วัตถุทึบแสงกั้นแนวทางเดินของแสง ทำให้บริเวณด้านหลังได้รับแสงไม่ถึง'
where not exists (select 1 from public.questions where question_text = 'เงามืดเกิดขึ้นเพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 1, 'กระจกมองข้างของรถมักใช้กระจกนูน เพราะเหตุใด', '["ให้ภาพขยายมากและเห็นพื้นที่แคบ","ให้ภาพหัวตั้งขนาดเล็กและเห็นมุมกว้าง","ให้ภาพจริงบนฉาก","ทำให้รถด้านหลังอยู่ใกล้ขึ้นจริง"]'::jsonb, 1, 'กระจกนูนให้ภาพเสมือนหัวตั้งขนาดเล็ก จึงมองเห็นบริเวณกว้างขึ้น'
where not exists (select 1 from public.questions where question_text = 'กระจกมองข้างของรถมักใช้กระจกนูน เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'วัตถุอยู่หน้ากระจกเงาราบ 2 m ภาพจะอยู่ห่างจากวัตถุเท่าใด', '["1 m","2 m","4 m","8 m"]'::jsonb, 2, 'ภาพอยู่หลังกระจก 2 m เท่ากับระยะวัตถุ จึงห่างจากวัตถุรวม 4 m'
where not exists (select 1 from public.questions where question_text = 'วัตถุอยู่หน้ากระจกเงาราบ 2 m ภาพจะอยู่ห่างจากวัตถุเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'รังสีแสงตกกระทบกระจกทำมุม 30° กับเส้นปกติ มุมสะท้อนมีค่าเท่าใด', '["15°","30°","60°","90°"]'::jsonb, 1, 'ตามกฎการสะท้อน มุมสะท้อนเท่ากับมุมตกกระทบเมื่อวัดจากเส้นปกติ'
where not exists (select 1 from public.questions where question_text = 'รังสีแสงตกกระทบกระจกทำมุม 30° กับเส้นปกติ มุมสะท้อนมีค่าเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'แสงเดินทางจากอากาศเข้าสู่แก้วในแนวเฉียง โดยทั่วไปจะเบนอย่างไร', '["เบนเข้าหาเส้นปกติ","เบนออกจากเส้นปกติ","สะท้อนกลับทั้งหมดเสมอ","ไม่เปลี่ยนอัตราเร็ว"]'::jsonb, 0, 'แสงช้าลงเมื่อเข้าสู่แก้วจากอากาศ จึงหักเหเข้าหาเส้นปกติ'
where not exists (select 1 from public.questions where question_text = 'แสงเดินทางจากอากาศเข้าสู่แก้วในแนวเฉียง โดยทั่วไปจะเบนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'แสงเดินทางจากแก้วสู่อากาศในแนวเฉียง โดยยังไม่เกิดการสะท้อนกลับหมด จะเบนอย่างไร', '["เข้าหาเส้นปกติ","ออกจากเส้นปกติ","ไปตามเส้นปกติเสมอ","หยุดที่ผิวแก้ว"]'::jsonb, 1, 'เมื่อแสงเข้าสู่ตัวกลางที่แสงเดินทางเร็วกว่า รังสีจะหักเหออกจากเส้นปกติ'
where not exists (select 1 from public.questions where question_text = 'แสงเดินทางจากแก้วสู่อากาศในแนวเฉียง โดยยังไม่เกิดการสะท้อนกลับหมด จะเบนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'วางวัตถุไกลกว่า 2 เท่าของระยะโฟกัสหน้าเลนส์นูน ภาพที่ได้โดยทั่วไปเป็นอย่างไร', '["ภาพจริง กลับหัว ขนาดเล็กลง","ภาพเสมือน หัวตั้ง ขยาย","ภาพเสมือน กลับหัว","ไม่เกิดภาพใดเลย"]'::jsonb, 0, 'วัตถุอยู่นอก 2F ทำให้เลนส์นูนสร้างภาพจริงกลับหัว อยู่ระหว่าง F กับ 2F และเล็กลง'
where not exists (select 1 from public.questions where question_text = 'วางวัตถุไกลกว่า 2 เท่าของระยะโฟกัสหน้าเลนส์นูน ภาพที่ได้โดยทั่วไปเป็นอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'วางวัตถุใกล้เลนส์นูนกว่าระยะโฟกัส จะเห็นภาพแบบใด', '["ภาพจริง กลับหัว เล็กลง","ภาพเสมือน หัวตั้ง ขยาย","ภาพจริง หัวตั้ง","ภาพเสมือน กลับหัว"]'::jsonb, 1, 'เมื่อตำแหน่งวัตถุอยู่ภายในระยะโฟกัส เลนส์นูนทำหน้าที่เป็นแว่นขยาย'
where not exists (select 1 from public.questions where question_text = 'วางวัตถุใกล้เลนส์นูนกว่าระยะโฟกัส จะเห็นภาพแบบใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'คนสายตาสั้นมองวัตถุไกลไม่ชัด มักแก้ด้วยเลนส์ชนิดใด', '["เลนส์เว้า","เลนส์นูน","กระจกเว้า","กระจกเงาราบ"]'::jsonb, 0, 'เลนส์เว้าช่วยกระจายแสงก่อนเข้าตา ทำให้จุดโฟกัสเลื่อนไปตกบนจอตา'
where not exists (select 1 from public.questions where question_text = 'คนสายตาสั้นมองวัตถุไกลไม่ชัด มักแก้ด้วยเลนส์ชนิดใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'ใยแก้วนำแสงส่งสัญญาณได้โดยอาศัยปรากฏการณ์ใดเป็นหลัก', '["การสะท้อนกลับหมดภายใน","การเกิดเสียงสะท้อน","การดูดกลืนแสงทั้งหมด","การกระจายแสงออกจากแกน"]'::jsonb, 0, 'แสงสะท้อนกลับหมดซ้ำ ๆ ภายในแกนใยแก้ว จึงเดินทางไปได้ไกลโดยสูญเสียน้อย'
where not exists (select 1 from public.questions where question_text = 'ใยแก้วนำแสงส่งสัญญาณได้โดยอาศัยปรากฏการณ์ใดเป็นหลัก');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'ต้องการรับภาพของวัตถุบนฉากโดยใช้เลนส์ ควรเลือกอุปกรณ์ใด', '["เลนส์นูน โดยจัดวัตถุให้อยู่นอกระยะโฟกัส","เลนส์เว้า ไม่ว่าจัดวัตถุที่ใด","กระจกเงาราบและวางฉากหลังกระจก","แผ่นทึบแสงเพียงแผ่นเดียว"]'::jsonb, 0, 'เลนส์นูนสร้างภาพจริงรับบนฉากได้เมื่อวัตถุอยู่นอกระยะโฟกัส'
where not exists (select 1 from public.questions where question_text = 'ต้องการรับภาพของวัตถุบนฉากโดยใช้เลนส์ ควรเลือกอุปกรณ์ใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 2, 'เสื้อสีน้ำเงินถูกส่องด้วยแสงสีแดงเพียงสีเดียว จะมองเห็นใกล้เคียงสีใด', '["น้ำเงินสว่าง","แดงสว่าง","มืดหรือเกือบดำ","ขาว"]'::jsonb, 2, 'เสื้อสีน้ำเงินสะท้อนแสงสีน้ำเงินได้ดี แต่เมื่อมีเพียงแสงแดงจึงแทบไม่มีแสงที่สะท้อนเข้าตา'
where not exists (select 1 from public.questions where question_text = 'เสื้อสีน้ำเงินถูกส่องด้วยแสงสีแดงเพียงสีเดียว จะมองเห็นใกล้เคียงสีใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'รังสีตกกระทบทำมุม 20° กับผิวกระจก มุมระหว่างรังสีตกกระทบกับรังสีสะท้อนเท่าใด', '["20°","40°","140°","160°"]'::jsonb, 2, 'รังสีทำมุม 70° กับเส้นปกติ มุมเล็กระหว่างแนวรังสีตกกระทบกับรังสีสะท้อนจึงเป็น 2 × 70° = 140°'
where not exists (select 1 from public.questions where question_text = 'รังสีตกกระทบทำมุม 20° กับผิวกระจก มุมระหว่างรังสีตกกระทบกับรังสีสะท้อนเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'คนเดินเข้าหากระจกเงาราบด้วยอัตราเร็ว 1 m/s ระยะระหว่างคนกับภาพลดลงด้วยอัตราเท่าใด', '["0.5 m/s","1 m/s","2 m/s","4 m/s"]'::jsonb, 2, 'ภาพเคลื่อนเข้าหากระจกจากอีกด้านด้วยอัตราเร็วเท่ากัน ระยะระหว่างคนกับภาพจึงลดลง 2 m/s'
where not exists (select 1 from public.questions where question_text = 'คนเดินเข้าหากระจกเงาราบด้วยอัตราเร็ว 1 m/s ระยะระหว่างคนกับภาพลดลงด้วยอัตราเท่าใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'วางวัตถุที่ระยะ 2F หน้าเลนส์นูน ภาพที่เกิดมีลักษณะใด', '["อยู่ที่ F และเล็กลง","อยู่ที่ 2F อีกด้าน กลับหัว และขนาดเท่าวัตถุ","อยู่ด้านเดียวกับวัตถุ หัวตั้ง และขยาย","อยู่ที่อนันต์เสมอ"]'::jsonb, 1, 'สำหรับเลนส์นูน วัตถุที่ 2F ให้ภาพจริงกลับหัวที่ 2F อีกด้านและมีขนาดเท่ากัน'
where not exists (select 1 from public.questions where question_text = 'วางวัตถุที่ระยะ 2F หน้าเลนส์นูน ภาพที่เกิดมีลักษณะใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'วัตถุเคลื่อนจากตำแหน่งไกลมากเข้าหาเลนส์นูน แต่ยังอยู่นอก 2F ภาพจริงจะเปลี่ยนอย่างไร', '["เคลื่อนเข้าใกล้เลนส์และเล็กลง","เคลื่อนออกจากเลนส์และมีขนาดใหญ่ขึ้น","อยู่ตำแหน่งเดิมและขนาดเท่าเดิม","กลายเป็นภาพเสมือนทันที"]'::jsonb, 1, 'เมื่อวัตถุเข้าใกล้เลนส์จากระยะไกล ภาพจริงจะเคลื่อนจากใกล้ F ออกไปทาง 2F และขยายขึ้น'
where not exists (select 1 from public.questions where question_text = 'วัตถุเคลื่อนจากตำแหน่งไกลมากเข้าหาเลนส์นูน แต่ยังอยู่นอก 2F ภาพจริงจะเปลี่ยนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'เงื่อนไขใดจำเป็นต่อการเกิดการสะท้อนกลับหมดภายใน', '["แสงเดินจากตัวกลางเบาบางไปหนาแน่นกว่าเท่านั้น","แสงเดินจากตัวกลางที่ดัชนีหักเหมากไปน้อย และมุมตกกระทบมากกว่ามุมวิกฤต","แสงตกตั้งฉากกับผิวเสมอ","แสงต้องเป็นสีขาวเท่านั้น"]'::jsonb, 1, 'การสะท้อนกลับหมดเกิดได้เมื่อแสงมุ่งสู่ตัวกลางที่ดัชนีหักเหน้อยกว่าและตกกระทบเกินมุมวิกฤต'
where not exists (select 1 from public.questions where question_text = 'เงื่อนไขใดจำเป็นต่อการเกิดการสะท้อนกลับหมดภายใน');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'ปริซึมแยกแสงสีม่วงออกจากสีแดงได้ เพราะเหตุใด', '["สีม่วงและสีแดงมีอัตราเร็วในแก้วต่างกัน จึงหักเหไม่เท่ากัน","สีแดงไม่มีพลังงาน","สีม่วงเดินทางในสุญญากาศไม่ได้","ปริซึมสร้างสีใหม่จากความมืด"]'::jsonb, 0, 'ดัชนีหักเหของแก้วขึ้นกับความยาวคลื่น ทำให้แต่ละสีมีอัตราเร็วและมุมหักเหต่างกัน'
where not exists (select 1 from public.questions where question_text = 'ปริซึมแยกแสงสีม่วงออกจากสีแดงได้ เพราะเหตุใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'ถ้าฉายแสงสีแดงและแสงสีเขียวซ้อนกันบนฉากขาว บริเวณซ้อนทับจะเห็นเป็นสีใด', '["เหลือง","น้ำเงิน","ม่วงแดง","ดำ"]'::jsonb, 0, 'การผสมแสงแบบบวกของแสงสีแดงกับสีเขียวให้แสงสีเหลือง'
where not exists (select 1 from public.questions where question_text = 'ถ้าฉายแสงสีแดงและแสงสีเขียวซ้อนกันบนฉากขาว บริเวณซ้อนทับจะเห็นเป็นสีใด');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'กล้องรูเข็มให้ภาพกลับหัวบนฉาก ถ้าขยับฉากให้ไกลจากรูเข็มมากขึ้น โดยตำแหน่งวัตถุคงเดิม ภาพจะเปลี่ยนอย่างไร', '["ใหญ่ขึ้นและมักมืดลง","เล็กลงและสว่างขึ้นเสมอ","หัวตั้งและขนาดเท่าเดิม","หายไปเพราะแสงเลี้ยวเบนหมด"]'::jsonb, 0, 'เรขาคณิตของรังสีทำให้ภาพขยายเมื่อฉากไกลรูขึ้น แต่พลังงานแสงกระจายบนพื้นที่มากขึ้นจึงมักมืดลง'
where not exists (select 1 from public.questions where question_text = 'กล้องรูเข็มให้ภาพกลับหัวบนฉาก ถ้าขยับฉากให้ไกลจากรูเข็มมากขึ้น โดยตำแหน่งวัตถุคงเดิม ภาพจะเปลี่ยนอย่างไร');

insert into public.questions (subject, category, difficulty, question_text, choices, correct_index, explanation)
select 'science', 'แสง', 3, 'เหรียญที่อยู่ก้นถ้วยน้ำดูเหมือนตื้นกว่าตำแหน่งจริง เพราะเหตุใด', '["แสงจากเหรียญหักเหออกจากเส้นปกติเมื่อออกจากน้ำสู่ตา และสมองย้อนแนวแสงเป็นเส้นตรง","เหรียญลอยสูงขึ้นเมื่อมีผู้มอง","น้ำทำให้แสงเดินเป็นวงกลม","แสงจากเหรียญสะท้อนกลับหมดทุกแนว"]'::jsonb, 0, 'รังสีหักเหออกจากเส้นปกติเมื่อออกสู่อากาศ ตาจึงย้อนแนวรังสีไปยังตำแหน่งภาพเสมือนที่ตื้นกว่าจริง'
where not exists (select 1 from public.questions where question_text = 'เหรียญที่อยู่ก้นถ้วยน้ำดูเหมือนตื้นกว่าตำแหน่งจริง เพราะเหตุใด');
