# QuizMon Question Factory v1
## Phase 2.2 — `question-authoring` Skill

**Status:** Draft for review  
**Depends on:** `question-factory-contract-v1.md`, `question-factory-orchestrator.md`  
**Role:** Content generation worker  
**Scope:** Create one question candidate for one Blueprint Slot. No approval, no QC bypass, no activation.

---

# 1. Purpose

`question-authoring` converts a single Blueprint Slot into a structured question candidate.

It must generate content that satisfies the exact slot specification while remaining within the pinned Curriculum Profile and Blueprint version.

The Author is responsible for:
- producing the question stem
- producing the answer structure
- selecting the intended correct answer
- writing the explanation
- assigning generation metadata from the slot
- deciding whether a representation is required
- preparing an asset prompt when needed
- avoiding duplicates and near-duplicates using supplied bank context

The Author is **not** responsible for approving its own work.

---

# 2. Hard Boundaries

The Author MUST NOT:

- change the Blueprint Slot
- choose a different learning objective because it is easier
- change cognitive demand or archetype to fit a preferred question
- publish or activate questions
- mark its own output as QC PASS
- bypass Question QC
- generate or upload assets directly
- overwrite an existing active question
- silently reuse a rejected candidate
- silently modify curriculum metadata
- infer unsupported curriculum content beyond supplied Profile context

If the slot is impossible or internally inconsistent, the Author must return a structured failure instead of inventing a workaround.

---

# 3. Input Contract

Normalized Author input:

```yaml
run_id: run_42
slot_id: run42-slot017

profile:
  id: thai_math_m1_decimal_fraction
  version: 1.0

blueprint:
  id: bp_42
  version: 1.0

slot:
  learning_objective: LO_03
  topic: decimal_word_problem
  cognitive_demand: analyze
  question_archetype: application
  difficulty: 2
  representation_type: none
  answer_type: single_choice
  choice_count: 4

language_policy:
  language: th
  reading_level: lower_secondary

existing_bank_context:
  active_examples: [...]
  near_duplicate_patterns: [...]
  banned_patterns: [...]

subject_rules:
  ...
```

The Author must treat `slot` fields as requirements, not suggestions.

---

# 4. Required Output

Successful Author output:

```json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "status": "success",

  "candidate": {
    "question_text": "...",
    "answer_type": "single_choice",

    "choices": [
      "...",
      "...",
      "...",
      "..."
    ],

    "correct_index": 2,
    "explanation": "...",

    "learning_objective": "LO_03",
    "topic": "decimal_word_problem",
    "difficulty": 2,
    "cognitive_demand": "analyze",
    "question_archetype": "application",

    "representation_type": "none",
    "needs_asset": false,
    "asset_prompt": null
  },

  "author_notes": {
    "reasoning_template": "multi-step proportional application",
    "duplicate_risk": "low"
  }
}
```

If the slot cannot be fulfilled:

```json
{
  "status": "blocked",
  "block_reason": "SLOT_CONSTRAINT_CONFLICT",
  "details": "..."
}
```

---

# 5. Slot Fidelity — HARD RULE

The generated candidate must match the assigned slot.

The Author must not drift across these dimensions:

- learning_objective
- topic / subtopic
- cognitive_demand
- question_archetype
- difficulty band
- answer_type
- choice_count
- representation_type

Example:

If the slot says:

```text
cognitive_demand = analyze
archetype = graph_interpretation
representation = svg_graph
```

the Author must not return a recall question with no graph.

---

# 6. Curriculum Fidelity

The Author must use only curriculum/profile scope supplied in the input package.

It must avoid:
- advanced terminology outside level
- techniques not yet introduced in the target curriculum
- shortcuts that depend on later-grade knowledge
- subject-specific claims not supported by the profile
- mixing unrelated learning objectives

If Profile evidence is insufficient, return `blocked` or request clarification through the Orchestrator.

---

# 7. Difficulty vs Cognitive Demand

These are separate.

## Difficulty

Represents how hard the question is for the target learner.

Possible scale is Profile-defined.

Example current scale:

```text
1 = easy
2 = medium
3 = hard
```

## Cognitive Demand

Examples:

```text
recall
understand
apply
analyze
evaluate
```

A question may be:

```text
difficulty = 2
cognitive_demand = analyze
```

or

```text
difficulty = 3
cognitive_demand = apply
```

The Author must satisfy both independently.

---

# 8. Question Archetype Fidelity

Core archetypes may include:

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

Subject Profiles may add specialized archetypes.

Examples:

Physics:
- vector_analysis
- circuit_analysis

Chemistry:
- reaction_prediction
- stoichiometric_reasoning

Biology:
- pedigree_analysis
- pathway_interpretation

