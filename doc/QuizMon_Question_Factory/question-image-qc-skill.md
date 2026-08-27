# QuizMon Question Factory v1
## Phase 2.5 — `question-image-qc` Skill

**Status:** Draft for review  
**Depends on:** `question-factory-contract-v1.md`, `question-factory-orchestrator.md`, `question-authoring-skill.md`, `question-qc-skill.md`, `question-image-builder-skill.md`, `quizmon-question-image-standard.md`  
**Role:** Independent visual/representation quality reviewer  
**Scope:** Verify that a generated asset is semantically correct, visually readable, technically compliant, non-leaking, and faithful to the validated question. Does not rebuild the asset itself and does not activate questions.

---

# 1. Purpose

`question-image-qc` is the independent quality gate for visual and structured representations.

Its job is to answer:

> “Does this asset accurately represent the validated question, obey the required standard, remain readable on mobile, and avoid giving away the answer?”

The reviewer must actively search for:

- mismatched labels or values
- incorrect geometry/scientific relationships
- missing required information
- unauthorized extra information
- answer leakage
- misleading visual proportions
- unreadable labels
- line/label overlap
- clipping
- wrong file format
- wrong filename
- invalid Storage URL
- oversize raster files
- representation-type mismatch
- accessibility issues
- subject-specific visual errors

---

# 2. Hard Independence Rule

Asset QC must be independent from Asset Builder.

The reviewer MUST NOT:

- assume the Builder followed the prompt correctly
- approve because the asset “looks clean”
- trust Builder self-check as evidence
- silently edit the SVG/WebP
- rewrite labels directly
- change the question
- change representation type without Orchestrator routing
- mark the question active
- bypass Human Review

The reviewer compares:

```text
validated question
+ structured asset spec
+ asset prompt
+ rendered asset
+ visual standard
```

and makes an independent decision.

---

# 3. Allowed Decisions

```text
PASS
REGENERATE
REJECT_ASSET
```

## PASS

Use when:
- asset matches the question/spec
- all required information is present
- no unauthorized information appears
- no answer leakage exists
- visual/technical standards pass
- no material readability issue exists

## REGENERATE

Use when the same representation remains appropriate but the implementation is defective.

Examples:
- label overlap
- clipping
- font too small
- line connection wrong
- missing label
- value typo
- poor spacing
- graph axis scale wrong
- circuit junction unclear

## REJECT_ASSET

Use when the asset concept itself should not proceed.

Examples:
- representation type is fundamentally wrong
- question does not need an asset
- asset specification conflicts with the question
- Builder cannot produce a truthful representation without changing content
- a required real-image source/provenance condition is invalid

---

# 4. Severity Model

Issue severity:

```text
critical
major
minor
advisory
```

## critical

The asset changes or invalidates the question.

Examples:
- wrong numerical label
- wrong graph data
- wrong circuit topology
- solution shown in figure
- wrong point correspondence

Default decision:
`REGENERATE` or `REJECT_ASSET`

## major

Asset may mislead or materially reduce usability.

Examples:
- ambiguous junction
- labels overlap important geometry
- unreadable graph axes
- wrong unit label
- omitted required relation

Default:
`REGENERATE`

## minor

Small visual defect with limited effect.

Examples:
- spacing slightly uneven
- nonessential alignment issue

May still require regeneration depending on standard.

## advisory

Non-blocking recommendation.

PASS allowed.

---

# 5. Input Contract

Normalized Asset QC input:

```yaml
run_id: run_42
slot_id: run42-slot017
question_id: 4120

validated_question:
  question_text: ...
  choices: [...]
  correct_index: 2

representation:
  type: svg_geometry

structured_asset_spec:
  objects: ...
  relations: ...
  labels: ...
  forbidden_labels: ...

asset_prompt: ...

asset:
  filename: q4120.svg
  content_type: image/svg+xml
  storage_url: https://...
  bytes: 6432

asset_standard:
  id: quizmon-question-image-standard
  version: 1.0

subject_visual_rules:
  ...
```

---

# 6. Output Contract

PASS:

```json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "question_id": 4120,
  "decision": "PASS",
  "issues": [],
  "checks": {
    "semantic_match": "pass",
    "answer_leakage": "pass",
    "readability": "pass",
    "technical_standard": "pass",
    "storage_validation": "pass"
  }
}
```

REGENERATE:

```json
{
  "decision": "REGENERATE",
  "issues": [
    {
      "code": "LABEL_OVERLAP",
      "severity": "major",
      "message": "Label AD=6 intersects segment AB.",
      "required_action": "Move the label away from the line while preserving the same value."
    }
  ]
}
```

