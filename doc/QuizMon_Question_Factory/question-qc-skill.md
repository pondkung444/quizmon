# QuizMon Question Factory v1
## Phase 2.3 — `question-qc` Skill

**Status:** Draft for review  
**Depends on:** `question-factory-contract-v1.md`, `question-factory-orchestrator.md`, `question-authoring-skill.md`  
**Role:** Independent content-quality reviewer  
**Scope:** Verify whether a question candidate is correct, curriculum-aligned, unambiguous, appropriately difficult, non-duplicative, and publishable from a content perspective. This skill does not build assets and does not activate questions.

---

# 1. Purpose

`question-qc` is the independent quality gate between Authoring and Asset/Review stages.

Its job is to actively search for defects.

The QC reviewer must not behave like a helpful co-author trying to justify the candidate. It must behave like an adversarial-but-fair reviewer asking:

> “What could make this question wrong, misleading, duplicated, mis-leveled, or unsuitable for the intended learner?”

The QC reviewer is responsible for checking:

- correctness of the intended answer
- correctness of `correct_index`
- correctness and adequacy of the explanation
- uniqueness of the intended answer
- curriculum fit
- learning-objective fit
- cognitive-demand fit
- difficulty fit
- question-archetype fit
- answer-format compliance
- distractor quality
- wording clarity
- numerical consistency
- scientific/mathematical validity
- duplicate and near-duplicate risk
- answer-length / pattern bias
- representation necessity and consistency
- subject-specific rules
- profile-specific reading level and format rules

---

# 2. Hard Independence Rule

Question QC must be independent from Author.

The reviewer MUST NOT:

- assume the Author’s answer is correct
- accept the Author’s explanation as evidence
- accept the Author’s difficulty label without checking
- accept the Author’s archetype/cognitive tags without checking
- approve because the wording “looks reasonable”
- patch the question silently
- change the Blueprint Slot
- publish or activate the question
- bypass Asset QC when an asset is required

The reviewer must independently reconstruct the logic needed to verify the question.

---

# 3. QC Decision Vocabulary

Allowed final decisions:

```text
PASS
REVISE
REJECT
```

## PASS

Use only when:
- no material correctness issue exists
- no ambiguity affecting answer validity exists
- slot/profile fit is acceptable
- no significant duplicate concern exists
- no required revision remains

Minor stylistic preferences that do not affect learner clarity should not block PASS.

## REVISE

Use when the candidate can be repaired while preserving the same Blueprint Slot and core question intent.

Examples:
- weak distractor
- correct_index mismatch
- explanation missing an essential step
- wording ambiguity that is fixable
- difficulty slightly miscalibrated
- representation prompt incomplete
- one numerical value needs correction but the question concept remains valid

## REJECT

Use when:
- core concept is wrong
- multiple answers are valid
- curriculum mismatch is fundamental
- the question is a prohibited near-duplicate
- the archetype/learning objective is materially different from the slot
- repair would effectively require creating a new question
- the stem/representation concept is fundamentally misleading
- the item cannot be made valid without changing its core intent

---

# 4. Severity Model

Each issue must be assigned severity.

Recommended levels:

```text
critical
major
minor
advisory
```

## critical

Question cannot be trusted.

Examples:
- wrong correct answer
- scientifically false core claim
- mathematically impossible setup
- multiple valid answers
- question asks for something undefined

Default outcome: `REJECT` or `REVISE` only if a narrow correction fully fixes it.

## major

Quality or alignment issue that affects measurement validity.

Examples:
- wrong cognitive demand
- chapter/LO mismatch
- strong clue to correct option
- major wording ambiguity
- explanation uses incorrect reasoning despite correct answer
- near-duplicate violating policy

Default outcome: `REVISE` or `REJECT`.

## minor

Fix improves quality but does not change answer validity.

Examples:
- unit formatting
- unnecessary wording
- small explanation clarity issue

Outcome may be `REVISE` if policy requires clean publication.

## advisory

Non-blocking suggestion.

PASS is allowed.

---

# 5. Input Contract

Normalized QC input:

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

candidate:
  question_text: ...
  choices: [...]
  correct_index: 2
  explanation: ...
  learning_objective: LO_03
  topic: ...
  difficulty: 2
  cognitive_demand: analyze
  question_archetype: application
  representation_type: none
  needs_asset: false
  asset_prompt: null

existing_bank_context:
  nearest_questions: [...]
  template_clusters: [...]
  repetition_policy: ...