The question design must genuinely match the requested archetype.

---

# 9. Answer-Type Flexibility

The Author must not assume all questions are 4-choice MCQ.

Supported future answer types may include:

```text
single_choice
multiple_choice
numeric
short_answer
```

Current QuizMon production may use `single_choice`, but the Skill must remain format-flexible.

For `single_choice`, enforce exactly one intended correct option.

For future types, follow Profile-specific schema.

---

# 10. Choice Construction Rules

For single-choice questions:

1. exactly one correct answer
2. distractors must be plausible
3. distractors should reflect likely misconceptions when possible
4. no distractor should be obviously nonsensical unless appropriate for very low reading level
5. avoid lexical clues
6. avoid correct-answer length bias
7. avoid grammatical mismatch between stem and options
8. avoid repeated prefixes when they can be moved into the stem
9. avoid answer-order patterns
10. do not rely on “all of the above” or “none of the above” unless explicitly allowed by Profile

---

# 11. Correct-Answer Position

The Author should not force a fixed `correct_index` pattern.

If the Orchestrator/Profile provides a target index distribution, follow it.

Otherwise:
- vary naturally
- do not systematically favor any position
- do not encode semantic clues from position

Question QC will still verify distribution at bank level.

---

# 12. Explanation Rules

The explanation must:

- support the correct answer directly
- be mathematically/scientifically consistent
- use age-appropriate language
- show enough reasoning for learning value
- avoid unnecessary verbosity
- not introduce a different method that contradicts the expected curriculum
- not simply repeat the correct choice

For calculation questions:
- include key setup
- include essential operations
- include units when relevant

For conceptual questions:
- explain the principle, not just restate the fact

---

# 13. Numerical Question Rules

For quantitative items:

- numbers must be internally consistent
- units must be explicit when relevant
- arithmetic should produce the intended answer
- avoid accidental alternate correct answers caused by rounding
- significant figures policy must follow Subject/Profile rules
- use realistic values unless intentionally abstract
- avoid excessive arithmetic burden unless the Blueprint intends computation difficulty
- difficulty should come from reasoning, not merely ugly numbers

---

# 14. Science-Specific General Rules

For science questions:

- distinguish model from fact when needed
- avoid scientifically false simplifications
- keep causal wording precise
- do not imply correlation = causation
- use correct units and symbols
- ensure experimental claims match supplied evidence
- ensure diagrams/prompts do not reveal the answer

Subject-specific QC will handle deeper discipline checks later.

---

# 15. Mathematics-Specific General Rules

For math questions:

- notation must be consistent
- variables must be defined
- geometry labels must match intended relationships
- avoid impossible figures or inconsistent measurements
- ensure only one mathematically valid answer for single-choice
- avoid unnecessary calculation if the slot is conceptual
- avoid hidden assumptions not stated in the stem or figure

---

# 16. Reading-Level Control

The Author must follow the Profile reading level.

Primary:
- shorter sentences
- concrete language
- limited nesting
- avoid unnecessary technical vocabulary

Lower Secondary:
- concise but can include multi-step instructions

Upper Secondary:
- allow more formal discipline language
- still avoid avoidable verbosity

Reading complexity must not accidentally become the main source of difficulty unless Blueprint explicitly targets reading/data interpretation.

---

# 17. Representation Decision

The Slot defines expected representation behavior.

If:

```text
representation_type = none
```

the Author should not invent an asset unless the slot is impossible without one.

If:

```text
representation_type = svg_geometry
```

the question should genuinely need or benefit from the diagram.

The Author outputs `asset_prompt`, but does not generate the asset itself.

---

# 18. Asset Prompt Contract

For asset-required questions, `asset_prompt` must be sufficiently deterministic to recreate the intended asset.

It should specify:

- required objects
- labels
- values
- relationships
- orientation/placement constraints when pedagogically important
- information that must not be shown
- representation type
- style-standard reference

Example:

```text
Draw triangle ABC with D on AB and E on AC. DE is parallel to BC.
Label AD=6, DB=4, AE=9, EC=?.
Do not display AC or AB totals.
Use QuizMon SVG diagram standard.
Keep all labels clear of lines.
```

The prompt should not contain irrelevant art-direction beyond the standardized asset style.

---

# 19. Asset Leakage Prevention

The Author must not request assets that reveal the solution.

Examples of prohibited leakage:

- showing the unknown side length
- marking the correct choice
- drawing a graph with the requested answer explicitly labeled
- including explanatory arrows that only appear in the solution
- adding annotations not present in the stem that trivialize the inference

---

# 20. Duplicate Avoidance

The Author receives `existing_bank_context`.

It must avoid:

## Exact duplicates
Same or near-identical wording/content.