REJECT_ASSET:

```json
{
  "decision": "REJECT_ASSET",
  "issues": [
    {
      "code": "REPRESENTATION_NOT_NEEDED",
      "severity": "major",
      "message": "The question does not require a visual representation and the asset adds no instructional information."
    }
  ]
}
```

---

# 7. QC Order of Operations

Recommended sequence:

```text
1. Technical metadata check
2. File/URL validation
3. Representation-type check
4. Semantic match to question
5. Required-information check
6. Unauthorized-information check
7. Answer-leakage check
8. Relationship/topology check
9. Label/value/unit check
10. Layout/readability check
11. Mobile-readability check
12. Subject-specific visual check
13. Accessibility check
14. Final decision
```

---

# 8. Technical Metadata Check

Verify:

- question_id exists
- filename matches question_id policy
- content_type matches representation
- storage_url exists
- persistent URL is not Base64/data URI
- asset_standard_version exists
- generation prompt/spec exists when required
- file size within policy
- asset belongs to the correct Run/Slot

Examples:

```text
q4120.svg → valid for question_id 4120
q4121.svg → invalid mismatch
```

---

# 9. Storage URL Validation

Check that the asset reference points to approved durable storage.

Current standard:
- Supabase Storage
- configured question-images bucket

Forbidden persistent forms:

```text
data:image/svg+xml;base64,...
data:image/webp;base64,...
```

If URL/reference is invalid:
`REGENERATE` or technical failure through Orchestrator.

---

# 10. Representation-Type Validation

The actual asset must match requested `representation_type`.

Examples:

```text
svg_geometry → SVG geometry
svg_graph → SVG graph
svg_circuit → circuit schematic
webp_real_image → WebP raster
table → structured table, not screenshot
equation → structured equation representation
```

A technically valid image in the wrong representation type fails.

---

# 11. Semantic Match — HARD RULE

The reviewer must compare the asset directly against the validated question.

Every explicit visual fact must match:

- labels
- numbers
- units
- object names
- point names
- line relations
- directions
- symbols
- axes
- graph values
- circuit connections
- biological structures
- chemical structures

Do not infer correctness from the generation prompt alone.

---

# 12. Structured Spec Precedence

When available:

```text
validated question
> structured_asset_spec
> normalized prompt
> free-form prompt
```

If these sources conflict:

Do not choose one silently.

Return:

```text
ASSET_SPEC_CONTENT_CONFLICT
```

for Orchestrator routing.

---

# 13. Required-Information Check

Verify all information required by the question is visible when the representation depends on it.

Examples:
- graph axes labeled
- point names present
- component values present
- unknown marked
- required parallel relation visually clear
- table headers complete

Missing required information:
`REGENERATE`

---

# 14. Unauthorized-Information Check

The asset must not add extra derived information unless explicitly authorized.

Examples of unauthorized additions:
- total side length derived from two segments
- calculated angle not given in stem
- resultant vector already drawn
- equilibrium value shown
- reaction product label not supplied
- biological pathway intermediate that resolves the question

Extra information can reduce question difficulty and invalidate the intended cognitive demand.

---

# 15. Answer-Leakage Check — HARD RULE

Check all visible and metadata-facing elements for solution leakage.

Potential leakage:
- unknown replaced with answer
- graph point labeled with requested value
- correct region highlighted
- answer choice emphasized
- explanatory arrow points to solution
- filename contains answer
- alt text reveals answer
- legend provides derived value

If learner can bypass intended reasoning:
`REGENERATE` or `REJECT_ASSET`

---

# 16. Geometry Semantic QC

For geometry:

Verify:
- points lie on intended lines
- parallel lines are rendered parallel
- perpendicular relations are visually credible when specified
- corresponding vertices are consistent
- segment labels map to correct segments
- angle labels map to correct vertices
- unknowns are attached to correct elements
- shape does not visually contradict stated relationships

Diagram need not be perfectly to scale unless scale is part of the question.

But it must not be misleading.

---

# 17. Geometry Label QC

Labels must:
- not overlap lines
- not overlap other labels
- not sit ambiguously between two segments
- remain within canvas
- use correct point names
- remain legible at mobile size

A label near the wrong segment is a semantic defect, not merely a visual defect.

---

# 18. Graph Semantic QC

Verify:
- x-axis variable correct
- y-axis variable correct
- units correct
- scale correct
- data/function correctly plotted
- critical points match the question
- slope/shape aligns with intended relationship
- no accidental interpolation/extrapolation clue
- graph is necessary for requested archetype

---

# 19. Graph Visual QC