subject_qc_rules:
  ...

profile_qc_rules:
  ...
```

---

# 6. Output Contract

Example PASS:

```json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "decision": "PASS",
  "issues": [],
  "checks": {
    "answer_correctness": "pass",
    "unique_answer": "pass",
    "curriculum_fit": "pass",
    "slot_fit": "pass",
    "difficulty_fit": "pass",
    "cognitive_fit": "pass",
    "duplicate_check": "pass"
  },
  "qc_notes": "..."
}
```

Example REVISE:

```json
{
  "decision": "REVISE",
  "issues": [
    {
      "code": "CORRECT_INDEX_MISMATCH",
      "severity": "critical",
      "message": "The computed answer is choice 1, but correct_index points to choice 2.",
      "required_action": "Correct correct_index and recheck explanation."
    }
  ]
}
```

Example REJECT:

```json
{
  "decision": "REJECT",
  "issues": [
    {
      "code": "MULTIPLE_VALID_ANSWERS",
      "severity": "critical",
      "message": "Choices B and D are both valid under the stated conditions."
    }
  ]
}
```

---

# 7. QC Order of Operations

QC should check in a consistent order.

Recommended sequence:

```text
1. Schema / format validity
2. Independent solve / truth check
3. Unique-answer check
4. Explanation check
5. Slot fidelity
6. Curriculum / learning-objective fit
7. Cognitive-demand fit
8. Difficulty fit
9. Archetype fit
10. Distractor quality
11. Wording / reading level
12. Duplicate / structural-clone check
13. Bias / pattern check
14. Representation requirement check
15. Subject-specific QC
16. Final decision
```

Critical failures early in the sequence may justify immediate REJECT, but the reviewer should still record other obvious material issues when useful.

---

# 8. Independent Answer Verification — HARD RULE

The QC reviewer must solve or verify the question independently.

Do not derive correctness from:
- Author explanation
- Author notes
- correct_index
- expected answer metadata

For mathematics:
- recalculate
- validate equations
- check domain restrictions
- verify geometry assumptions

For physics:
- derive formula usage
- check dimensions/units
- validate physical feasibility

For chemistry:
- recompute mole ratios
- verify formula/equation balance
- check charge/oxidation states

For biology:
- independently verify mechanism and terminology
- check whether the inference follows from the evidence

---

# 9. Unique-Answer Check

For single-choice questions, QC must ensure exactly one valid answer.

Check:

- two options are not numerically equivalent
- alternate interpretation does not make another option correct
- rounding does not create overlap
- units do not make two choices equivalent
- broad biological/scientific wording does not permit multiple answers
- missing conditions do not make answer dependent on assumptions

If more than one answer can reasonably be defended:

```text
REJECT or REVISE
```

Never PASS based on “the intended answer is obvious.”

---

# 10. Correct-Index Validation

QC must confirm:

```text
choices[correct_index]
```

equals the independently verified correct answer.

This must be machine-checkable where possible.

A correct explanation with a wrong index is still a blocking defect.

---

# 11. Explanation Validation

The explanation must be checked separately from the answer.

Possible cases:

```text
Answer correct + explanation correct → okay

Answer correct + explanation flawed → REVISE

Answer wrong + explanation consistent with wrong answer → critical

