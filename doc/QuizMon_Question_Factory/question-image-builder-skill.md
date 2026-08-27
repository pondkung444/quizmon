# QuizMon Question Factory v1
## Phase 2.4 — `question-image-builder` Skill

**Status:** Draft for review  
**Depends on:** `question-factory-contract-v1.md`, `question-factory-orchestrator.md`, `question-authoring-skill.md`, `question-qc-skill.md`, `quizmon-question-image-standard.md`  
**Role:** Representation / asset generation worker  
**Scope:** Build the requested representation only after Question QC has passed. Upload asset to the configured storage target and return structured metadata. Does not approve the asset and does not activate questions.

---

# 1. Purpose

`question-image-builder` creates visual or structured representations required by a validated question.

Despite the name, this Skill must support more than bitmap images.

It should function as a **Representation Builder** for:

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

Its primary responsibility is:

> convert a deterministic asset specification into a reproducible learner-facing representation that matches the question exactly.

---

# 2. Hard Preconditions

The Builder MUST NOT run unless:

1. Question QC = PASS
2. question_id exists
3. representation_type is defined
4. asset specification / prompt is available when needed
5. Profile and asset standard versions are pinned
6. the question is still in a legal pre-review Factory state

If any prerequisite is missing:

```text
status = blocked
```

Do not guess missing content.

---

# 3. Hard Boundaries

The Builder MUST NOT:

- rewrite the question
- correct the answer
- change the Blueprint Slot
- decide whether the question should pass QC
- change representation type without Orchestrator instruction
- add pedagogical information not specified
- expose the correct answer in the asset
- activate questions
- set final Asset QC PASS
- persist Base64/data URI as question image_url
- put question images inside answer choices unless a future Profile explicitly supports choice-level assets
- use AI-generated raster artwork for diagrams/graphs that should be SVG

---

# 4. Input Contract

Normalized input:

```yaml
run_id: run_42
slot_id: run42-slot017
question_id: 4120

question:
  question_text: ...
  choices: [...]
  correct_index: 2

representation:
  type: svg_geometry

asset_prompt: |
  Draw triangle ABC with D on AB and E on AC.
  DE is parallel to BC.
  Label AD=6, DB=4, AE=9, EC=?.
  Do not show total AB or AC.

profile:
  id: thai_math_m3_similarity
  version: 1.0

asset_standard:
  id: quizmon-question-image-standard
  version: 1.0

storage:
  provider: supabase
  bucket: question-images
```

---

# 5. Output Contract

Successful SVG result:

```json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "question_id": 4120,
  "status": "success",

  "asset": {
    "representation_type": "svg_geometry",
    "filename": "q4120.svg",
    "content_type": "image/svg+xml",
    "storage_url": "https://.../q4120.svg",
    "bytes": 6432,
    "generation_prompt": "...",
    "asset_standard_version": "1.0"
  },

  "builder_notes": {
    "generator": "deterministic_svg",
    "warnings": []
  }
}
```

Blocked result:

```json
{
  "status": "blocked",
  "block_reason": "ASSET_SPEC_INCOMPLETE",
  "details": "..."
}
```

---

# 6. Representation Router

The Builder should dispatch based on `representation_type`.

## none

No asset should be generated.

Return:

```text
status = not_required
```

## svg_geometry

Use deterministic SVG primitives.

## svg_graph

Use deterministic graph renderer.

## svg_scientific_diagram

Use structured scientific diagram primitives.

## svg_circuit

Use circuit-symbol renderer.

## svg_structure

Use structured chemistry/biology representation when SVG is appropriate.

## table

Prefer structured table data rather than raster image.

## equation

Prefer structured mathematical/chemical notation rather than image.

## webp_real_image

Use raster source/generation only when a true image is pedagogically required.

---

# 7. SVG Standard

For QuizMon question diagrams, default standard:

- canvas approximately `980×520`
- aspect ratio approximately `1.9:1`
- white background
- primary stroke `#111`
- stroke-width around `6`
- no gradient
- no shadow
- no decorative color unless future Profile explicitly requires semantic color
- text: Arial Bold or approved equivalent
- text large enough for mobile
- labels placed away from geometry lines
- no unnecessary legend
- no decorative art

The exact visual standard is defined in:

`quizmon-question-image-standard.md`

---

# 8. Deterministic First Principle

For diagrams, graphs, circuits, geometry, structures, and symbolic representations:

> prefer deterministic generation over image-generation models.

Examples:
- line / triangle / angle → SVG
- function graph → SVG
- circuit → SVG
- force diagram → SVG
- reaction energy profile → SVG
- phylogenetic tree → SVG
- pedigree → SVG
- chromosome schematic → SVG

