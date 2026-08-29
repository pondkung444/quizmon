# QuizMon Question Factory v1

**Status:** Phase 5.6 Controlled Pilot complete; Phase 6 Operational Hardening is next
**Purpose:** ใช้เป็นแนวทางกลางสำหรับการสร้าง ตรวจ และเผยแพร่ข้อสอบของ QuizMon ต่อจากนี้ โดยออกแบบให้รองรับได้ตั้งแต่ระดับประถม ม.ต้น ม.ปลาย และสามารถขยายไปยังหลักสูตร/วิชาอื่นในอนาคตได้โดยไม่ต้องรื้อ Factory Core

---

## Current implementation checkpoint — 2026-08-29

This section is the current execution source of truth. The original Phase 1–6 design narrative later in this document remains useful background, but this checkpoint supersedes its implementation status and sequencing.

### Completed

- Phase 1: Factory contract locked.
- Phase 2: Orchestrator, Author, Question QC, Image Builder and Image QC skill contracts locked.
- Phase 3: Curriculum/Profile schema locked.
- Phase 4.0–4.2: production contract, data model and Product Mapping Adapter contract completed from production evidence.
- Phase 4.3–4.5b: RLS/Storage plan, migrations 001/002/003, canonical scope key and private staging Storage gate applied and verified in production.
- Phase 4.6: Factory Office visual foundation completed: six workers, 47 semantic actions, production environment, deterministic state/event projection, server-only production reader and admin preview.
- Phase 4.7: `public.curriculum_chapters` adopted as the canonical registry. All 95 rows have a deterministic `chapter_key`; null-safe natural uniqueness, route constraints, least-privilege grants, repository migration and server-only resolver are implemented and verified in production.
- Phase 5.0: atomic Run/snapshot/slot/event initialization plus optimistic `created → running` transition deployed and smoke-verified with idempotent replay, stale-version rejection and rollback cleanup.
- Phase 5.1: exact read-only bank audit and deterministic gap Blueprint implemented; production evidence covers all 95 registry chapters and no real Run was created.
- Phase 5.2: optimistic Author → Question QC → revise/reject/pass state machine deployed with candidate validation, append-only evidence, idempotency and DB revision ceiling; no product question was created.
- Phase 5.3: private immutable asset revisions, byte-level SVG/WebP validation, Storage existence/metadata guard, exact-revision Image QC transitions and compensating cleanup deployed and production smoke-verified; no real Run or product write was created.

Production Controlled Pilot Run `27` for Mathematics M.3, curriculum chapter `กราฟของฟังก์ชันกำลังสอง`, completed its content path. Ten text-only Slots passed Question QC and exact Human approval, were deliberately published as Product Drafts, and were explicitly activated as questions `3672`–`3681` with immutable mappings `9`–`18`. Final verification found exact mapping/product agreement, zero unexpected external exact duplicate, zero Factory asset or Storage object, and zero Run 26 residue.

### Current phase

> **Phase 6 — Operational Hardening**

The curriculum gate is closed. The worker can now resolve a `chapter_key` server-side, verify its stage/grade/product route, and pin an immutable resolved snapshot before creating a Run. The 151 grandfathered questions with null curriculum metadata remain legacy-only and are not valid templates for new Factory output.

Phase 5.2 and Phase 5.3 passed their exit gates. The worker can now carry an `asset_build` Slot through immutable private staging revisions and exact-revision Image QC without anonymous or product-bucket writes.

Phase 5.4 and Phase 5.5 passed their production exit gates. Phase 5.6 then exercised the first user-approved real batch end to end: 10/10 exact Human approvals, 10/10 Product Draft publications and 10/10 explicit Activations. See [phase-5.6-controlled-pilot.md](phase-5.6-controlled-pilot.md). Run `27` retains `status=running` with `active_count=10` because v1 does not yet expose a guarded terminal Run transition; closing that lifecycle gap belongs to Phase 6 rather than an ad-hoc production update.