Check:
- axis labels readable
- tick labels not crowded
- curve/line visible
- no deceptive aspect ratio
- no excessive grid lines
- no clipping
- relevant range visible
- labels do not overlap plotted line

Color must not be the sole encoding unless Profile explicitly permits and accessible redundancy exists.

---

# 20. Circuit Semantic QC

Verify:
- topology
- connections
- junctions
- series/parallel relationships
- component identity
- source polarity if relevant
- current/voltage arrows if specified
- values near correct component
- no accidental wire connection at crossings

Circuit topology errors are critical.

---

# 21. Physics Visual QC

Possible checks:
- vector directions
- force origin/endpoint
- field direction
- ray path
- principal axis
- normal line
- wave nodes/antinodes
- circuit convention
- PV graph state points

Subject adapter decides which apply.

---

# 22. Chemistry Visual QC

Verify representation-specific correctness:

### Structural / Lewis
- atom labels
- bond order
- connectivity
- charges
- lone pairs when required

### Reaction scheme
- reactants/products
- arrows
- conditions
- coefficients if shown

### Electrochemical cell
- electrode labels
- ion movement
- salt bridge
- polarity when specified

### Graph
- titration curve / energy profile consistent with question

Any chemistry error that changes interpretation is critical.

---

# 23. Biology Visual QC

Check:
- structure labels
- pathway direction
- chromosome/DNA orientation
- pedigree symbols
- phenotype/genotype markers
- phylogenetic branching
- organ/system schematic
- experimental layout

Avoid visually false simplifications.

If a simplification is pedagogical, it must remain scientifically valid at target level.

---

# 24. Pedigree QC

For pedigree:

- sex symbols correct
- affected/unaffected status correct
- parent-child connectors clear
- generations separated
- individual labels unambiguous
- no accidental inheritance clue beyond supplied information

---

# 25. Biological Real-Image QC

For WebP real images:

Check:
- subject visible enough for intended identification
- crop does not remove relevant feature
- compression does not destroy required detail
- no watermark
- no unrelated text
- file-size policy
- source/provenance metadata when required
- no decorative background that obscures content

---

# 26. Raster Compression QC

Current standard target:

```text
≤ ~50 KB
```

If the image is larger:
- verify whether profile allows exception
- otherwise regenerate/compress

Do not sacrifice essential scientific detail solely to meet size target; escalate if necessary.

---

# 27. Visual Standard QC

Default QuizMon diagram standard:

- white background
- dark line `#111`
- stroke-width ~6
- no shadow
- no gradient
- Arial Bold or approved equivalent
- large mobile-readable labels
- canvas around 980×520 for standard diagrams
- clean spacing

These are profile/versioned standards, not universal limits for every representation.

---

# 28. Mobile Readability QC

Review at reduced display size when possible.

Check:
- labels remain readable
- line widths remain visible
- important details survive scaling
- no dense clutter
- no small legend required
- long labels do not become illegible

A desktop-readable asset can still fail QuizMon use.

---

# 29. Label-Overlap Detection

Must actively inspect:
- text vs line
- text vs point
- text vs arrow
- text vs symbol
- text vs other text
- label vs canvas edge

Any overlap that may confuse interpretation:
`REGENERATE`

---

# 30. Edge Clipping Check

Verify nothing important is clipped:

- point labels
- component labels
- graph axes
- units
- arrowheads
- curve endpoints
- legends

If clipped:
`REGENERATE`

---

# 31. Visual Density Check

Asset should not include excessive detail.

Signals of excess density:
- many unnecessary labels
- long explanatory text
- overly dense grid
- decorative annotations
- redundant dimensions
- excessive color coding

If density harms learner interpretation:
`REGENERATE`

---

# 32. Minimality Check

QC should verify the asset includes the minimum sufficient information.

Ask:

> “If this element is removed, does the learner lose information required by the question?”

If no:
- consider it unnecessary
- flag if it affects difficulty or clarity

Minimality supports both UX and measurement quality.

---

# 33. Accessibility Check

Future-compatible checks:

- sufficient contrast
- meaning not encoded by color alone
- alt_text exists when required
- alt text does not reveal answer
- symbols supported by labels where useful

Accessibility rules may be expanded by Profile.

---

# 34. Filename QC

Filename must follow question ID.

Examples:

```text
q4120.svg
q4120.webp
```

If revision naming policy is enabled:

```text
q4120-r2.svg
```

must match current asset revision.

Unexpected names:
`REGENERATE` / technical correction.

---

# 35. File-Type QC

Check:

```text
.svg → image/svg+xml
.webp → image/webp
```

Do not accept:
- PNG for a required SVG diagram
- JPEG for real-image policy if WebP required
- mislabeled MIME type

