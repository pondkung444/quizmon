# Question Factory Office Visualization v1

Status: **Design checkpoint — active before Factory worker implementation**

Recorded: 2026-08-28

## 1. Current project checkpoint

QuizMon Question Factory has completed the design and production-hardening work through Phase 4:

- Phase 1: Factory contract
- Phase 2: Orchestrator, Author, Question QC, Image Builder and Image QC skill specifications
- Phase 3: Curriculum/Profile schema
- Phase 4.0–4.5a: production contract, data model, product mapping, RLS/Storage plan, migrations and scope key
- Phase 4.5b: private staging Storage production smoke test and trust-boundary verification

Phase 5 pilot production has **not started**.

The active work is a design checkpoint between Phase 4 and Phase 5:

> Design the Factory worker and its observable event contract together with the Factory Office experience before implementing the worker skeleton.

This checkpoint exists so the worker records enough truthful state and events for a visual office without making animation state part of the production source of truth.

## 2. Experience decision

Question Factory will include a living 2D office visualization for:

- tracking where a run and each slot currently are;
- seeing queues, retries, rejections, failures and human-review waits;
- making long-running question production more understandable and enjoyable.

The visual direction is:

- human chibi characters, approximately 2.5–3 heads tall;
- warm 2D office viewed from a three-quarter or management-game angle;
- readable silhouettes, props and emotions at mobile size;
- sprite-based or separable character parts for reusable actions;
- animation driven only by persisted Factory state/events.

The office is not decorative-only, but it is also not a workflow controller. Factory tables and append-only events remain the source of truth. Refreshing the UI must reconstruct the correct scene from persisted state.

## 3. Initial office cast

| Character | Factory role | Primary prop |
|---|---|---|
| Factory Manager | Blueprint, queue and run coordination | clipboard / planning board |
| Question Author | question drafting and revision | keyboard, notes and books |
| Question QC | independent correctness and quality review | glasses and red pen |
| Image Builder | SVG/WebP asset creation | stylus and drawing display |
| Image QC | semantic and visual asset inspection | magnifying glass |
| Publisher | final checklist and trusted product delivery | approval stamp and delivery tray |

Human Reviewer represents the real reviewer rather than an autonomous NPC. Candidates wait outside the review room or in a review tray until a real human decision is persisted.

## 4. Shared action vocabulary

Initial reusable actions:

~~~text
idle
walk
receive_work
working
thinking
success
reject
send_work
waiting
error
celebrate
~~~

Action and emotion are separate dimensions. Example:

~~~text
action = working
emotion = focused
~~~

Initial emotions:

~~~text
neutral
happy
focused
confused
worried
tired
excited
proud
~~~

Role-specific actions may extend this vocabulary, but the worker must emit semantic production events, not animation commands or durations.

## 5. Visual work item

A question slot is represented by a numbered work folder. Its color communicates the current production stage:

| Folder state | Meaning |
|---|---|
| white | queued |
| blue | authoring |
| purple | asset work |
| yellow | pending human review |
| green with stamp | approved |
| red | rejected or revision required |
| grey with warning | technical failure |

The visible folder ID maps to a real slot ID. Selecting it opens factual run/slot/revision/QC information.

## 6. Architecture boundary

The implementation must preserve these rules:

1. Database current state and append-only events are authoritative.
2. Office UI is a projection and cannot directly invent or advance workflow state.
3. Animation timing is UI-only and must never be persisted as production truth.
4. Every visible rejection, retry, transfer, wait, failure and completion must be explainable by a real event.
5. A refresh, reconnect or delayed event stream must converge to current persisted state.
6. Fast event sequences may be visually compressed, but audit history must remain complete.
7. Errors and blocked work must remain legible; entertainment must not hide operational truth.
8. Human approval remains explicit and cannot be simulated by an NPC animation.

## 7. Event-contract requirement for the worker

Before the worker skeleton is implemented, the existing event vocabulary must be checked against the office projection. At minimum, the UI needs semantic facts for:

~~~text
work_assigned
stage_started
stage_completed
stage_failed
revision_requested
work_transferred
human_review_requested
approval_received
publish_started
publish_completed
~~~

These may map onto the existing canonical Factory event names rather than creating duplicate database events. Any UI-specific normalization should happen in an adapter/read model.

An event may carry factual fields such as:

~~~json
{
  "run_id": "run_42",
  "slot_id": "run42-slot017",
  "event_type": "QUESTION_QC_REVISE",
  "actor_type": "question_qc",
  "revision": 2,
  "created_at": "..."
}
~~~

It must not carry instructions such as “walk for three seconds” or “play celebration animation”.

## 8. Views to design

Two views are planned:

1. **Office overview** — whole production line, live queues, bottlenecks, alerts and run progress.
2. **Slot detail** — one folder/question, current stage, revision history, QC issues, assets and human-review state.

The office overview must remain useful without animation and under reduced-motion accessibility settings.

## 8.1 Approved Office Overview direction

The approved environment reference is [Office overview environment concept v1](assets/factory-office/office-overview-environment-approved-v1.png).

The Office Overview uses a warm three-quarter management-game view with a U-shaped production flow. Factory Manager oversees the room from the back-center coordination station. The remaining role stations follow the production path from Question Author and Question QC through Image Builder, Image QC, the unoccupied Human Review waiting area and Publisher.

The shared transfer surface is office furniture rather than industrial machinery. Its main folder progression is white queued, blue authoring, purple asset work, yellow pending human review and green approved. Red revision work returns toward the authoring side; grey technical failures leave the main path for an explicit holding state.

The environment, workers, folders, state indicators and transfer-path overlays must remain separable implementation layers. The approved image is a composition and visual-language reference, not a single baked production background.

## 9. First visual prototype

The first character prototype will be Question Author because it exercises the most reusable actions:

~~~text
idle
receive_work
working
thinking
revision
send_work
success
~~~

Prototype sequence:

1. lock the shared chibi style sheet;
2. design the Question Author silhouette, palette, props and turnaround;
3. create the initial action set;
4. place the character in one office workstation mockup;
5. test readability at mobile size and with reduced motion;
6. approve the visual system before expanding to the remaining cast.

## 10. Resume point

When work resumes, continue in this order:

1. design and approve the chibi character/style system;
2. define the Office UI state-to-action adapter;
3. reconcile Office event needs with the canonical Factory event contract;
4. implement the minimal Factory worker skeleton for run/slot/snapshot/event lifecycle only;
5. build the Office overview against real persisted worker state;
6. start Phase 5 pilot only after the worker and observability projection pass their acceptance tests.

No pilot questions should be generated or published during this design checkpoint.