Phase 4.7 production evidence: migration history `20260828105201_curriculum_chapters_registry_bridge`; 95 rows, 95 distinct valid keys, zero null keys, zero natural-key duplicates, unchanged 3,512/3,663 exact legacy matches, anonymous SELECT allowed, anonymous writes denied, and no curriculum-registry security advisor finding. The local reviewed migration is `supabase/migrations/20260828104722_curriculum_chapters_registry_bridge.sql`; Supabase assigns the production history timestamp when applying it.

### Revised implementation phases

| Phase | Outcome | Office/graphics connection | Exit gate |
|---|---|---|---|
| 4.7 — Curriculum registry bridge (complete) | Adopt `curriculum_chapters` as the canonical chapter lookup; lock identity, uniqueness, snapshot and legacy rules | Manager/run selection can display the canonical chapter label | Passed in production on 2026-08-28 |
| 5.0 — Worker skeleton (complete) | Run, snapshot, slot and append-only event lifecycle with retry/idempotency | Existing Office reader starts projecting persisted run/slot/event state | Passed in production on 2026-08-28 |
| 5.1 — Audit and blueprint (complete) | Existing-bank audit, coverage gaps and immutable resolved blueprint | Manager monitoring, queued folders and run progress | Passed on 2026-08-28; no real Run created |
| 5.2 — Text question loop (complete) | Author → Question QC → revision/reject/pass, without assets or product writes | Author and Question QC actions become live | Passed in production rollback smoke on 2026-08-28 |
| 5.3 — Asset loop (complete) | Representation routing, private staging upload, Image Builder and Image QC | Image Builder/Image QC actions and asset states become live | Passed in production on 2026-08-28; no anonymous/product-bucket write |
| 5.4 — Review and publish (complete) | Trusted human review, Product Mapping Adapter and idempotent publish/promotion/activation | Yellow review wait, human decision and Publisher actions are live | Passed in production rollback smoke on 2026-08-29 |
| 5.5 — End-to-end dry run (complete) | Full flow using transaction-rollback fixtures plus protected Storage smoke | Whole Office flow reconstructs correctly after refresh/reconnect | Passed on 2026-08-29; protected run 33225027228; zero production residue |
| 5.6 — Controlled pilot (complete) | 10 approved-scope M.3 parabola candidates through human review, draft publication and activation | Office observes Run 27; Review Queue supports exact/random inspection and guarded bulk approval | Passed in production on 2026-08-29; questions 3672–3681 active, mappings 9–18 exact, zero asset/Storage residue |
| 6 — Operational hardening | Scheduling, concurrency, observability, cost limits and runbooks | Optional polling/Realtime, transitions and bottleneck views | Load, security, recovery and cost acceptance gates pass |
| 7 — Scale-out | Additional profiles, subjects and larger semi-automatic batches | Slot detail and multi-run views as operational need proves them | Per-profile quality metrics remain within approved thresholds |

### Complete production flow

```text
Canonical curriculum chapter selection
  → Profile request
  → canonical scope key + run lock
  → immutable profile/blueprint snapshots
  → existing-bank audit + coverage blueprint
  → slots planned and assigned
  → Question Author
  → independent Question QC
      ↳ revise/reject with bounded loop
  → representation router
      ↳ no asset, or Image Builder → private staging → Image QC
  → pending human review
      ↳ revise / reject / approve
  → Product Mapping Adapter validation
  → idempotent question insert/update + approved asset promotion
  → activate only after explicit approval
  → coverage recount
  → next batch or run complete
```

Every arrow above must update current state and append a factual event in one controlled server-side operation. The Office is a read-only projection of those facts; it never advances the workflow.

### Cross-cutting acceptance rules

1. Factory tables and Storage staging remain server/service only; no service key reaches a client.
2. `questions` remains product data and keeps its legacy QuizMon meanings.
3. `curriculum_chapters` is the canonical curriculum lookup, but each Run must snapshot its resolved identity and labels rather than depend on a mutable live row.
4. Product Mapping Adapter is the only path from Factory semantics and the chapter registry to product columns.
5. Human approval is mandatory in v1; no automatic activation.
6. Every mutation is idempotent and restart-safe.
7. Unknown state/event values fail closed and remain visible as operational errors.
8. A refresh must reconstruct the same Office scene from persisted facts.
9. Pilot execution requires an explicit preflight and separate user approval.