---

# 36. SVG Structural QC

For SVG:

Check where practical:
- valid SVG document
- expected viewBox/canvas
- no embedded bitmap unless policy allows
- no external unsafe resource dependency
- text renders
- no invisible required element
- no malformed coordinates
- no excessive unnecessary SVG complexity

---

# 37. No Hidden Base64 Policy

SVG should not embed large raster images through Base64 unless explicitly authorized.

For diagram-only SVG:
- embedded raster should normally be rejected

This prevents bypassing file policy.

---

# 38. Prompt Consistency QC

Compare generated asset to `generation_prompt`.

Check:
- all requested elements present
- no missing relation
- no changed value
- no unauthorized decoration
- standard style obeyed

Prompt fidelity alone is insufficient; validated question remains higher priority.

---

# 39. Builder Notes Are Not Evidence

Ignore Builder statements such as:

```text
warnings: []
confidence: high
```

unless independently confirmed.

Builder notes may guide where to inspect but never substitute QC.

---

# 40. REGENERATE Instruction Quality

When returning `REGENERATE`, issue instructions must be precise enough to repair the asset without changing the question.

Bad:
```text
Make it better.
```

Good:
```text
Move label “AD = 6” 30–50 px left of segment AB. Keep all geometry unchanged.
```

---

# 41. REJECT_ASSET Decision Rule

Use `REJECT_ASSET` when fixing the visual implementation is not enough.

Examples:
- representation unnecessary
- wrong representation type
- spec conflicts with question
- required natural image unavailable
- visual task undermines intended cognitive demand
- content requires Author/QC revision

---

# 42. Asset Revision Review

On regenerated assets:

1. confirm original issue fixed
2. perform full Asset QC again
3. check no new defect introduced
4. validate same question/spec
5. check revision metadata
6. issue new independent decision

Do not inspect only changed area.

---

# 43. Human Visual Feedback

If Human requests visual revision:

Human feedback overrides prior Asset QC PASS.

The regenerated asset must:
- address human note
- still satisfy validated question
- pass full Asset QC again

---

# 44. Batch-Level Visual QC

A batch may have visual-system problems even when each asset is individually acceptable.

Inspect:
- inconsistent font sizing
- inconsistent stroke width
- inconsistent canvas scale
- repeated cramped layout
- systematic label placement bias
- inconsistent unknown notation
- excessive visual sameness

Return batch-level findings separately.

---

# 45. Cross-Asset Consistency

Within a subject/profile:

Equivalent representation conventions should remain consistent.

Examples:
- current arrows
- angle notation
- pedigree symbols
- graph axis style
- unknown notation
- chemical arrow conventions

Consistency must not override correctness.

---

# 46. Semantic Color QC

If semantic color is permitted:

Check:
- color meaning consistent
- answer not discoverable solely by color
- contrast adequate
- alternate labels/shapes support interpretation
- palette follows Profile

If color is decorative and not allowed:
`REGENERATE`

---

# 47. Real-Image Provenance QC

For externally sourced real images in future:

Required metadata may include:
- source
- license
- attribution
- usage permission
- modification history

If provenance is required but missing:
`REJECT_ASSET` / block through Orchestrator

---

# 48. QC Issue Taxonomy

Recommended codes:

```text
ASSET_CONTENT_MISMATCH
ASSET_SPEC_CONTENT_CONFLICT
MISSING_REQUIRED_LABEL
UNAUTHORIZED_LABEL
WRONG_VALUE
WRONG_UNIT
WRONG_RELATIONSHIP
WRONG_TOPOLOGY
WRONG_GRAPH_DATA
WRONG_AXIS
WRONG_SCALE

ANSWER_LEAKAGE
UNKNOWN_REVEALED

LABEL_OVERLAP
LABEL_AMBIGUOUS
TEXT_TOO_SMALL
EDGE_CLIPPING
VISUAL_DENSITY_HIGH
LOW_CONTRAST
MOBILE_READABILITY_FAIL

REPRESENTATION_TYPE_MISMATCH
REPRESENTATION_NOT_NEEDED
REPRESENTATION_INSUFFICIENT

FILENAME_MISMATCH
MIME_TYPE_MISMATCH
INVALID_STORAGE_URL
PERSISTENT_BASE64_FORBIDDEN
FILE_SIZE_EXCEEDED

SVG_INVALID
SVG_EMBEDDED_RASTER_FORBIDDEN

CIRCUIT_CONNECTION_ERROR
PHYSICS_DIAGRAM_ERROR
CHEMISTRY_STRUCTURE_ERROR
BIOLOGY_DIAGRAM_ERROR
PEDIGREE_ERROR

ACCESSIBILITY_FAIL
PROVENANCE_MISSING
```

