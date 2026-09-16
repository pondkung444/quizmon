# Phase 3: Stage 4 player guidance

- Add a secondary, expandable growth guide below the existing daily EXP bar.
- Use the existing evolution thresholds (50, 350, 900 accumulated EXP), not duplicated constants.
- Explain accumulated EXP versus daily training and the one-stage-at-a-time rule.
- Explain collecting a fully grown Qmon into the farm before choosing it for Adventure or Raid.
- Locked home activities now explain what to do while waiting for Stage 4.
- Preserve the primary mission-first, training-to-cap resolver and the accepted Raid screen.

Verification: component rendering tests cover intermediate, full-grown, and over-threshold states. The next-action regression suite retains mission and daily-training priority. No progression rules, database writes, or migrations changed.

Authenticated browser verification passed on five viewports (360, 375, 393, 412, 1440) and 125% guide text. No horizontal overflow; expandable control remains at least 44px high. Used the existing disposable registered account without changing account data. Build passed with the project environment supplied at build time.

Remaining Phase 3 scope: food/resource clarity and human usability testing.
