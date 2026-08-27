# QuizMon Question Factory v1
## Phase 3 — Curriculum / Profile Schema v1

**Status:** Draft for review  
**Depends on:**  
- `QuizMon_Question_Factory_v1.md`  
- `question-factory-contract-v1.md`  
- `question-factory-orchestrator.md`  
- `question-authoring-skill.md`  
- `question-qc-skill.md`  
- `question-image-builder-skill.md`  
- `question-image-qc-skill.md`  
- `quizmon-question-image-standard.md`

**Purpose:** Define the versioned curriculum/profile contract that tells the Factory *what to produce* without hardcoding grade, subject, curriculum, answer format, question count, or representation rules into Factory Core.

---

# 1. Design Goal

The Profile layer must make the same Factory Core usable for:

- Primary
- Lower Secondary
- Upper Secondary
- Thai curriculum
- other curricula in the future
- Mathematics
- General Science
- Physics
- Chemistry
- Biology
- other subjects in the future

Factory Core should consume a Profile and Blueprint without needing grade/subject-specific code changes.

---

# 2. Core Principle

The Profile is the source of truth for:

> what this population of learners is expected to learn, how the content should be represented, and what kinds of questions are acceptable.

The Profile must not be treated as free-form notes.

It must be:

- structured
- versioned
- validated
- immutable once pinned to an active Run

---

# 3. Profile Layers

A profile is composed from several layers.

```text
Curriculum System
    ↓
Education Stage
    ↓
Grade / Course
    ↓
Subject
    ↓
Domain
    ↓
Chapter / Unit
    ↓
Topic / Subtopic
    ↓
Learning Objective
    ↓
Coverage Rules
    ↓
Assessment Rules
    ↓
Representation Rules
    ↓
Subject QC Rules
```

Not every curriculum needs every level.

Fields must support optionality without breaking the schema.

---

# 4. Profile Identity

Required fields:

```yaml
profile_id: thai_math_m3_similarity
profile_version: 1.0.0

status: draft | active | deprecated

curriculum_system:
  id: thai_basic_education_2551_rev2560
  name: หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 ฉบับปรับปรุง พ.ศ. 2560

education_stage: lower_secondary
grade: 3
subject:
  id: math
  name: คณิตศาสตร์

language: th
locale: th-TH
```

`profile_id` must be stable.

`profile_version` changes when rules/content mappings change materially.

---

# 5. Versioning Rules

Use semantic-style versioning conceptually:

```text
MAJOR.MINOR.PATCH
```

## MAJOR

Breaking interpretation change.

Examples:
- change LO IDs
- redefine cognitive taxonomy
- change answer schema incompatibly

## MINOR

Additive curriculum/profile change.

Examples:
- add new topic
- add new representation type
- expand allowed archetypes

## PATCH

Non-structural correction.

Examples:
- wording correction
- typo
- metadata clarification

Active Runs remain pinned to their original version.

---

# 6. Curriculum Source Metadata

Profiles should preserve provenance.

Example:

```yaml
sources:
  - source_id: ipst_2560_math_m3
    authority: IPST
    type: official_curriculum
    title: ...
    version: ...
    source_url: ...
    accessed_at: ...
```

For future imported curricula:
- Ministry documents
- IPST
- school curriculum
- exam frameworks
- teacher-authored scope

Profile should allow multiple sources with precedence.

---

# 7. Source Precedence

Recommended precedence:

```text
official curriculum
> official learning standard / outcome
> official textbook structure
> school/local scope
> internal QuizMon enrichment
```

If conflicts exist, Profile must record resolution explicitly.

Do not silently merge conflicting sources.

---

# 8. Education Stage

Core values should be extensible.

Recommended initial values:

```text
early_primary
upper_primary
lower_secondary
upper_secondary
```

Or more generically:

```text
primary
lower_secondary
upper_secondary
```

Avoid embedding Thai-only stage names into Factory Core.

Display labels may remain Thai.

---

# 9. Grade / Course Flexibility

Grade may be represented as:

```yaml
grade:
  system: thai
  value: 3
  display: ม.3
```

Future course-based systems may use:

```yaml
course:
  id: algebra_1
```

Schema must permit either grade-based or course-based organization.

---

# 10. Subject

Example:

```yaml
subject:
  id: physics
  name: ฟิสิกส์
  family: science
```

Subject family helps share adapters.

Examples:

```text
math
science
language
social_science
```

---

# 11. Domain / Chapter / Topic

Example:

```yaml
domain:
  id: geometry
  name: เรขาคณิต

chapter:
  id: similarity
  name: ความคล้าย

topics:
  - id: similar_figures
  - id: triangle_similarity
  - id: scale_factor
  - id: parallel_line_similarity
  - id: perimeter_area_similarity
  - id: applications
```

These are curriculum content organization fields.

They must not be confused with `question_archetype`.

---

# 12. Learning Objective Schema

Each LO must be uniquely addressable.

Example:

```yaml
learning_objectives:
  - lo_id: M3-SIM-01
    statement: อธิบายสมบัติของรูปที่คล้ายกัน
    source_refs:
      - ipst_2560_math_m3
    prerequisite_lo_ids: []
    tags:
      - similarity
      - concept
```

Recommended fields:

```text
lo_id
statement
source_refs
prerequisite_lo_ids
topic_id
required
weight
notes
```

---

# 13. Learning Objective Granularity

LOs should be:

- specific enough to measure
- broad enough to support multiple question archetypes
- stable across batches

Avoid overly broad LO:

```text
เข้าใจความคล้าย
```

Prefer:

```text
ใช้สัดส่วนของด้านคู่สมนัยเพื่อหาความยาวที่ไม่ทราบค่า
```

Avoid overly narrow LO tied to one exact problem.

---

# 14. Prerequisite Relationships

Profile may define prerequisites.

Example:

```yaml
prerequisites:
  M3-SIM-04:
    - M3-SIM-01
    - M3-SIM-02
```

This can support future adaptive systems.

Question Factory v1 may initially use these only as metadata.

---

# 15. Coverage Target Model

Coverage must support more than a total question count.

Example:

```yaml
coverage:
  minimum_active: 80

  learning_objective_targets:
    M3-SIM-01: 5
    M3-SIM-02: 10
    M3-SIM-03: 12
    M3-SIM-04: 18

  tolerance:
    absolute: 1
    percent: 10
```

`minimum_active` is a minimum, not a strict maximum.

---

# 16. Coverage Dimensions

A Profile may target distribution across:

```text
learning_objective
topic
cognitive_demand
difficulty
question_archetype
representation_type
answer_type
subject-specific dimension
```

The Factory should only enforce dimensions configured by the Profile.

---

# 17. Cognitive Demand Schema

Core taxonomy:

```text
recall
understand
apply
analyze
evaluate
```

Profile example:

```yaml
cognitive_demand:
  allowed:
    - recall
    - understand
    - apply
    - analyze

  target_mix:
    recall: 10
    understand: 20
    apply: 45
    analyze: 25
```

Percentages or counts may be used.

---

# 18. Cognitive Ceiling / Floor

Profiles may constrain cognitive demand.

Primary example:

```yaml
cognitive_policy:
  allowed:
    - recall
    - understand
    - apply
```

Upper secondary example:

```yaml
cognitive_policy:
  allowed:
    - understand
    - apply
    - analyze
    - evaluate
```

Do not assume all levels use all categories.

---

# 19. Difficulty Schema

Difficulty scale must be profile-defined.

Example:

```yaml
difficulty:
  scale:
    min: 1
    max: 3

  labels:
    1: easy
    2: medium
    3: hard

  target_mix:
    1: 25
    2: 50
    3: 25
```

Future profiles may use 1–5.

Factory Core must not hardcode 1–3.

---

# 20. Difficulty Definition

Profiles should define what each level means.

Example M.3 Math:

```yaml
difficulty_definition:
  1:
    reasoning_steps: "1 direct step"
    representation: "familiar"
    distractors: "basic misconception"

  2:
    reasoning_steps: "1–2 meaningful steps"
    representation: "standard"
    distractors: "plausible misconception"

  3:
    reasoning_steps: "multi-step or less familiar transfer"
    representation: "integrated"
    distractors: "high plausibility"
```

This improves Author/QC calibration.

---

# 21. Question Archetype Schema

Core archetypes:

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

Profiles may extend them.

---

# 22. Subject-Specific Archetype Extensions

Physics:

```text
vector_analysis
circuit_analysis
motion_graph_analysis
```

Chemistry:

```text
stoichiometric_reasoning
reaction_prediction
structure_interpretation
equilibrium_reasoning
```

Biology:

```text
pedigree_analysis
mechanism_reasoning
pathway_interpretation
experimental_inference
```

Extensions must be declared in Profile.

---

# 23. Archetype Distribution

Example:

```yaml
question_archetypes:
  target_mix:
    conceptual: 15
    calculation: 30
    application: 20
    graph_interpretation: 10
    multi_step: 25
```

The Factory may use percentages or counts.

---