This improves:
- correctness
- reproducibility
- file size
- regeneration
- auditability

---

# 9. Raster Policy

Use `webp_real_image` only when the visual content genuinely requires naturalistic/image information.

Examples:
- organism morphology
- tissue/microscopy photo
- apparatus photo where photo recognition is intended
- geological specimen
- real-world object identification

Rules:
- WebP
- target ≤ ~50 KB
- compress aggressively while keeping required detail
- avoid unnecessary decorative resolution
- record source/generation metadata
- if generated, preserve prompt
- if externally sourced in future, preserve provenance/license metadata

---

# 10. File Naming

Filename must be derived from question_id.

Examples:

```text
q4120.svg
q5601.webp
```

No arbitrary names.

No overwrite by accident.

Default upload should use:

```text
upsert = false
```

If regeneration is required, use an explicit version/replacement policy managed by the Orchestrator.

---

# 11. Storage Policy

Asset must be uploaded to configured durable storage before the item can proceed.

Current standard:

```text
Supabase Storage
bucket: question-images
```

Persistent DB field must store URL/reference only.

Forbidden:

```text
data:image/svg+xml;base64,...
data:image/jpeg;base64,...
```

as persistent `questions.image_url`.

---

# 12. Idempotency

Asset build operations must be idempotent.

Recommended operation key:

```text
{run_id}:{slot_id}:asset-build:{asset_revision}
```

Before creating/uploading:
- check whether the same successful operation exists
- verify the expected filename/storage object

Technical retry must not create duplicate files.

---

# 13. Geometry Builder Rules

For `svg_geometry`:

- geometric relationships must match specification
- if DE ∥ BC, rendered lines should actually be parallel
- point membership must be correct
- labels must correspond to intended segments
- diagram does not need to be drawn to scale unless scale is pedagogically relevant
- if not to scale, it must not visually contradict the stated relationships
- unknown values remain unknown
- do not infer extra equalities
- avoid misleading angle/length proportions

---

# 14. Graph Builder Rules

For `svg_graph`:

Must define:
- x-axis
- y-axis
- labels
- units where relevant
- scale
- plotted data/function
- key points only when specified

Avoid:
- truncated axes that distort interpretation unless intentionally part of the lesson
- color-dependent answers
- labels overlapping curves
- decorative grid density
- plotted values inconsistent with stem

---

# 15. Physics Diagram Rules

Physics representations may include:

```text
free-body diagram
motion graph
ray diagram
wave diagram
electric field
magnetic field
circuit
optics layout
PV graph
```

Builder must follow subject specification.

Examples:
- force arrows begin/end consistently
- vector directions are explicit
- circuit components use conventional symbols
- polarity/current direction only shown when specified
- wave nodes/antinodes placed consistently
- lens/mirror principal axis shown when needed

---

# 16. Circuit Diagram Rules

For `svg_circuit`:

- use standard schematic symbols
- wire connectivity must be topologically correct
- crossing wires are not connected unless junction is marked
- component labels clear
- values placed near component without overlapping wire
- source polarity shown only when relevant
- no decorative realism

Circuit correctness is reviewed later by Asset QC.

---

# 17. Chemistry Representation Rules

Possible representations:

```text
molecular structure
Lewis structure
reaction scheme
energy profile
titration curve
electrochemical cell
particle diagram
lab apparatus schematic
```

Builder must not invent chemistry.

It receives a precise representation spec from Author/QC.

When structured notation is better than an image, use:
- equation
- structured chemical text
- supported renderer

rather than rasterizing text unnecessarily.

---

# 18. Biology Representation Rules

Possible SVG representations:

```text
cell schematic
organ system schematic
pedigree
chromosome diagram
DNA/RNA schematic
metabolic pathway
phylogenetic tree
experimental setup
ecological interaction diagram
```

Use WebP only where actual visual morphology/photo information matters.

Do not create decorative biological illustrations when a schematic is sufficient.

---

# 19. Label Rules

Labels must:

- use exact identifiers from question
- use exact numerical values from asset spec
- use approved units
- remain legible on mobile
- not overlap lines, points, symbols, arrows, or each other
- avoid edge clipping
- not obscure relevant geometry
- not reveal derived values

For dense diagrams, prefer repositioning layout rather than shrinking labels excessively.

---

# 20. Unknown-Value Rules

If the learner must find:

```text
x
?
h
EF
```

the asset must not display the solution.

Allowed:
```text
EC = x
EF = ?
```

Forbidden:
```text
EC = 6
```

if 6 is the required answer.

---

# 21. No Answer Leakage

Builder must actively check for leakage from:

