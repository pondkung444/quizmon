# Raid clarity and daily progression follow-up

## Changes
- Daily missions are the first home recommendation, including newly hatched players.
- After missions, training remains the next step until 180 daily Qmon EXP. At the cap, home explicitly offers optional review.
- Mission completion no longer implies the entire daily training goal is complete.
- Evolution URL cleanup runs before CTA navigation; a delayed cleanup could cancel navigation.
- Raid answers are selected first, then explicitly confirmed. Feedback shows the selected answer, correct answer, explanation, and actual turn damage/healing.
- Feedback uses the completed turn number and provides the appropriate next-step label.
- Mobile question scrolling preserves the confirmation dock and touch targets.

## Verification
- Existing Stage 4 test player: production collection, Adventure and Raid access verified without claiming rewards.
- Disposable new player: mission-first flow, training to 180 EXP, persistence after reload, and Stage 4 activity locks verified locally.
- Slow navigation from an evolution-marked home URL passed.
- Raid browser suite: 10 cases across five viewports, including enlarged feedback text.
- UX phase 0: 9 tests passed; UX phase 2: 4 passed; Raid: 22 passed.
- ESLint passed for changed components and verification scripts.

## Scope and safety
No database migration or real-user account changes. One disposable smoke-test account was converted to a registered fixture to pass the existing guest progression gate. Local authentication and credentials are ignored by Git.
This is a focused follow-up, not completion of every future usability or content phase.
