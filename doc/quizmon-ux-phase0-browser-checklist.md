# Quizmon UX Phase 0 — Repeatable browser checklist

Run only with disposable test accounts. Remove every account/session before collecting a real baseline.

## Automated matrix

`npm run test:ux-phase0:browser` runs desktop 1440×900 and mobile 360×800, 375×667, 393×852, 412×915. Set `QUIZMON_E2E_BASE_URL`; set disposable `QUIZMON_E2E_EMAIL` and `QUIZMON_E2E_PASSWORD` for authenticated routes.

## Journeys and invariants

| Journey | Entry → exit | Required checks |
|---|---|---|
| Guest → egg | `/login` → `/guest` → `/eggs` | one submit, grade/band/Friend Code present, exactly one unhatched starter egg, retry repairs partial data |
| Hatch → Home | `/eggs` → naming → `/pet` | double click creates one pet, back/reload does not hatch or reward twice |
| Practice | `/quiz` mixed/topic → five answers → summary | answer locked while pending, feedback has text/icon, reload/back keeps one attempt per answer |
| Mission → food | Home mission → five answers → food | completion and bonus once; reward remains understandable after reload |
| Adventure | `/adventure` depart/bonus/claim | slow request and reload recover; depart/claim are idempotent |
| Raid | `/raid` select/play/reward | question/feedback/continue visible; reward claims once |
| Friend | `/social` search/request/accept | Friend Code visible and unique; duplicate request is harmless |
| PvP | `/pvp` challenge/accept/turn/resume | pending turn survives reload/back; duplicate card submission is rejected |
| Boss Raid | `/boss-raid` create/join/play/reconnect | host + participant reconnect; server state wins; completion/reward is single-shot |

For every journey: record viewport, browser, route, result, screenshot, console errors, horizontal overflow, smallest important touch target, keyboard coverage, 125% text zoom, slow/failed network result, reload, back and forward behavior.

## Funnel baseline contract

Events: `guest_started`, `guest_ready`, `starter_egg_viewed`, `pet_hatched`, `home_next_action_viewed`, `activity_started`, `question_answered`, `activity_completed`, `reward_claimed`, `review_opened`, `locked_cta_clicked`.

Every event includes `route`, `viewport_group`, and `user_state`. Activity events additionally use a low-cardinality `activity`. Never include name, email, school, phone, free-form answer text, or question text.

Baseline funnel excludes rows in `test_accounts` and anonymous/test sessions created by verification. Report conversion and median duration by Bangkok day and viewport group; do not treat missing client analytics as proof that a gameplay transaction failed.