Subject adapters may extend this list.

---

# 49. Evidence Requirement

Each blocking issue should include concise evidence.

Example:

```json
{
  "code": "WRONG_VALUE",
  "severity": "critical",
  "message": "Stem states AE = 9, but the SVG label shows AE = 6."
}
```

For overlap:

```json
{
  "code": "LABEL_OVERLAP",
  "severity": "major",
  "message": "The 'DB = 4' label intersects the AB segment and may be read as labeling a different segment."
}
```

---

# 50. Machine Checks vs Visual Reasoning

Deterministic checks should be used where possible.

## Machine-checkable

- filename
- MIME
- bytes
- Base64/data URI
- URL host/bucket
- SVG validity
- dimensions/viewBox
- required metadata

## Visual/semantic reasoning

- label placement
- whether diagram misleads
- graph interpretation
- scientific relationship
- answer leakage
- mobile readability
- representation usefulness

Use both layers.

---

# 51. Asset-QC Versioning

Record:

```text
question_image_qc_skill_version
visual_qc_model_version
subject_visual_profile_version
asset_standard_version
```

This enables regression analysis.

---

# 52. Metrics

Track:

```text
asset_pass_rate
regeneration_rate
reject_asset_rate

content_mismatch_rate
wrong_value_rate
answer_leakage_rate
label_overlap_rate
mobile_readability_failure_rate
file_policy_failure_rate

human_visual_override_rate
post_asset_qc_human_reject_rate

average_asset_revisions
average_asset_bytes
```

---

# 53. Human Override Analysis

Important event:

```text
Asset QC = PASS
Human = visual reject
```

Record Human reason.

Use these cases to improve:
- visual rules
- model calibration
- label-placement heuristics
- subject-specific conventions

---

# 54. Gold-Set Calibration

Future Asset QC should be tested against a curated set including:

- correct clean diagrams
- wrong numerical labels
- subtle parallel/perpendicular mistakes
- overlapping labels
- tiny text
- wrong graph axis
- deceptive graph scale
- circuit crossing/junction errors
- incorrect chemistry structure
- incorrect pedigree
- answer leakage
- oversized raster
- wrong filename
- Base64 persistence

---

# 55. Acceptance Tests — Geometry

Must detect:
1. label overlapping side
2. D not actually on AB
3. DE not parallel BC
4. wrong side value
5. solution revealed
6. tiny labels
7. clipped point name

---

# 56. Acceptance Tests — Graph

Must detect:
1. swapped axes
2. wrong unit
3. plotted data inconsistent with stem
4. deceptive scale
5. decorative graph for non-graph question
6. unreadable tick labels

---

# 57. Acceptance Tests — Physics

Must detect:
1. wrong force direction
2. incorrect ray path
3. circuit topology error
4. wrong polarity annotation
5. incorrect wave-node placement

---

# 58. Acceptance Tests — Chemistry

Must detect:
1. wrong molecular connectivity
2. invalid charge
3. wrong reaction arrow annotation
4. incorrect cell polarity
5. misleading energy profile

---

# 59. Acceptance Tests — Biology

Must detect:
1. wrong pedigree connector
2. incorrect chromosome label
3. reversed pathway direction
4. false anatomical relation
5. unreadable real-image feature

---

# 60. Acceptance Tests — Technical Compliance

Must detect:
1. qID filename mismatch
2. PNG used instead of required SVG
3. WebP > policy limit
4. persistent Base64 URL
5. invalid Storage URL
6. SVG with prohibited embedded raster

---

# 61. Acceptance Tests — Reviewer Discipline

Asset QC must NOT:

1. trust Builder confidence
2. silently modify the SVG
3. change the question
4. change representation type
5. activate the question
6. ignore Human visual feedback
7. PASS a wrong label because “the intended meaning is obvious”

---

# 62. Locked Principles for `question-image-qc`

1. Asset QC independently verifies the rendered result.
2. Visual cleanliness never substitutes for semantic correctness.
3. Validated question is the highest semantic authority.
4. Extra derived information can invalidate the asset.
5. Answer leakage is a hard failure.
6. Labels must be both correct and unambiguous.
7. Representation type must match the Blueprint intent.
8. Technical policy and learner readability are both required.
9. Builder notes are not evidence.
10. Regeneration instructions must be precise.
11. Human visual feedback overrides prior PASS.
12. Batch-level visual consistency is monitored.
13. Subject-specific visual rules are injected through adapters.
14. PASS means ready for Human Review, never permission to publish.

---

**Phase 2.5 Status:** Ready for human review
