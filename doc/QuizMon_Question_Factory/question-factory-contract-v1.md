# QuizMon Question Factory Contract v1

**Status:** LOCKED  
**Purpose:** กติกากลางของ QuizMon Question Factory v1 สำหรับการผลิตข้อสอบทุกระดับ/ทุกวิชา โดยไม่ผูก Factory Core กับ Junior, ม.1–3, วิชาใดวิชาหนึ่ง หรือรูปแบบข้อสอบปัจจุบัน

---

## 1. Core Principle

Question Factory แยกออกเป็น:
1. Factory Core
2. Skills
3. Curriculum / Content Profiles

Factory Core ต้องไม่ hardcode:
- education stage
- grade
- subject
- curriculum
- target question count
- choice count
- difficulty scale
- representation type
- answer type

---

## 2. Product Status vs Factory Workflow Status

### questions.status
ใช้เฉพาะสถานะที่ QuizMon product สนใจ:
- `draft`
- `pending_review`
- `active`
- `inactive`

### Factory workflow status
สถานะเช่น:
- authoring
- qc_failed
- asset_pending
- asset_failed
- revision_required
- rejected

ต้องเก็บใน Factory workflow layer/table ไม่ยัดลง `questions.status`

---

## 3. Factory Run Contract

ทุกงานผลิตข้อสอบต้องเริ่มจาก Run

Run input อย่างน้อย:
- curriculum_profile
- target / coverage target
- preferred batch size
- max batch size
- review mode
- duplicate check
- independent QC
- asset QC

Target เป็น parameter ไม่ใช่ core rule

---

## 4. Blueprint Before Author — HARD RULE

ห้ามสร้างคำถามก่อนมี Coverage Blueprint

Flow:

Existing Bank Audit  
→ Curriculum Objectives  
→ Coverage Gap  
→ Blueprint  
→ Author

Blueprint ต้องระบุอย่างน้อย:
- learning objective
- cognitive demand
- question archetype
- difficulty
- representation type
- จำนวนข้อที่ต้องสร้าง

---

## 5. Author Contract

Author มีหน้าที่สร้างข้อเท่านั้น

Author ไม่มีสิทธิ์:
- approve งานตัวเอง
- publish
- เปลี่ยน `active`
- bypass QC

Structured output อย่างน้อย:
- question_text
- choices / answer structure
- correct answer / correct_index
- explanation
- learning_objective
- topic
- difficulty
- cognitive_demand
- question_archetype
- representation_type
- needs_image
- image_prompt

---

## 6. Independent Question QC — HARD GATE

Question QC ต้องตรวจใหม่โดยอิสระ ไม่เชื่อ Author explanation

ผลลัพธ์:
- `PASS`
- `REVISE`
- `REJECT`

ตรวจอย่างน้อย:
- correctness
- correct answer/index
- ambiguity
- multiple valid answers
- explanation
- curriculum fit
- learning objective fit
- difficulty fit
- cognitive demand fit
- distractor quality
- answer-length bias
- duplicate / near duplicate
- numerical consistency
- wording / reading level

---

## 7. Revision Loop

Default revision limit = 2

Author  
→ QC fail  
→ Revision #1  
→ QC fail  
→ Revision #2  
→ QC fail  
→ Reject item + generate replacement

Revision limit ต้อง configurable ได้ในอนาคต

---

## 8. Asset Router

Asset/representation สร้างหลัง Question QC ผ่านเท่านั้น

รองรับ:
- none
- svg_geometry
- svg_graph
- svg_scientific_diagram
- svg_circuit
- svg_structure
- table
- equation
- webp_real_image

ไม่ควรทำทุก representation เป็นภาพ

---

## 9. Image / Asset Builder Contract

รับเฉพาะข้อที่ผ่าน Question QC แล้ว

ต้องส่งออก:
- question_id
- filename
- image_url / asset reference
- image_type
- image_prompt
- representation_type

อ้างอิงมาตรฐาน:
`quizmon-question-image-standard.md`

สำหรับรูป:
- upload Supabase Storage
- DB เก็บ URL เท่านั้น
- filename อิง question_id

---

## 10. Independent Image QC

Image Builder และ Image QC ต้องเป็นคนละ role