## Numerical clones
Same reasoning template with only numbers changed.

## Structural clones
Different surface story but same operation path and distractor structure.

Numerical/structural repetition may be allowed only when:
- Blueprint explicitly calls for drill
- pattern repetition is pedagogically intentional
- configured repetition limits are respected

---

# 21. Reasoning Template Metadata

The Author should tag the candidate with a concise reasoning-template descriptor.

Examples:

```text
single-step ratio
two-step unit conversion
AA similarity with side proportion
graph slope comparison
stoichiometric limiting reagent
pedigree recessive inference
```

This metadata helps QC detect near-duplicate structure.

It is not shown to learners.

---

# 22. Misconception-Driven Distractors

When possible, distractors should map to realistic misconceptions.

Example mathematics:
- inverted ratio
- forgot to square scale factor for area
- added instead of multiplied

Example physics:
- ignored sign
- confused velocity with acceleration
- used mass instead of weight

Example chemistry:
- incorrect mole ratio
- forgot coefficient
- charge mismatch

Example biology:
- confused transcription with translation
- reversed dominant/recessive inference

Distractors should not be random noise.

---

# 23. Ambiguity Prevention

The Author must verify before submission:

- all terms are defined
- the question asks exactly one thing
- conditions are sufficient
- units are stated
- diagrams, if required, are essential or supportive
- no option overlap exists
- no two options are equivalent
- no hidden assumption is required

If ambiguity cannot be removed without changing the slot, return blocked.

---

# 24. Data / Table Questions

For data interpretation items:

- data must be sufficient
- values must be internally coherent
- units and headers must be defined
- avoid unnecessary columns
- data should enable the requested inference
- answer should require interpretation, not merely locating a cell, unless Blueprint says recall/understand

Structured tables are preferred over raster images when possible.

---

# 25. Graph Questions

For graph interpretation:

- define axes
- include units
- choose scale appropriate to data
- ensure plotted relationships match intended concept
- avoid accidental visual distortion
- do not encode answer via color if color is not pedagogically required
- asset prompt must specify graph content precisely

---

# 26. Experimental Questions

For experimental-design or data-analysis questions:

- distinguish manipulated / responding / controlled variables correctly
- include enough context to judge the setup
- do not claim evidence stronger than the experiment supports
- avoid impossible apparatus/conditions
- align with target curriculum’s experimental reasoning expectations

---

# 27. Question Variety Policy

The Author should not optimize for convenience.

Within a Blueprint, it should vary:
- surface contexts
- numerical values
- wording structure
- reasoning pathways
- representation style where slot allows
- distractor misconception patterns

But variety must not override slot fidelity.

---

# 28. Style Policy

Questions should be:

- concise
- unambiguous
- age-appropriate
- neutral
- free from unnecessary narrative
- free from culturally obscure context unless Profile allows
- free from trick wording unless explicitly intended

Avoid:
- excessive negatives
- double negatives
- irrelevant decoration
- “gotcha” phrasing
- unnecessary named characters when not useful

---

# 29. Safety / Sensitivity

Question content should avoid unnecessary:
- graphic injury/death details
- discriminatory stereotypes
- sensitive personal data
- political persuasion
- unsafe procedural instructions

If a curriculum-relevant topic requires sensitive context, use age-appropriate neutral framing.

---

# 30. Localization

The Author must follow Profile localization:

```text
language
locale
curriculum terminology
units
number formatting
grade-appropriate vocabulary
```

For Thai curriculum:
- preserve accepted Thai subject terminology
- use standard symbols consistently
- avoid unnecessary English except established terms/symbols

---

# 31. Subject Adapter Inputs

The Author Skill is generic.

Subject-specific behavior is supplied through `subject_rules`.

Example Physics Author Rules:
- units mandatory where appropriate
- vector/sign convention metadata
- realistic physical values

Chemistry:
- formula notation
- balanced-reaction constraints
- nomenclature rules

Biology:
- accepted terminology
- mechanism granularity
- taxonomy conventions

The core Author Skill must not hardcode one discipline.

---

# 32. Profile Adapter Inputs

Education-stage rules come from the Profile.

Examples:

Primary:
```text
choice_count = 3
reading_level = simple
cognitive ceiling = apply
```

Senior:
```text
choice_count = 4 or 5
multi_step allowed
formal notation allowed
```

The Author consumes these rules without changing its core logic.

---

# 33. Candidate Self-Check

Before returning a candidate, the Author should run a structured self-check.

This is not QC approval.

Checklist:

```text
[ ] slot matched
[ ] curriculum scope matched
[ ] answer type matched
[ ] choice count matched
[ ] exactly one intended correct answer
[ ] explanation matches answer
[ ] numbers internally consistent
[ ] no obvious ambiguity
[ ] no answer leakage
[ ] asset prompt complete if needed
[ ] duplicate risk checked
```