Answer correct by coincidence + invalid reasoning → REVISE/REJECT
```

The explanation should:
- use valid reasoning
- be sufficient for the target level
- not introduce false claims
- not rely on hidden information
- not contradict the stem/asset

---

# 12. Learning Objective Fit

QC must answer:

> Does this question actually measure the assigned Learning Objective?

It is not enough that the item belongs to the same chapter.

Example:

Slot:
```text
LO = interpret velocity-time graphs
```

Candidate:
```text
asks for memorized definition of acceleration
```

Result:
```text
REJECT — LO_MISMATCH
```

A related topic does not count as the intended LO.

---

# 13. Topic / Subtopic Fit

Check that the question genuinely belongs to the assigned topic.

Avoid accepting questions that are technically valid but drift into:
- prerequisite content
- adjacent chapter
- more advanced content
- mixed content not requested by the Blueprint

Cross-topic questions are allowed only when the Blueprint explicitly requests mixed/multi-step integration.

---

# 14. Cognitive-Demand Verification

QC must evaluate the actual thinking required.

Reference interpretation:

## recall

Retrieve fact, formula, term, definition.

## understand

Explain, classify, identify relationships, interpret simple meaning.

## apply

Use learned method/process in a direct but non-identical situation.

## analyze

Break information into parts, infer relationships, compare evidence, integrate multiple steps.

## evaluate

Judge alternatives using criteria/evidence, critique method/claim/design.

Do not accept an `analyze` tag simply because the question has many words.

Do not accept `apply` if the learner only substitutes into an explicitly provided formula with no meaningful decision.

---

# 15. Difficulty Verification

Difficulty is learner-relative, not equal to cognitive category.

QC should consider:

- number of reasoning steps
- familiarity of representation
- abstraction
- computational burden
- distractor plausibility
- amount of information integration
- reading load
- prerequisite demand
- novelty relative to target grade

Reject or revise obvious miscalibration.

Example:

A simple direct multiplication labeled “hard” for M.3 is likely incorrect unless Profile context justifies it.

---

# 16. Question-Archetype Verification

QC must confirm the item genuinely fits its assigned archetype.

Examples:

`graph_interpretation`
- learner must interpret graph information
- graph cannot be decorative

`experimental_design`
- learner must reason about design/variables/control
- merely naming equipment is not sufficient

`application`
- learner should transfer concept into context
- direct recall with a story wrapper does not count

`multi_step`
- more than one meaningful reasoning step
- not simply several arithmetic operations after one formula substitution

---

# 17. Distractor Quality

QC must inspect every distractor.

A strong distractor should:
- be wrong for a specific reason
- be plausible to the target learner
- reflect a misconception or common error where possible
- match answer format and grammatical structure
- not be absurdly far from other options without reason

Reject/revise distractors that are:
- obviously nonsense
- impossible by unit/order-of-magnitude
- duplicates of another option
- almost identical to correct answer except formatting
- semantically incompatible with the stem
- clues to the correct answer

---

# 18. Distractor Misconception Mapping

When Author Notes provide target misconceptions, QC should verify the mapping.

Example:

```text
correct = area scale factor = k²
distractor = k
```

This is a valid misconception-based distractor.

But QC must not trust the label alone.

It should confirm the distractor actually corresponds to the stated error.

---

# 19. Answer-Length Bias

QC must inspect whether correct options are systematically distinguishable by:

- longer wording
- more precise wording
- more qualifications
- more technical vocabulary
- more complete sentence structure

A single item may occasionally have unavoidable length difference, but if the correct answer is conspicuously more detailed, revise.

At bank/batch level, this should also be monitored statistically.

---

# 20. Grammatical / Structural Clues

Check for:
- article agreement
- singular/plural mismatch
- tense mismatch
- units present only in correct answer
- one option repeating terminology from the stem
- one option having significantly different syntax

Such clues can invalidate measurement quality even when content is correct.

---

# 21. Correct-Position Pattern Check

Per-item QC confirms valid index.

Batch-level QC or Orchestrator metrics should monitor distribution.

Avoid patterns such as:
```text
correct_index = 2 for 80% of batch
```

QC may flag batch-level bias even when individual questions are valid.

---

# 22. Wording Clarity

Check:

- one clear task
- no double negatives unless pedagogically necessary
- no unnecessary trick wording
- no vague pronouns
- all variables and conditions defined
- no hidden assumptions
- terms appropriate to grade
- punctuation supports meaning
- Thai terminology is standard when Thai Profile is used

---

# 23. Reading-Level Fit

The content must match the intended learner’s reading level.

QC must distinguish:

```text
conceptual difficulty
vs
language difficulty
```

Do not allow a simple science concept to become difficult only because the sentence is overly dense.

Primary profiles should receive especially strict wording checks.

---

# 24. Numerical Consistency

For every quantitative question, verify:

- all given numbers are usable/consistent
- no unused number creates confusion without purpose
- ratios and totals agree
- diagram values match stem metadata
- arithmetic yields an offered answer when single-choice
- units are compatible
- conversion factors are correct
- rounding policy is clear
- precision is reasonable

---

# 25. Unit and Dimension Check

For science and applied mathematics:

- units must be valid
- dimensions must match the requested quantity
- conversion must be correct
- answer choices should use consistent units unless unit conversion is being tested
- omit units only when Profile/discipline convention supports it

Physics QC should apply dimensional analysis whenever practical.

---

# 26. Physical Feasibility Check

Physics questions should be checked for impossible or misleading scenarios.

Examples:
- negative absolute mass
- speed/result inconsistent with constraints
- force directions contradictory to stated equilibrium
- circuit configuration inconsistent with described values
- physically impossible energy gain without source

Not every idealized classroom model is “unrealistic”; use curriculum conventions.

---

# 27. Chemistry Correctness Check

Chemistry QC rules should include:

- chemical formula correctness
- equation balancing
- charge balance
- atom conservation
- oxidation-number logic
- mole ratio
- stoichiometric arithmetic
- state symbols when relevant
- nomenclature
- acid/base assumptions
- equilibrium assumptions
- electrochemical sign conventions
- structural formula validity

Subject Profile determines which checks apply.

---

# 28. Biology Correctness Check

Biology QC rules should include:

- terminology
- mechanism correctness
- directionality of processes
- organ/system function
- cell structure/function
- genetic inference
- pedigree logic
- chromosome/DNA terminology
- ecological relationship
- taxonomy
- evolution reasoning
- experimental interpretation

Avoid oversimplifications that become false statements.

---

# 29. Experimental-Design QC

For experimental questions, verify:

- manipulated variable
- responding variable
- controls
- fair comparison
- sufficient data
- inference strength
- causation claims
- replication/sample reasoning when in scope
- apparatus feasibility

A question should not demand a conclusion unsupported by the experimental description.

---

# 30. Data-Interpretation QC

For tables/graphs/data:

- data must be internally coherent
- headers/units must be defined
- learner can derive the intended answer
- correct answer should require intended interpretation
- no missing data critical to conclusion
- graph/table does not contradict stem
- visual scaling does not distort inference

---

# 31. Representation Necessity Check

Question QC does not inspect final asset quality, but it checks whether the planned representation makes sense.

Possible outcomes:

```text
representation appropriate
representation unnecessary
representation required but missing
representation type wrong
```

Example:

Slot = graph_interpretation  
Candidate = no graph needed

Result: `REJECT/REVISE`.

Example:

Simple verbal ratio question marked svg_geometry for decoration

Result: `REVISE — representation unnecessary`.

---

# 32. Asset-Prompt Consistency Check

Before asset generation, QC should verify `asset_prompt` against the candidate.

Check:
- labels match stem
- values match stem
- unknown remains unknown
- required relationships are included
- no extra information reveals answer
- representation type matches slot
- prompt does not contradict the question

Final visual correctness remains the job of Asset QC.

---

# 33. Duplicate Check — Exact

Check against supplied bank context for:
- identical stem
- identical options
- trivial rewording
- reused explanation with same question

Exact/near-text duplicates should generally be rejected.

---

# 34. Duplicate Check — Structural

Structural duplication is more important.

Compare:
- reasoning steps
- formula path
- variable roles
- data structure
- distractor misconception pattern
- representation structure

Example:

```text
AD=4, AB=10, AE=6 → find AC
```

vs

```text
AD=6, AB=15, AE=9 → find AC
```

may be the same template.

If repetition is not explicitly required by Blueprint drill policy, flag it.

---

# 35. Duplicate Check — Pedagogical Repetition

Not all repetition is bad.

Accept controlled repetition when:
- Blueprint explicitly targets practice
- numerical variation changes difficulty meaningfully
- misconception targets differ
- representations differ meaningfully
- repetition cap is not exceeded

QC must distinguish deliberate drill from accidental AI duplication.

---

# 36. Bank-Level Diversity Check

When reviewing a batch, QC should inspect diversity across:
- reasoning templates
- contexts
- correct positions
- distractor patterns
- cognitive demand
- archetypes
- representation types

A batch can contain individually valid questions but still be poor as a set.

Batch-level findings should be returned separately from per-item decisions.

---

# 37. Curriculum Boundary Check

QC must reject content beyond the pinned curriculum scope unless the Profile explicitly allows enrichment.

Examples:
- advanced calculus in a non-calculus physics target
- terminology introduced only in later grade
- molecular mechanism beyond expected biology depth
- shortcut theorem not yet taught

The reviewer should not “correct upward” using general expert knowledge if it exceeds intended level.

---

# 38. Profile Compliance

Check all Profile constraints, including:

- language
- locale
- choice count
- answer type
- grade
- reading level
- allowed notation
- difficulty scale
- prohibited archetypes
- representation policy
- subject-specific conventions

A correct question can still fail Profile compliance.

---

# 39. Subject-QC Adapter

The core QC Skill remains generic.

Subject-specific rules arrive as an adapter.

Example:

```yaml
subject_qc_rules:
  physics:
    check_units: true
    check_dimensions: true
    check_sign_convention: true

  chemistry:
    check_balance: true
    check_charge: true

  biology:
    check_mechanism_accuracy: true
    check_taxonomy: true