ผลลัพธ์:
- `PASS`
- `REGENERATE`
- `REJECT_ASSET`

ตรวจทั้ง:
- semantic correctness
- label/value consistency
- geometry/scientific correctness
- no answer leakage
- format
- dimensions
- readability
- overlap
- filename
- Storage URL
- image_prompt
- file size

---

## 11. pending_review Gate

ข้อจะเปลี่ยน `draft → pending_review` ได้เมื่อ:

1. Question QC = PASS
2. หากมี asset: Asset QC = PASS
3. machine validation ผ่าน
4. required metadata ครบ

Factory Manager เป็นผู้จัดการ transition นี้

---

## 12. Human Approval Contract

ใน v1:

**Agent PASS ≠ Publish**

Human เท่านั้นที่อนุมัติ:

`pending_review → active`

Human actions:
- Approve
- Request Revision
- Reject

Human review note ต้อง trace ได้

---

## 13. Run Completion Contract

Run ไม่เสร็จเพราะจำนวนข้อครบเพียงอย่างเดียว

ต้องผ่าน:
1. target_active reached
2. learning objective coverage reached
3. cognitive mix acceptable
4. archetype / representation mix acceptable
5. ไม่มี unresolved replacement/rejection ที่จำเป็นต่อ coverage

ดังนั้น:

`target_count reached ≠ coverage complete`

---

## 14. Duplicate Contract

ต้องตรวจสองชั้น:

### Before authoring
Author ต้องรับ context ของคลังเดิม/coverage เดิม

### After authoring
QC ตรวจ duplicate และ near-duplicate

Near-duplicate รวมถึงข้อที่เปลี่ยนเพียงตัวเลขแต่ reasoning template เหมือนเดิม

อนุญาต repetitive drill ได้เฉพาะเมื่อ Blueprint ตั้งใจและมี limit

---

## 15. Failure / Retry Contract

### Technical Failure
เช่น:
- DB timeout
- Storage failure
- model/agent call failure

Default retry:
- สูงสุด 3 attempts
- ต้อง idempotent
- ห้ามสร้าง duplicate insert จาก retry

ควรมี key เช่น:
`run_id + item_id`

### Content Failure
QC reject ไม่ใช่ technical retry

ต้องเข้า:
- Revision
- Replacement

---

## 16. Auditability

Factory ต้อง trace ได้อย่างน้อย:
- run_id
- item_id
- question_id
- profile_id
- blueprint_slot
- author_version
- revision_count
- question_qc_result
- question_qc_issues
- asset_qc_result
- asset_qc_issues
- human_review_result
- human_review_note
- timestamps

---

## 17. Responsibility Matrix

| งาน | Manager | Author | Question QC | Image Builder | Image QC | Human |
|---|---|---|---|---|---|---|
| เลือก coverage | ✓ | | | | | |
| สร้างโจทย์ | | ✓ | | | | |
| ตรวจคำตอบ | | | ✓ | | | |
| สั่ง revision | ✓ | | | | | |
| แก้โจทย์ | | ✓ | | | | |
| สร้าง asset | | | | ✓ | | |
| ตรวจ asset | | | | | ✓ | |
| ส่ง pending_review | ✓ | | | | | |
| approve active | | | | | | ✓ |
| recount coverage | ✓ | | | | | |

---

## 18. Out of Scope for Phase 1

Phase 1 ยังไม่ทำ:
- Agent implementation
- Skill implementation
- Factory DB tables
- Review UI
- auto-active
- adaptive AI Question Engine
- legacy image migration

---

# Locked 10 Rules

1. Factory Core ไม่ผูกกับระดับชั้นหรือวิชา
2. Blueprint ก่อน Author เสมอ
3. Author ห้ามตรวจตัวเอง
4. Independent Question QC เป็น hard gate
5. Asset สร้างหลัง content ผ่าน
6. Image Builder ≠ Image QC
7. Factory เดินเองได้สูงสุดถึง `pending_review`
8. v1 Human เท่านั้นที่ทำ `active`
9. Run complete ต้องผ่าน coverage ไม่ใช่จำนวนอย่างเดียว
10. ทุกขั้นต้อง trace / reproduce ได้

---

**Phase 1 Result:** PASSED / LOCKED