# 24. Representation Type Schema

Core representation types:

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

Profiles may enable/disable types.

---

# 25. Representation Policy

Example:

```yaml
representation_policy:
  allowed:
    - none
    - svg_geometry
    - svg_graph

  target_mix:
    none: 55
    svg_geometry: 35
    svg_graph: 10
```

For Biology:

```yaml
allowed:
  - none
  - svg_scientific_diagram
  - table
  - webp_real_image
```

---

# 26. Asset Standard Binding

Profile can specify asset standards:

```yaml
asset_standards:
  svg_geometry: quizmon-question-image-standard-v1
  svg_graph: quizmon-question-image-standard-v1
  webp_real_image: quizmon-real-image-standard-v1
```

This prevents Builder from guessing style policy.

---

# 27. Answer Type Schema

Allowed future values:

```text
single_choice
multiple_choice
numeric
short_answer
```

Current QuizMon Profile may restrict to:

```yaml
answer_policy:
  allowed:
    - single_choice
```

---

# 28. Choice Count

Choice count belongs to Profile.

Examples:

Primary:

```yaml
single_choice:
  choice_count: 3
```

Lower Secondary:

```yaml
single_choice:
  choice_count: 4
```

Future exams may use 5.

---

# 29. Correct-Position Policy

Profile may define distribution target.

Example:

```yaml
correct_position_policy:
  mode: balanced
  tolerance_percent: 10
```

The Author should not force exact sequence.

Batch-level QC monitors bias.

---

# 30. Distractor Policy

Profile may define:

```yaml
distractor_policy:
  misconception_based: preferred
  allow_none_of_above: false
  allow_all_of_above: false
  duplicate_options: forbidden
  answer_length_bias: forbidden
```

Different age groups may use different strictness.

---

# 31. Reading-Level Policy

Example Primary:

```yaml
reading_policy:
  max_sentence_complexity: low
  preferred_stem_length: short
  technical_terms: limited
```

Upper Secondary:

```yaml
reading_policy:
  formal_notation: allowed
  technical_terms: curriculum_appropriate
```

Avoid using raw word-count limits as the only reading metric.

---

# 32. Language / Locale

Example:

```yaml
language:
  primary: th
  locale: th-TH

terminology:
  use_thai_curriculum_terms: true
  english_symbolic_terms_allowed: true
```

Profile can define required terminology mappings.

---

# 33. Units / Number Formatting

Example:

```yaml
number_policy:
  decimal_separator: "."
  thousands_separator: ","

unit_policy:
  system: SI
  enforce_units_when_relevant: true
```

Profiles may override for subject-specific conventions.

---

# 34. Math Profile Adapter

Example rules:

```yaml
subject_rules:
  math:
    notation_consistency: required
    variable_definition: required
    geometry_relationship_validation: required
    hidden_assumptions: forbidden
```

---

# 35. Physics Profile Adapter

Example:

```yaml
subject_rules:
  physics:
    check_units: true
    check_dimensions: true
    check_sign_convention: true
    realistic_values: preferred

    allowed_representations:
      - none
      - svg_graph
      - svg_scientific_diagram
      - svg_circuit
      - table
      - equation
```

---

# 36. Chemistry Profile Adapter

Example:

```yaml
subject_rules:
  chemistry:
    formula_validation: true
    equation_balance_check: true
    charge_check: true
    nomenclature_check: true

    allowed_representations:
      - none
      - svg_structure
      - svg_graph
      - svg_scientific_diagram
      - table
      - equation
```

---

# 37. Biology Profile Adapter

Example:

```yaml
subject_rules:
  biology:
    mechanism_accuracy: true
    terminology_accuracy: true
    taxonomy_check: true

    allowed_representations:
      - none
      - svg_scientific_diagram
      - table
      - webp_real_image
```

---

# 38. General Science Profile Adapter

For lower levels:

```yaml
subject_rules:
  science:
    reading_simplicity: high
    real_world_context: preferred
    unnecessary_formula_use: discouraged
```

---

# 39. Experimental Reasoning Policy

For science profiles:

```yaml
experimental_policy:
  enabled: true
  dimensions:
    - manipulated_variable
    - responding_variable
    - controlled_variable
    - fair_test
    - data_interpretation
    - evidence_claim
```

Profiles may set stage-appropriate subset.

---

# 40. Data Interpretation Policy

Example:

```yaml
data_policy:
  tables_allowed: true
  graph_allowed: true
  raw_data_allowed: true
  multi_source_data: false
```

Upper secondary may enable multi-source evidence.

---

# 41. Multi-Step Policy