- labels
- graph annotations
- highlighted regions
- arrow captions
- legend
- scale choice
- filename
- alt text
- metadata visible to learner

No visual clue should make the intended reasoning unnecessary.

---

# 22. Information Minimality

Assets should include only information required to understand or solve the question.

Avoid:
- redundant total values
- derived intermediate results
- unused labels
- decorative objects
- excessive gridlines
- explanatory callouts

Less information improves measurement validity.

---

# 23. Representation Fidelity

The asset must reflect the question stem exactly.

If prompt says:
```text
AD=5
DB=7
DE=10
```

asset must not show:
```text
AD=5
AB=12
DE=10
```

unless AB total was explicitly authorized.

Even mathematically implied information may be forbidden because it changes task difficulty.

---

# 24. Mobile Readability

Asset must remain readable in QuizMon mobile context.

Rules:
- high contrast
- large labels
- limited density
- avoid tiny subscripts where possible
- sufficient spacing
- avoid long paragraphs inside figures
- test at reduced display size during build process when possible

---

# 25. Canvas Adaptation

Default SVG canvas is ~980×520.

However, Builder may use a different ratio when the representation genuinely requires it, if Profile allows.

Examples:
- tall biological pathway
- pedigree tree
- long reaction sequence

Do not hardcode 980×520 as universal.

The default standard should be treated as a diagram profile, not a universal Factory limitation.

---

# 26. Semantic Color Policy

Default is monochrome.

Future Profiles may enable semantic color.

Examples:
- red/blue blood flow
- positive/negative charge
- spectrum
- phase identification

If semantic color is used:
- color must carry legitimate instructional meaning
- do not make the answer depend only on color
- ensure accessible labeling/shape backup
- record color policy in asset spec

---

# 27. Accessibility Metadata

Future-compatible asset output should allow:

```text
alt_text
semantic_description
```

Even if current UI does not use them yet.

Alt text must describe the figure without revealing the answer.

---

# 28. Asset Prompt Normalization

Before building, normalize Author prompt into structured spec when possible.

Example:

```yaml
objects:
  - triangle: ABC
  - point: D on AB
  - point: E on AC

relations:
  - DE parallel BC

labels:
  AD: 6
  DB: 4
  AE: 9
  EC: "?"

forbidden_labels:
  - AB total
  - AC total

style_profile:
  quizmon_svg_v1
```

Structured representation reduces ambiguity and generation errors.

---

# 29. Prompt vs Structured Spec

Preferred hierarchy:

```text
structured_asset_spec
> normalized asset prompt
> free-form prompt
```

Free-form prompt is retained for debug/regeneration, but Builder should use structured constraints when available.

---

# 30. Builder Self-Check

Before upload:

```text
[ ] representation type correct
[ ] all required objects present
[ ] all required relationships present
[ ] labels match specification
[ ] no unauthorized labels
[ ] unknown remains unknown
[ ] no obvious overlap
[ ] no clipping
[ ] output format correct
[ ] filename correct
[ ] no persistent Base64
[ ] file-size policy met
```

This is not Asset QC.

It is a pre-submission sanity check.

---

# 31. Upload Sequence

Recommended sequence:

```text
build
→ local schema/format validation
→ self-check
→ compute filename
→ upload durable storage
→ verify upload result
→ return URL + metadata
→ route to Asset QC
```

Do not update final learner-facing asset state to PASS.

---

# 32. Upload Failure

If storage upload fails:

```text
technical failure
```

Use Orchestrator technical retry policy.

Do not regenerate the asset unless there is evidence the file itself is invalid.

---

# 33. Object Conflict

If `q4120.svg` already exists unexpectedly:

Builder should not overwrite silently.

Return:

```text
OBJECT_ALREADY_EXISTS
```

Orchestrator decides whether:
- existing object is the idempotent expected result
- previous build should be reused
- asset revision/version policy is required

---

# 34. Asset Revision

If Asset QC requests regeneration:

```text
asset_revision += 1
```

Recommended future naming strategies:

Option A:
```text
q4120.svg
```
with controlled delete/replace event

Option B:
```text
q4120-r2.svg
```

v1 policy should be chosen in DB/Storage integration phase.

Regardless of naming, revision history must remain traceable.

---

# 35. Table Builder

For `table` representation:

Prefer structured JSON/table model.

Example:

```json
{
  "columns": ["เวลา (s)", "ระยะทาง (m)"],
  "rows": [
    [0, 0],
    [1, 4],
    [2, 8]
  ]
}
```

The UI can render it natively.

Do not convert tables into images unless there is a specific reason.

---

# 36. Equation Builder

For `equation`:

Prefer structured mathematical/chemical notation.

Examples:
- LaTeX
- supported chemistry notation
- plain structured equation string