---

## 1. Long-term Design Principle

Question Factory ต้องแยก 3 ส่วนออกจากกันอย่างชัดเจน

1. **Factory Core** — ลูปการผลิตข้อสอบที่ไม่ขึ้นกับระดับชั้นหรือวิชา
2. **Skills** — กติกาการทำงานของ Author / QC / Asset
3. **Curriculum & Content Profiles** — สิ่งที่เปลี่ยนตามหลักสูตร ระดับชั้น วิชา chapter และ learning objective

หลักสำคัญ:

> Factory Core ต้องไม่รู้โดยตรงว่า “ม.ต้น”, “ม.ปลาย”, “ประถม”, “ฟิสิกส์” หรือ “ชีววิทยา” คืออะไร  
> มันควรทำงานจาก Profile / Blueprint ที่ได้รับ

ห้าม hardcode ระบบให้ติดกับ:
- junior
- ม.1–3
- 4 choices
- target 80 ข้อ
- difficulty 1–3
- SVG only
- Thailand only
- single-choice only

สิ่งเหล่านี้ควรเป็น **Profile / Configuration**

---

## 2. Factory Core Workflow

```text
Curriculum Target
      ↓
Existing Bank Audit
      ↓
Learning Objectives
      ↓
Coverage Blueprint
      ↓
Question Author
      ↓
Question QC + Subject Rules
      ↓
Representation Router
  ↙       ↓       ↘
none     SVG      WebP
          ↓
       Asset QC
          ↓
    pending_review
          ↓
     Human Review
      ↙       ↘
   reject     approve
     ↓           ↓
  revision      active
                 ↓
          Coverage Recount
                 ↓
          next batch / done
```

สถานะหลักของข้อ:

```text
draft
→ qc_failed / image_pending
→ pending_review
→ active
```

สถานะเสริมที่รองรับในอนาคต:
- rejected
- archived

**v1 ห้าม auto-active**  
ทุกข้อจะต้องผ่าน `pending_review → human approval → active`

---

## 3. Core Roles / Agents

### 3.1 Factory Manager / Orchestrator

หน้าที่:
- รับเป้าหมายการผลิต
- query คลังข้อเดิม
- คำนวณ coverage gap
- เลือก batch size
- สั่ง Question Author
- ส่ง Question QC
- route ไป Image Builder เมื่อจำเป็น
- ส่ง Image QC
- จัดการ reject / revise loop
- เปลี่ยนสถานะไป `pending_review`
- รอ Human Approval
- activate หลังอนุมัติ
- recount จนถึง target
- ไป chapter / learning objective ถัดไป

ตัวอย่าง Input:

```yaml
education_system: thai
education_stage: lower_secondary
grade: 3
subject: math
chapter: ความคล้าย
target_active: 80
batch_size: 10
review_mode: human_required
```

---

## 4. Skills in Question Factory v1

### Skill 1 — `question-factory-orchestrator`

กติกาของ Factory Manager

ครอบคลุม:
- run lifecycle
- coverage calculation
- batch scheduling
- rejection handling
- state transitions
- human approval gate
- completion criteria

---

### Skill 2 — `question-authoring`

สร้างคำถามจาก Blueprint แบบ structured

Output อย่างน้อย:

```json
{
  "question_text": "...",
  "choices": ["...", "...", "...", "..."],
  "correct_index": 2,
  "explanation": "...",
  "difficulty": 2,
  "cognitive_demand": "apply",
  "question_archetype": "calculation",
  "representation_type": "svg_geometry",
  "needs_image": true,
  "image_prompt": "..."
}
```

กฎกลาง:
- มีคำตอบถูกชัดเจน
- distractor สมเหตุผล
- ห้ามสร้าง near-duplicate โดยเปลี่ยนแค่ตัวเลข
- balance ความยาวของ choices
- ไม่ออกเกิน curriculum scope
- explanation ต้องสอดคล้องกับ correct answer
- ถ้าต้องมีรูปให้ระบุ representation และ image_prompt ก่อน

---

### Skill 3 — `question-qc`