```

The QC core must not hardcode one subject.

---

# 40. Confidence and Uncertainty

QC must not bluff certainty.

If correctness cannot be confidently determined from provided curriculum/profile context:

```text
REVISE or BLOCK through Orchestrator
```

with issue:

```text
INSUFFICIENT_QC_CONTEXT
```

Do not PASS based on assumption.

---

# 41. Issue Codes

Recommended core issue taxonomy:

```text
ANSWER_INCORRECT
CORRECT_INDEX_MISMATCH
MULTIPLE_VALID_ANSWERS
NO_VALID_ANSWER
EXPLANATION_INCORRECT
EXPLANATION_INSUFFICIENT

LO_MISMATCH
TOPIC_MISMATCH
CURRICULUM_OUT_OF_SCOPE
PROFILE_VIOLATION

COGNITIVE_DEMAND_MISMATCH
DIFFICULTY_MISMATCH
ARCHETYPE_MISMATCH

DISTRACTOR_WEAK
DISTRACTOR_DUPLICATE
ANSWER_LENGTH_BIAS
GRAMMATICAL_CLUE

AMBIGUOUS_STEM
MISSING_CONDITION
UNDEFINED_TERM
READING_LEVEL_MISMATCH

NUMERICAL_INCONSISTENCY
UNIT_ERROR
ROUNDING_AMBIGUITY
PHYSICAL_IMPOSSIBILITY