Do not create a PNG/SVG of equation text unless rendering infrastructure requires it.

---

# 37. Asset Provenance

Every built asset should preserve:

```text
builder_skill_version
generator_type
asset_standard_version
generation_prompt
structured_asset_spec
created_at
```

Future raster/external images may also require:
- source URL
- license
- attribution
- transformation history

---

# 38. Builder Versioning

Record:

```text
question_image_builder_skill_version
renderer_version
asset_standard_version
```

This enables later regeneration and regression analysis.

---

# 39. Failure Codes

Recommended failure taxonomy:

```text
ASSET_SPEC_INCOMPLETE
REPRESENTATION_UNSUPPORTED
INVALID_QUESTION_STATE
QUESTION_ID_MISSING
PROFILE_VERSION_MISSING
ASSET_STANDARD_MISSING

SVG_BUILD_FAILED
GRAPH_BUILD_FAILED
CIRCUIT_BUILD_FAILED
STRUCTURE_BUILD_FAILED
WEBP_BUILD_FAILED

LABEL_CONFLICT_UNRESOLVED
LAYOUT_OVERFLOW
ANSWER_LEAKAGE_DETECTED
FILE_SIZE_EXCEEDED

UPLOAD_FAILED
OBJECT_ALREADY_EXISTS
STORAGE_URL_INVALID

BLOCKED_BY_SOURCE_REQUIREMENT
```

---

# 40. Builder Must Not Fix Content

If Builder discovers:

> question says AB=10 but asset prompt says AB=12

it must not choose one.

Return:

```text
ASSET_SPEC_CONTENT_CONFLICT
```

The item goes back through Orchestrator to Author/QC.

---

# 41. Builder Must Not Change Representation

If `svg_graph` is difficult to build, Builder must not silently return a table.

Return blocked/failure.

Only Orchestrator can approve representation reassessment.

---

# 42. Asset Complexity Metadata

Builder may report:

```text
low
medium
high
```

for asset complexity.

This can help future dynamic batch sizing.

Example:
- simple geometry: low
- multi-component circuit: medium
- detailed biological pathway: high

---

# 43. Acceptance Tests — Geometry

Builder must correctly support:

- similar triangles
- parallel-line triangle
- circle diagram
- coordinate geometry
- angle marking
- polygon measurements

Tests must verify:
- large labels
- no overlaps
- exact values
- no answer leakage

---

# 44. Acceptance Tests — Graphs

Support:

- line graph
- bar graph when appropriate
- scatter/data plot
- motion graphs
- PV graph
- titration curve
- reaction energy profile

No core rewrite between subjects.

---

# 45. Acceptance Tests — Physics

Support:
- free-body diagram
- ray diagram
- wave schematic
- electric circuit
- field-line schematic

---

# 46. Acceptance Tests — Chemistry

Support:
- reaction scheme
- Lewis/structural schematic
- electrochemical cell schematic
- apparatus schematic
- energy profile
- particle representation

---

# 47. Acceptance Tests — Biology

Support:
- pedigree
- chromosome schematic
- cell schematic
- phylogenetic tree
- pathway diagram
- real WebP image case

---

# 48. Acceptance Tests — Failure Discipline

Builder must refuse/return blocked when:

1. question has not passed QC
2. question_id missing
3. prompt contradicts stem
4. requested format unsupported
5. SVG prompt asks to reveal solution
6. raster diagram requested where SVG policy forbids it
7. WebP exceeds file-size policy
8. storage object conflict is unexplained
9. labels cannot be laid out without unreadable overlap
10. source/provenance requirement is missing for a required real image

---

# 49. Metrics

Track:

```text
first-pass Asset QC rate
regeneration rate
asset rejection rate
label-overlap failure rate
content-mismatch rate
answer-leakage rate
upload retry rate
average bytes by representation type
average build time
human visual rejection rate after Asset QC
```

---

# 50. Locked Principles for `question-image-builder`

1. Build only after Question QC PASS.
2. Representation is broader than “image”.
3. Deterministic SVG is preferred for diagrams/graphs/circuits.
4. Raster is reserved for genuine image information.
5. Storage URL/reference only; never persistent Base64.
6. Filename is derived from question_id.
7. Asset must match stem/spec exactly.
8. Implied information must not be added unless authorized.
9. Unknown values must stay unknown.
10. Builder self-checks but never Asset-QC approves itself.
11. Content conflicts are escalated, never guessed through.
12. Core Builder remains subject- and grade-neutral.
13. Visual standards are profile/version based, not universal hardcoding.
14. Every asset is reproducible and auditable.

---

**Phase 2.4 Status:** Ready for human review