Reviewer ต้องตรวจโดยไม่เชื่อ output จาก Author

ตรวจ:
- answer correctness
- correct_index
- ambiguity
- multiple valid answers
- explanation correctness
- curriculum fit
- learning objective fit
- difficulty fit
- cognitive demand fit
- distractor quality
- answer-length bias
- duplicate / near duplicate
- numerical consistency
- wording / reading level

Output:

```json
{
  "result": "reject",
  "severity": "major",
  "issues": [
    {
      "type": "math_error",
      "message": "..."
    }
  ]
}
```

หรือ

```json
{
  "result": "pass",
  "issues": []
}
```

---

### Skill 4 — `question-image-builder`

รองรับ representation หลายชนิด ไม่ผูกกับ geometry

Representation ที่ควรรองรับ:

```text
none
svg_geometry
svg_graph
svg_scientific_diagram
svg_circuit
svg_structure
table
equation
webp_real_image
```

มาตรฐานรูปอ้างอิง:
`quizmon-question-image-standard.md`

สำหรับ diagram / geometry / graph:
- SVG
- ~980×520
- white background
- #111
- stroke-width ~6
- Arial Bold
- label อ่านชัดบนมือถือ
- label ห้ามทับเส้น
- upload Supabase Storage
- filename `q{question_id}.svg`
- DB เก็บ URL เท่านั้น
- ต้องมี `image_prompt`

สำหรับภาพจริง:
- WebP
- ≤ ~50 KB

---

### Skill 5 — `question-image-qc`

ตรวจ Asset แยกจาก Image Builder

#### Semantic QC
- ตัวเลขตรงโจทย์
- labels ตรง
- geometry / circuit / structure ตรง
- correspondence ถูก
- ไม่มีข้อมูลเฉลยหลุด
- ไม่มีข้อมูลเกินโจทย์
- representation ตรงประเภท

#### Visual QC
- file format
- dimensions
- font
- contrast
- label overlap
- mobile readability
- filename
- Storage URL
- file size
- image_prompt

---

## 5. Curriculum / Content Profile

Factory ไม่ควร target แค่ `chapter + จำนวนข้อ`

ควรใช้:

```text
Curriculum
→ Education Stage
→ Grade
→ Subject
→ Chapter
→ Learning Objective
→ Cognitive Demand
→ Question Archetype
→ Representation Type
```

ตัวอย่าง:

```yaml
curriculum:
  system: thai_basic_education_2551_rev2560

education_stage: upper_secondary
grade: 11
subject: physics

chapter:
  id: electric_current
  title: กระแสไฟฟ้า

learning_objectives:
  - id: phy_xxx
    source: ipst
    statement: ...

coverage:
  target: 80

cognitive_demand:
  recall: 5
  understand: 15
  apply: 35
  analyze: 35
  evaluate: 10

question_archetypes:
  conceptual: 15
  calculation: 25
  graph_interpretation: 10
  circuit_analysis: 15
  experimental_data: 10
  application: 5

representations:
  none: 30
  svg_circuit: 25
  svg_graph: 15
  table: 10
```

---

## 6. Five Dimensions Required for Long-term Coverage

หลังตรวจหลักสูตรไทย ม.ปลายของฟิสิกส์ เคมี ชีววิทยา Question Factory ต้องมี 5 มิติหลักต่อไปนี้

### 6.1 Learning Objective

ใช้ผลการเรียนรู้ / ตัวชี้วัดเป็นหน่วย coverage

ห้ามนับเพียงจำนวนข้อใน chapter

---

### 6.2 Cognitive Demand

แยกจาก difficulty

```text
recall
understand
apply
analyze
evaluate
```

`difficulty` = ความยากต่อผู้เรียน  
`cognitive_demand` = ระดับกระบวนการคิดที่ข้อกำลังวัด

---

### 6.3 Question Archetype

taxonomy กลาง:

```text
conceptual
calculation
data_interpretation
graph_interpretation
diagram_interpretation
experimental_design
application
multi_step
comparison
cause_effect
```