STRUCTURAL_DUPLICATE
TEXT_DUPLICATE
DRILL_LIMIT_EXCEEDED

REPRESENTATION_MISSING
REPRESENTATION_UNNECESSARY
REPRESENTATION_TYPE_MISMATCH
ASSET_PROMPT_MISMATCH
ANSWER_LEAKAGE_RISK

SUBJECT_RULE_VIOLATION
INSUFFICIENT_QC_CONTEXT
```

Subject adapters may add codes.

---

# 42. REVISE vs REJECT Decision Rule

Use `REVISE` when:

> The same intended question can become valid through targeted edits.

Use `REJECT` when:

> The item’s core reasoning, objective alignment, or uniqueness is fundamentally defective.

Examples:

Wrong distractor → REVISE  
Wrong correct_index → REVISE  
Minor number correction → REVISE  

Wrong LO → REJECT  
Two valid answers caused by core setup → often REJECT  
Near-duplicate template exceeding policy → REJECT  
Scientifically false premise → REJECT unless premise can be narrowly corrected

---

# 43. QC Must Not Rewrite Silently

The QC worker may suggest revisions, but must not return a secretly rewritten final candidate as if it were the Author output.

Required flow:

```text
QC identifies issue
→ REVISE
→ Orchestrator sends issue to Author
→ Author returns revision
→ QC reviews again
```

This preserves auditability and role separation.

---

# 44. Revision Review

On a revised candidate, QC must:

1. verify original issues were fixed
2. perform full QC again
3. check that revision introduced no new defects
4. compare against immutable slot
5. update decision independently

Do not only check the changed sentence.

---

# 45. Human-Feedback Review

If a human requests revision:

Human feedback has highest precedence.

QC should verify the revised candidate against:
- human note
- original slot
- all normal QC rules

A prior PASS does not guarantee future PASS after revision.

---

# 46. Batch QC Output

For a batch, return:

```json
{
  "summary": {
    "reviewed": 20,
    "pass": 16,
    "revise": 3,
    "reject": 1
  },
  "batch_issues": [
    {
      "code": "CORRECT_POSITION_BIAS",
      "message": "11 of 16 passing items use option C."
    }
  ],
  "items": [...]
}
```

This allows the Orchestrator to preserve item decisions while reacting to batch-level quality drift.

---

# 47. Machine Checks vs Reasoning Checks

Some QC should be deterministic.

## Machine-checkable examples

- correct_index range
- choice count
- required fields
- duplicate exact-text hash
- image URL format
- answer-position distribution
- numeric field type
- unsupported status

## Reasoning-required examples

- answer validity
- ambiguity
- LO fit
- distractor plausibility
- cognitive demand
- structural duplicate
- scientific correctness

The QC Skill should use machine evidence where available rather than asking AI to infer everything.

---

# 48. QC Evidence

Where possible, QC should include concise evidence.

Example:

```json
{
  "code": "ANSWER_INCORRECT",
  "evidence": "Using AD/AB = DE/BC gives 5/12 = 10/BC, so BC = 24, not 22."
}
```

Evidence should be sufficient for Author revision and audit.

Do not expose internal chain-of-thought; provide concise verification rationale only.

---

# 49. QC Versioning

Every decision must record:

```text
question_qc_skill_version
qc_model_version
subject_qc_profile_version
```

This enables future quality analysis.

---

# 50. QC Metrics

Track at least:

```text
pass_rate
revise_rate
reject_rate
critical_error_rate
correct_index_error_rate
duplicate_reject_rate
LO_mismatch_rate
cognitive_mismatch_rate
difficulty_mismatch_rate
distractor_issue_rate
human_override_rate
post-QC_human_reject_rate
```

A high post-QC human rejection rate signals weak QC.

---

# 51. Human Override Metric

When:

```text
QC = PASS
Human = REJECT
```

record an override reason.

These cases are especially valuable for improving QC rules.

Examples:
- visual pedagogy issue missed
- distractors felt unnatural
- curriculum nuance
- wording inappropriate for actual students

---

# 52. Gold-Set Calibration

Future QC versions should be tested against a curated gold set containing:

- clearly correct questions
- subtly wrong answers
- multiple-answer traps
- near-duplicates
- curriculum mismatches
- weak distractors
- misleading graphs
- wrong units
- chemistry balancing errors
- biology mechanism errors

Do not deploy a major QC version without calibration once the Factory becomes automated.

---

# 53. Acceptance Tests — Cross-Level

QC must correctly review:

## Primary Science
- 3-choice item
- simple language
- image-supported concept

## Junior Math
- standard calculation
- geometry item
- misconception distractors

## Senior Physics
- unit/dimension check
- graph interpretation
- circuit reasoning
- multi-step calculation

## Senior Chemistry
- stoichiometry
- balanced equations
- oxidation/reduction
- experimental data

## Senior Biology
- mechanism
- pedigree
- data interpretation
- diagram-supported inference

No core rewrite should be needed between subjects.

---

# 54. Acceptance Tests — Defect Detection

QC must detect at least:

1. wrong correct_index
2. correct answer absent from choices
3. two valid options
4. correct answer with invalid explanation
5. LO mismatch
6. recall question mislabeled analyze
7. easy question mislabeled hard
8. weak distractors
9. correct-answer length clue
10. exact duplicate
11. structural clone with changed numbers
12. wrong unit
13. impossible physics value
14. unbalanced chemistry equation
15. biologically false mechanism
16. asset prompt revealing answer
17. graph question with decorative graph only
18. primary question with excessive reading level

---

# 55. Acceptance Tests — Reviewer Discipline

QC must NOT:

1. pass because Author says confidence is high
2. pass because explanation sounds fluent
3. rewrite silently
4. change Blueprint Slot
5. ignore human feedback
6. treat technical retry as content revision
7. approve final asset quality
8. activate the question

---

# 56. Pilot Thresholds

Initial Pilot should monitor, not hardcode, thresholds.

Suggested quality targets after calibration:

```text
post-QC human critical-error catch: near zero
correct-answer error escaping QC: near zero
duplicate escape rate: very low
human rejection after QC: declining over time
```

Thresholds should be established from actual Pilot data, not guessed before evidence.

---

# 57. Locked Principles for `question-qc`

1. Reviewer must independently verify truth.
2. Author explanation is not evidence.
3. Exactly one valid answer is mandatory for single-choice.
4. Correctness and explanation correctness are separate checks.
5. LO/topic fit matters more than chapter proximity.
6. Difficulty and cognitive demand are independently reviewed.
7. Distractors are part of item validity, not decoration.
8. Duplicate detection includes structural reasoning clones.
9. Curriculum/Profile boundaries are hard constraints.
10. QC suggests revisions; it does not silently rewrite.
11. Subject expertise is injected through versioned adapters.
12. Human decisions override QC.
13. Batch-level quality can fail even when individual items pass.
14. Uncertainty must be surfaced, not guessed through.
15. PASS means ready for the next gate, never permission to publish.

---

**Phase 2.3 Status:** Ready for human review