If a check fails, revise before submission or return blocked.

---

# 34. Self-Check Cannot Replace Independent QC

Even if Author self-check passes:

```text
candidate → Question QC
```

always.

The Author must never return:

```text
qc_status = PASS
```

as an authoritative decision.

---

# 35. Failure Modes

The Author may return `blocked` for cases such as:

```text
SLOT_CONSTRAINT_CONFLICT
INSUFFICIENT_CURRICULUM_CONTEXT
REPRESENTATION_CONFLICT
ANSWER_FORMAT_UNSUPPORTED
SUBJECT_RULE_CONFLICT
DUPLICATE_SPACE_EXHAUSTED
```

Blocked outputs must include a concise explanation.

---

# 36. Revision Input

When revising after QC or Human feedback, the Author receives:

```yaml
original_candidate: ...
revision_number: 1

issues:
  - type: distractor_weak
    message: ...

immutable_slot:
  ...
```

The Author may change candidate content but must not change the immutable slot.

---

# 37. Revision Rules

On revision:

- fix only what is needed
- maintain slot fidelity
- avoid introducing new issues
- update author_notes if reasoning template changes
- preserve revision history externally through Orchestrator
- do not reuse a previously rejected answer structure if rejection targeted that structure

---

# 38. Replacement Rules

A replacement is a new candidate for the same slot.

Replacement should be materially different from the rejected candidate when rejection involved:
- conceptual flaw
- structural duplication
- ambiguous formulation
- invalid representation concept

It must not simply paraphrase the rejected item.

---

# 39. Author Versioning

Every output must identify the Author Skill/model version used.

Example:

```text
author_skill_version: question-authoring-v1
author_model_version: ...
```

This enables later analysis of:
- rejection rate by version
- duplicate rate
- human rejection rate
- subject-specific performance

---

# 40. Author Notes

Author Notes are internal metadata, not learner-facing.

Recommended fields:

```json
{
  "reasoning_template": "...",
  "target_misconceptions": ["..."],
  "duplicate_risk": "low",
  "asset_risk": "low",
  "special_assumptions": []
}
```

QC may use these, but must independently verify them.

---

# 41. Machine-Validatable Output Rules

The Author output should be machine-checkable.

For single-choice:
- choices is an array
- length = Profile choice_count
- correct_index integer
- `0 <= correct_index < choice_count`

For asset:
- representation_type defined
- `needs_asset` boolean
- if needs_asset=true → asset_prompt non-empty

Metadata:
- slot dimensions returned exactly
- no unknown required fields omitted

---

# 42. Acceptance Tests

The Author Skill must produce valid candidates for:

## A. Primary Science
- simple reading level
- 3 choices
- image-supported conceptual question

## B. Junior Math
- 4 choices
- calculation
- optional SVG diagram

## C. Senior Physics
- multi-step calculation
- graph interpretation
- circuit-analysis slot

## D. Senior Chemistry
- stoichiometric reasoning
- reaction/equation representation
- experimental data

## E. Senior Biology
- mechanism question
- data interpretation
- pedigree/diagram representation

It must support all cases without changing core Author rules.

---

# 43. Rejection-Oriented Tests

The Author must correctly return blocked or revise internally when asked to:

1. create a recall question for an `analyze` slot
2. create a no-image item for a mandatory graph-interpretation slot
3. create 4 choices when Profile requires 3
4. use content outside pinned curriculum scope
5. produce a near-duplicate when duplicate policy forbids it
6. generate an asset prompt that reveals the answer
7. create an impossible numerical scenario
8. infer missing curriculum facts not provided by Profile

---

# 44. Metrics for Pilot

Track Author performance:

```text
first-pass Question QC rate
revision rate
hard reject rate
human reject rate
near-duplicate rate
numerical error rate
asset-prompt error rate
slot-drift rate
average revisions per accepted item
```

These metrics will guide future Author versions.

---

# 45. Locked Principles for `question-authoring`

1. One Blueprint Slot → one candidate intent.
2. Slot dimensions are immutable requirements.
3. Author creates; Author does not approve.
4. Difficulty and cognitive demand are separate.
5. Distractors should represent misconceptions, not random noise.
6. Explanation must teach the reasoning.
7. Duplicate avoidance includes structural clones.
8. Asset prompts must be deterministic and non-leaking.
9. Curriculum scope is pinned; unsupported inference is forbidden.
10. Output must be structured and machine-validatable.
11. Self-check is mandatory but never replaces independent QC.
12. Core Author logic remains grade/subject neutral.

---

**Phase 2.2 Status:** Ready for human review