Example:

```yaml
multi_step_policy:
  allowed: true
  max_typical_steps: 3
```

Primary may use:

```yaml
max_typical_steps: 1
```

This is guidance, not a rigid universal calculation.

---

# 42. Numerical Complexity Policy

Profile may constrain:

```yaml
numerical_policy:
  ugly_numbers: discouraged
  rounding_required: false
  significant_figures: subject_defined
```

Physics/Chemistry adapters may override.

---

# 43. Representation Necessity Policy

Profile can state:

```yaml
representation_policy:
  decorative_assets: forbidden
```

An asset should exist because it supports the intended measurement.

---

# 44. Real Image Policy

Example Biology:

```yaml
real_image_policy:
  allowed: true
  format: webp
  target_max_bytes: 51200
  provenance_required_for_external_source: true
```

---

# 45. Curriculum Enrichment Policy

Profiles may explicitly permit enrichment.

Example:

```yaml
enrichment:
  allowed: false
```

or

```yaml
enrichment:
  allowed: true
  max_share_percent: 10
  tags:
    - extension
```

Factory must not infer enrichment permission.

---

# 46. Cross-Topic Integration

Example:

```yaml
integration_policy:
  allowed: true
  max_share_percent: 15
  prerequisite_lo_required: true
```

This supports senior multi-step problems without causing accidental topic drift.

---

# 47. Blueprint Generation Inputs

A valid Profile must provide enough information for the Orchestrator/Blueprint planner to answer:

1. What LOs exist?
2. Which are required?
3. How many active questions are minimally needed?
4. What cognitive mix is intended?
5. What difficulty mix is intended?
6. Which archetypes are allowed/targeted?
7. Which representations are allowed/targeted?
8. Which answer types are allowed?
9. What subject QC rules apply?
10. What reading/format rules apply?

If not enough information exists, Blueprint generation must block.

---

# 48. Profile Validation

Before activation, validate:

```text
[ ] unique profile_id
[ ] valid version
[ ] curriculum source present
[ ] education stage defined
[ ] subject defined
[ ] at least one LO
[ ] coverage rules coherent
[ ] difficulty scale coherent
[ ] cognitive values valid
[ ] allowed archetypes valid
[ ] allowed representations valid
[ ] answer policy valid
[ ] subject adapter compatible
```

---

# 49. Distribution Validation

If target mixes use percentages:

```text
sum ≈ 100%
```

If counts:
- counts must not contradict minimum target
- dimensions may overlap and therefore need clear semantics

Example:
`learning_objective_targets` are independent from `difficulty_target_mix`.

---

# 50. Coverage Tolerance

Profiles may define tolerance.

Example:

```yaml
coverage_tolerance:
  cognitive_percent: 5
  difficulty_percent: 10
  archetype_percent: 10
```

Run Completion uses these tolerances.

---

# 51. Required vs Preferred Constraints

Each Profile constraint should be classifiable:

```text
required
preferred
optional
```

Example:

```yaml
constraints:
  exact_one_correct_answer: required
  misconception_distractors: preferred
  real_world_context: preferred
```

This helps Orchestrator/QC distinguish hard failure from advisory drift.

---

# 52. Profile Inheritance

To reduce duplication, Profiles may inherit from base profiles.

Example:

```text
thai_base
→ thai_lower_secondary_base
→ thai_math_lower_secondary
→ thai_math_m3_similarity
```

Inheritance must be resolved into a fully materialized pinned Profile before a Run starts.

Active Run should not depend on live parent files changing.

---

# 53. Inheritance Override Rules

Child profile may override allowed fields.

Example:

```yaml
inherits: thai_math_lower_secondary@1.2.0

overrides:
  chapter: similarity
  minimum_active: 80
```

Conflicting overrides must be explicit.

---

# 54. Materialized Run Profile

At Run start, store a resolved snapshot:

```text
all inherited rules
+ all overrides
+ exact versions
```

This snapshot is what Author/QC use.

---

# 55. Deprecated Profiles

Profile status:

```text
draft
active
deprecated
```

Deprecated:
- cannot start new Runs by default
- existing pinned Runs remain valid
- replacement profile may be referenced

---

# 56. Example — Primary Science

```yaml
profile_id: thai_science_p5_example
profile_version: 1.0.0

education_stage: primary
grade: 5

subject:
  id: science

answer_policy:
  allowed: [single_choice]
  single_choice:
    choice_count: 3

cognitive_policy:
  allowed:
    - recall
    - understand
    - apply

difficulty:
  scale:
    min: 1
    max: 2

representation_policy:
  allowed:
    - none
    - svg_scientific_diagram
    - webp_real_image

reading_policy:
  level: simple
```