Subject profile สามารถเพิ่ม archetype เฉพาะ เช่น:
- Physics: vector_analysis, circuit_analysis
- Chemistry: reaction_prediction
- Biology: pedigree_analysis

---

### 6.4 Representation Type

```text
none
svg_geometry
svg_graph
svg_scientific_diagram
svg_circuit
svg_structure
table
equation
webp_real_image
```

---

### 6.5 Subject QC Profile

Core Reviewer เหมือนกัน แต่มี specialist rules

#### Physics QC
- units
- significant figures
- vector direction
- sign convention
- physical feasibility
- graph correctness

#### Chemistry QC
- chemical formula
- balanced equation
- charge
- oxidation number
- mole ratio
- nomenclature
- structural representation

#### Biology QC
- terminology
- biological mechanism
- taxonomic correctness
- diagram labeling
- oversimplification
- experimental interpretation

---

## 7. Flexibility by Education Stage

### Primary Example

```yaml
stage: primary
grade: 5
subject: science

choice_count: 4

cognitive_mix:
  recall: 25
  understand: 40
  apply: 30
  analyze: 5
```

### Lower Secondary Example

```yaml
stage: lower_secondary
grade: 3
subject: math

question_archetypes:
  conceptual: 10
  calculation: 45
  diagram_interpretation: 30
  application: 15
```

### Upper Secondary Example

```yaml
stage: upper_secondary
grade: 11
subject: physics

question_archetypes:
  conceptual: 20
  calculation: 30
  graph_interpretation: 15
  experimental_data: 15
  multi_step: 20
```

---

## 8. Answer Format Flexibility

Factory Core ห้าม assume ว่ามี 4 choices เสมอ

Profile ต้องกำหนดได้:

```text
choice_count: 3 / 4 / 5
```

และเผื่ออนาคต:

```text
answer_type:
- single_choice
- multiple_choice
- numeric
- short_answer
```

QuizMon ปัจจุบันยังใช้ single-choice เป็นหลัก แต่ Factory ต้องไม่ถูกผูกกับข้อจำกัด UI ปัจจุบัน

---

# Implementation Plan

## Phase 1 — Lock Factory Contract

### เป้าหมาย
กำหนด contract กลางของระบบก่อนทำ automation

### งาน
- ล็อก input/output schema
- ล็อก state lifecycle
- กำหนด ownership ของแต่ละ agent
- กำหนด reject/revise flow
- กำหนด human approval gate
- กำหนด run completion criteria
- กำหนด error/retry rules
- กำหนดว่า product DB และ factory workflow data แยกกันอย่างไร

### Deliverable
`question-factory-contract-v1.md`

### Decision Gate
ต้องตอบได้ชัด:
- ใครสร้าง
- ใครตรวจ
- ใครแก้
- ใคร publish
- state ใดเปลี่ยนเป็น state ใดได้

---

## Phase 2 — Build Skill Specifications

### เป้าหมาย
สร้าง Skill ที่ใช้ซ้ำได้

### งาน
สร้าง:
1. `question-factory-orchestrator.md`
2. `question-authoring-skill.md`
3. `question-qc-skill.md`
4. `question-image-builder-skill.md`
5. `question-image-qc-skill.md`

Dependency:
- `quizmon-question-image-standard.md`

### Deliverable
Skill specs ครบ 5 ตัว

### Decision Gate
ทุก skill ต้องมี:
- Purpose
- Input
- Output
- Rules
- Failure conditions
- Examples

---

## Phase 3 — Curriculum / Profile Schema

### เป้าหมาย
ทำให้ Factory รองรับหลายระดับและหลายวิชาโดยไม่ hardcode

### งาน
ออกแบบ schema สำหรับ:
- education_system
- education_stage
- grade
- subject
- domain
- chapter
- topic
- learning_objective
- cognitive_demand
- question_archetype
- representation_type
- difficulty
- choice_count
- answer_type
- coverage target
- subject QC profile

### Deliverable
`question-factory-profile-schema-v1.md`

พร้อมตัวอย่าง:
- Primary Science
- Junior Math
- Senior Physics
- Senior Chemistry
- Senior Biology

