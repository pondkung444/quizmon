# QuizMon Question Image Standard

มาตรฐานสำหรับรูปประกอบโจทย์ใน QuizMon ใช้กับการสร้างข้อสอบใหม่และการปรับปรุงคลังข้อสอบเดิม

## 1. รูปแบบไฟล์

### 1.1 เรขาคณิต / แผนภาพ / กราฟ
- ใช้ **SVG เท่านั้น**
- เหมาะกับเส้น จุด ป้ายกำกับ รูปเรขาคณิต กราฟ และแผนภาพเชิงโครงสร้าง
- ห้ามใช้รูปถ่ายหรือ AI-generated bitmap สำหรับงานประเภทนี้ เพราะไฟล์ใหญ่กว่าและแก้ไข/สร้างซ้ำได้ยากกว่า

### 1.2 รูปภาพจริง
ใช้เมื่อจำเป็นจริง เช่น สิ่งมีชีวิต อวัยวะ วัตถุทดลอง หรือภาพที่ไม่เหมาะกับการวาดเป็น SVG
- ใช้ **WebP**
- บีบอัดให้ไม่เกินประมาณ **50 KB ต่อรูป**

## 2. Visual Style
- Canvas ประมาณ **980 × 520 px** (อัตราส่วนประมาณ 1.9:1)
- พื้นหลังสีขาว
- เส้นหลักสี `#111`
- `stroke-width` ประมาณ `6`
- ไม่มีสีตกแต่ง เงา หรือ gradient
- ตัวอักษรใช้ **Arial Bold**
- ตัวอักษรและตัวเลขต้องใหญ่พออ่านชัดบนมือถือ
- ป้ายกำกับต้องเว้นจากเส้นของรูป ห้ามตัวอักษรทับเส้น
- รูปต้องอ่านความสัมพันธ์ของจุด/ด้าน/มุมได้ทันทีโดยไม่ต้องซูม

## 3. Storage และ Database

### 3.1 ห้ามเก็บ Base64 ใน DB
ห้ามนำ Base64 หรือ data URI ฝังตรงใน `questions.image_url`

Workflow ที่ถูกต้อง:
1. สร้าง question เป็น `draft`
2. ได้ `question_id`
3. สร้างไฟล์รูปตาม question ID
4. Upload รูปเข้า **Supabase Storage**
5. เก็บเฉพาะ public/signed URL ใน `questions.image_url`
6. เปลี่ยนสถานะเป็น `pending_review`
7. ผ่าน review แล้วจึงเปลี่ยนเป็น `active`

### 3.2 ชื่อไฟล์
ชื่อไฟล์ต้องอิง `question_id` เพื่อป้องกัน overwrite และ trace กลับได้ง่าย

ตัวอย่าง:
- `q3604.svg`
- `q4120.webp`

## 4. Review Status
ห้าม auto-insert ข้อใหม่เป็น `active` โดยตรง

สถานะมาตรฐาน:
- `draft` — สร้างเนื้อหา/metadata เบื้องต้นแล้ว
- `pending_review` — รูปและข้อมูลครบ พร้อมให้ตรวจ
- `active` — ผ่านการตรวจแล้วเท่านั้น

## 5. ตำแหน่งของรูป
- รูปประกอบใส่ได้เฉพาะ **question stem**
- ห้ามใส่รูปใน choices / ตัวเลือกคำตอบ
- ถ้าโจทย์ตอบได้ชัดเจนโดยไม่ต้องมีรูป ไม่ควรเพิ่มรูปโดยไม่จำเป็น

## 6. Metadata ที่ต้องมีสำหรับรูป
ทุกครั้งที่สร้างรูป ต้องเก็บหรือส่งข้อมูลต่อไปนี้พร้อมกัน
- `question_id`
- `filename`
- `image_url`
- `image_prompt`
- `image_type` เช่น `svg` หรือ `webp`
- `review_status`

### image_prompt
`image_prompt` คือคำอธิบายที่ใช้สร้างรูปหรือแผนภาพนั้น เพื่อให้สามารถ debug หรือ regenerate ได้ภายหลัง

ตัวอย่าง:
```text
Draw triangle ABC with D on AB and E on AC, DE parallel to BC. Label AD=6, AB=15, AE=10, EC=? Use white background, #111 strokes, 6px lines, Arial Bold labels, 980x520 canvas. Keep every label clear of the geometry lines.
```

## 7. Quality Checklist ก่อน Pending Review
- รูปตรงกับโจทย์ทุกตัวเลขและทุก label
- จุด/ด้าน/มุมคู่สมนัยไม่สลับ
- ตัวอักษรไม่ทับเส้น
- อ่านได้บนหน้าจอมือถือ
- ไม่มีข้อมูลเฉลยหลุดในรูป
- ไม่มีรูปอยู่ใน choices
- URL ชี้ไป Supabase Storage ไม่ใช่ Base64
- filename ตรงกับ question ID
- มี `image_prompt`

## 8. Legacy Technical Debt
ข้อเก่าบางส่วนอาจมี SVG/JPEG แบบ Base64 อยู่ใน `questions.image_url` จาก workflow เดิม

ข้อเหล่านี้ไม่ใช่มาตรฐานสำหรับงานใหม่ และควร migrate ภายหลังเป็น:

`Base64 in DB → Supabase Storage object → URL in questions.image_url`

การ migrate ของเก่าควรทำเป็นงาน cleanup แยก ไม่ควรปนกับการสร้างข้อใหม่

## 9. Standard Workflow Summary
```text
Draft question
  ↓
Create question_id
  ↓
Generate SVG/WebP
  ↓
Upload to Supabase Storage
  ↓
Save URL + image_prompt
  ↓
pending_review
  ↓
Human review
  ↓
active
```

---

**Status:** Locked standard for new QuizMon question-image work from 2026-08-27 onward.
