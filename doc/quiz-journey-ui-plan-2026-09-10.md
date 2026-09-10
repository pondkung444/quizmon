# Quiz journey UI development plan

Status: Proposed after source inspection; application code unchanged.

## Findings

- `src/app/quiz/page.tsx`: the entire route uses `max-w-md` (448px), including desktop play. Padding further reduces question width.
- `src/components/QuizClient.tsx`: one component owns subject selection, topic selection, play, food selection, and both summaries. The playing branch does not render the pet, despite receiving `petAvatarPath`.
- Current progress is `(index + 1) / total`: the first unanswered question already shows progress and the last unanswered question shows 100%.
- `QuestionImage` preserves aspect ratio but limits height to 45vh, has no enlargement, and disappears on load failure. Detailed diagrams can become too small or essential information can disappear.
- Correct-answer feedback uses continuous bounce. Explanations are only rendered for wrong answers.
- `SpeechBubble` returns null without a message, so it cannot serve as a persistent journey avatar.
- Normal rounds request five questions. Actual returned length can differ. Missions use remaining target count and an existing completion offset.
- Answers are evaluated locally for immediate feedback, queued for server submission, and awaited at finish. Preserve this behavior and existing reward/mission rules.
- The existing palette is dark charcoal, amber and gold. Static pet PNG paths and short CSS bounce effects already exist.

## Proposed experience

Use a compact illustrated journey above a calm question card. Keep the existing dark identity with a muted blue-green journey surface, mint completed route, amber primary action, and warm near-white text. Define route-scoped semantic colors rather than replacing global tokens. Explore a light palette later as a separate comparison, not a prerequisite.

Desktop: centered 720–840px play container, compact journey about 120–150px high, then one question column. Mobile: 16px side gutters and a journey about 88–112px high. These are starting design targets to validate with real content. Keep subject selection and food selection at their appropriate narrower widths.

Question order: subject/category label, full question, optional image, four stacked answer buttons, feedback/explanation, continue action. Do not fix card height or pin the journey over long content. Long categories wrap. Use restrained decoration outside the reading surface.

## Journey behavior

- Represent zero through N completed steps: a start position and N destinations. Five-question rounds have five movements, not four.
- Keep the pet visible without requiring a speech event. Reuse the active pet image, with a neutral fallback if absent or broken. Egg images move as tokens too; no walking sprites required.
- On answer, show feedback and keep the player on the question for reading.
- On Continue, move to the next completed destination regardless of correctness; then show the next question. Use a short 250–400ms transition, guard repeated clicks, and respect reduced motion. Start answer timing when the next question is actually shown.
- On the last Continue, show arrival and saving state while existing finish processing completes. Only show earned rewards after the relevant server result. Provide retry/error feedback without replaying answer submissions unnecessarily.
- Derive destinations from actual round length. For missions, preserve completed offset and target count; previously completed points remain visible. Avoid assuming every entry is a fresh five-question round.
- Use a destination flag or home by default. Food is specific to the existing mission flow; do not imply every practice run awards a food chest or guaranteed EXP.
- Reset journey and scroll-to-question behavior correctly for play-again. Scrolling must not interrupt reading feedback.

## Question images and feedback

- Extract `QuizQuestionImage`: preserve full image with contain, neutral backing, loading placeholder, visible failure notice and Retry. Never silently remove required question information.
- Add accessible enlargement with close button, Escape, focus management and return focus. Fit to viewport initially and allow inspection of larger detail. Verify phone/WebView scrolling and zoom behavior.
- Provide useful fallback alt text now; richer authored image descriptions would be a separate data improvement.
- Keep answer labels and add icons/text for selected, correct and incorrect states. Do not rely on color alone. Use visible keyboard focus and generous touch targets.
- Show explanations after either correct or incorrect responses when available. Keep wrong-answer copy encouraging and avoid repeating a large red panel.
- Replace continuous bounce with a single brief response. Existing personality messages must not cover the diagram or choices.

## Implementation sequence

1. Extract presentation components under `src/components/quiz/`: `QuizPlayScreen`, `QuizJourney`, `QuizQuestionImage`, `QuizAnswerChoices`, `QuizAnswerFeedback`. Keep orchestration and submission logic in `QuizClient` initially. Introduce phase-appropriate widths and scoped colors.
2. Implement journey states, persistent pet, movement, arrival, reduced motion, and actual mission offsets. Wire to existing next/finish flow with duplicate-click guards.
3. Implement image viewing/error handling, feedback, keyboard/focus behavior, and long-content scrolling. Integrate journey arrival with both existing summary flows.
4. Verify representative fixtures before authenticated end-to-end testing. Iterate spacing and contrast using screenshots at mobile, tablet and desktop widths.

## Acceptance checks

- Text-only, long Thai question/choices, wide diagram, tall diagram, broken image, and slow image load.
- 360px and 390px phones, tablet, 1440px desktop; no horizontal overflow or clipped image data.
- Five answers produce five movements; wrong answers also advance; no early completion indicator.
- Short returned round, resumed mission, completed mission, no pet image, egg and adult pet.
- Correct/wrong feedback, explanation visibility, repeated Continue clicks, save failure, exit, replay, food selection and evolution summary.
- Existing scoring, submission queue, mission claims and analytics remain equivalent; no duplicate answers or rewards due to animation.
- Keyboard operation, modal focus/Escape, contrast, reduced motion and touch targets.
- Run lint/build and targeted journey-state tests; browser-check the actual play flow. Do not treat component fixtures alone as proof that saving and rewards work.

## Success measurement

Compare round completion, exits by question position, and replay after summary. Inspect existing analytics coverage before adding events; distinguish practice and resumed missions. Do not use faster answer speed as the success criterion. No completion improvement is claimed before user testing.

## Implementation update

Implemented 2026-09-10: mobile safe-area shell, wider desktop play card, dark teal/mint journey with persistent static pet and five completion movements, completed journey on food/summary screens, image loading/retry and inline enlargement, answer icons, explanations for both outcomes, reduced motion, and final-submit duplicate guard. Global native configuration and scoring actions were not changed.

Adjustment: enlargement is inline with a scrollable image instead of a modal, preserving native Back behavior without new history handling. Presentation extraction is limited to Journey and QuestionImage; existing play orchestration remains in QuizClient.

Verified: production build and TypeScript passed. Browser component fixture checked at 360/390/768/1440px with no horizontal overflow, image expand/collapse/retry, five movements, and reduced-motion transition of 0s. Screenshot inspected at 390px. The fixture uses the real Journey and QuestionImage components with representative question content; it is not an authenticated full QuizClient integration test.

Release checks still required: authenticated answer/save/reward flow, resumed missions, physical iOS/Android WebViews and native store builds. No claim of store certification or device testing. On uncertain finish failure, direct the user to their pet rather than retrying the non-idempotent EXP award.