### Decision Gate
Profile ต้องสามารถ represent ทุกตัวอย่างโดยไม่แก้ Factory Core

---

## Phase 4 — Factory State & DB Integration

### เป้าหมาย
แยก workflow metadata จาก product question data

### เสนอ Table
`question_factory_runs`

ตัวอย่างข้อมูล:
- run_id
- profile_id
- target_count
- initial_active
- generated_count
- qc_passed
- qc_failed
- pending_review
- activated
- status

`question_factory_items`

ตัวอย่าง:
- run_id
- question_id
- author_status
- qc_status
- asset_status
- review_status
- failure_reason
- revision_count

### หลักการ
`questions` = Product Data  
Factory tables = Production Workflow

### Deliverable
DB design + migration proposal

### Decision Gate
Factory สามารถลบทิ้ง/เปลี่ยน implementation ได้โดยไม่ทำให้ QuizMon gameplay พัง

---

## Phase 5 — Pilot Run

### Pilot Candidate
`ม.1 → ทศนิยมและเศษส่วน`

เหตุผล:
- มีข้อเดิมน้อย
- ต้องเติมจำนวนมาก
- มีหลาย archetype แต่ asset complexity ไม่สูงเท่า geometry
- เหมาะตรวจลูป Author/QC ก่อน

### Flow
1. audit คลังเดิม
2. map learning objectives
3. build coverage blueprint
4. generate batch
5. Question QC
6. Asset flow ถ้าจำเป็น
7. pending_review
8. Human Review
9. active
10. recount
11. repeat

### Metrics
- QC rejection rate
- Human rejection rate
- duplicate rate
- correction rate
- time per 10 questions
- percentage needing manual intervention

### Deliverable
Pilot report

### Decision Gate
ต้องลด manual flow จากเดิมได้จริง โดยไม่ลดคุณภาพ

---

## Phase 6 — Semi-Automatic Question Factory

### เป้าหมาย
ให้ Factory เดินเองจนถึง `pending_review`

ตัวอย่าง summary ที่ Human ได้:

```text
Run: Math M1 — Decimal & Fractions
Generated: 20
Question QC passed: 17
Question QC rejected: 3
Assets required: 4
Asset QC passed: 4
Pending human review: 17
```

Human ทำหน้าที่:
- approve
- reject
- direction correction

Factory ทำ:
- generate
- QC
- revise
- asset generation
- asset QC
- upload
- queue

### v1 Boundary
ยังไม่ auto-active

### Future Option
เมื่อมีข้อมูล validation มากพอ อาจเปิด auto-active เฉพาะ:
- low-risk question types
- no-image questions
- profile ที่มี historical QC precision สูง

---

# 9. Coverage Blueprint Principle

เป้าหมายเช่น “80 ข้อต่อบท” เป็นแค่ minimum quantity

Factory ต้องตรวจ coverage matrix ด้วย

ตัวอย่าง `ความคล้าย`:

| Subtopic / Archetype | Target |
|---|---:|
| แนวคิดรูปคล้าย | 5 |
| มุมคู่สมนัย / AA | 10 |
| ด้านคู่สมนัย / SSS | 12 |
| Scale factor | 12 |
| เส้นขนานในสามเหลี่ยม | 18 |
| Perimeter / Area | 10 |
| Application | 8 |
| Mixed / multi-step | 5 |
| **รวม** | **80** |

ดังนั้น `target_count` ไม่เท่ากับ `coverage_complete`

บทจะเสร็จเมื่อ:
- quantity target ผ่าน
- learning objective coverage ผ่าน
- cognitive mix ผ่าน
- archetype mix ผ่าน
- representation mix ผ่าน
- QC ผ่าน

---

# 10. Core Principle for QuizMon Going Forward

> QuizMon Question Factory ไม่ใช่ระบบ “ให้ AI แต่งข้อสอบจำนวนมาก”  
> แต่เป็น Question Production Line ที่มี Curriculum → Blueprint → Author → Independent QC → Asset → Asset QC → Human Approval → Publish

Question Factory v1 จะเป็นแนวทางกลางสำหรับการสร้างคลังข้อสอบ QuizMon ต่อจากนี้