---

# 57. Example — Junior Math

```yaml
profile_id: thai_math_m3_similarity
profile_version: 1.0.0

education_stage: lower_secondary
grade: 3

subject:
  id: math

chapter:
  id: similarity

coverage:
  minimum_active: 80

answer_policy:
  allowed: [single_choice]
  single_choice:
    choice_count: 4

representation_policy:
  allowed:
    - none
    - svg_geometry

difficulty:
  scale:
    min: 1
    max: 3
```

---

# 58. Example — Senior Physics

```yaml
profile_id: thai_physics_m5_electric_current
profile_version: 1.0.0

education_stage: upper_secondary
grade: 11

subject:
  id: physics
  family: science

answer_policy:
  allowed:
    - single_choice
    - numeric

question_archetypes:
  allowed:
    - conceptual
    - calculation
    - graph_interpretation
    - circuit_analysis
    - experimental_design
    - multi_step

representation_policy:
  allowed:
    - none
    - svg_graph
    - svg_circuit
    - svg_scientific_diagram
    - table
    - equation

subject_rules:
  physics:
    check_units: true
    check_dimensions: true
```

---

# 59. Example — Senior Chemistry

```yaml
profile_id: thai_chem_m5_equilibrium
profile_version: 1.0.0

education_stage: upper_secondary

subject:
  id: chemistry

question_archetypes:
  allowed:
    - conceptual
    - calculation
    - data_interpretation
    - equilibrium_reasoning
    - experimental_design

representation_policy:
  allowed:
    - none
    - svg_graph
    - svg_structure
    - table
    - equation

subject_rules:
  chemistry:
    equation_balance_check: true
    charge_check: true
```

---

# 60. Example — Senior Biology

```yaml
profile_id: thai_bio_m6_genetics
profile_version: 1.0.0

education_stage: upper_secondary

subject:
  id: biology

question_archetypes:
  allowed:
    - conceptual
    - data_interpretation
    - pedigree_analysis
    - mechanism_reasoning
    - experimental_inference

representation_policy:
  allowed:
    - none
    - svg_scientific_diagram
    - table
    - webp_real_image

subject_rules:
  biology:
    mechanism_accuracy: true
    terminology_accuracy: true
```

---

# 61. Acceptance Criteria — Cross-Level

The schema passes only if it can represent without Factory Core changes:

1. Primary Science, 3-choice
2. Junior Math, 4-choice, 80-question minimum
3. Senior Physics with graph/circuit/numeric
4. Senior Chemistry with equations/structures/data
5. Senior Biology with diagrams/real images
6. future 5-choice exam profile
7. future short-answer profile
8. non-Thai curriculum profile

---

# 62. Acceptance Criteria — Versioning

Must support:

1. Profile v1.0 pinned to active Run
2. Profile v1.1 created while Run is active
3. Existing Run remains on v1.0
4. New Run may use v1.1
5. Blueprint revision creates explicit new version
6. Deprecated profile does not invalidate historical Run

---

# 63. Acceptance Criteria — Coverage

Must represent:

- total minimum
- per-LO targets
- cognitive distribution
- difficulty distribution
- archetype distribution
- representation distribution
- tolerance
- required/preferred rules

No single metric may substitute for all coverage.

---

# 64. Future Compatibility

The schema should remain compatible with future:

- adaptive question generation
- learner skill models
- prerequisite graph
- mastery thresholds
- item-response data
- exam blueprints
- teacher-custom profiles
- bilingual questions
- school-specific scope
- curriculum version migration

These are not required in v1, but schema choices must not block them.

---

# 65. Locked Principles for Phase 3

1. Profile defines *what to produce*; Factory Core defines *how to produce*.
2. Profiles are versioned and immutable once pinned.
3. Learning Objectives are the primary curriculum coverage unit.
4. Quantity alone never defines completion.
5. Difficulty and cognitive demand remain separate.
6. Archetype and representation are separate dimensions.
7. Answer format is Profile-defined.
8. Subject-specific rules are adapters, not Factory hardcoding.
9. Reading level and learner context are explicit Profile rules.
10. Coverage constraints distinguish required vs preferred.
11. Profile inheritance is allowed, but Runs use resolved snapshots.
12. Provenance of curriculum sources is preserved.
13. Schema must work from Primary through Upper Secondary without redesign.
14. Future adaptive-learning use must not be blocked by v1 choices.

---

**Phase 3 Status:** Ready for human review
