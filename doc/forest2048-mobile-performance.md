# Mobile input and rendering — 2 October 2026

Pilot report: Android, probably Chrome; handset/model and a physical-device trace were unavailable. Code inspection found 400–720ms of deliberately serialized animation waits per swipe, rebuilding every tile and all relic images on each render, rebuilding the collapsed combat log, duplicate full-run saves, and a POST plus leaderboard/stats GET after every swipe.

Changes:

- Touch controls use 150ms slide wait, 50ms attack/retaliation staging and 20ms final wait. Desktop and reduced-motion timings retain their paths. Mobile tier glows no longer animate continuously; rune art is retained.
- Reuse tile elements by cell and update content only when the tile changes. One animation-frame callback restores movement transitions after the render. No full-layout read to restart reactions.
- Cache inventory/wallet until coins or owned relics change. Rebuild the combat log only when its disclosure is open; opening it shows the latest log. A no-op swipe only updates its hint.
- Ranked actions write the full local checkpoint once after metrics and outbox are updated. Legacy unranked runs still save normally. Each valid swipe still saves immediately; storage is not debounced.
- Flush swipe journals in bounded batches scheduled 650ms apart; choices still flush immediately. Do not reload leaderboard/stats while on the game screen. Existing retries, revision deduplication, offline outbox and 256-action server bound remain. Visibility/page-hide still save locally; visibility-hide also attempts a flush without promising delivery.

## Repeatable diagnostic

Run `node --experimental-strip-types scripts/forest-mobile-performance.mjs LABEL`. Local static/API fixture using the real replay engine, 390×844 touch viewport, Edge/Chromium headless with 6× CPU slowdown; no production writes. Render workload: full board and all 40 relics, 30 renders with layout read. Input workload: six legitimate swipes. Timing includes animation waits, not just JavaScript. This is not a trace from an Android handset and does not establish FPS on every device.

Baseline versus final-patch measurements:

| Metric | Before | After |
|---|---:|---:|
| Median render in heavy fixture | 65.9ms | 20.3ms |
| DOM nodes added across 30 repeated renders | 3570 | 630 |
| Median swipe completion | 616.3ms | 304.5ms |
| Slowest of six swipes | 749.8ms | 366.0ms |
| Checkpoint POSTs during six swipes | 6 | 3 |
| Leaderboard/stats GETs during six swipes | 6 | 0 |

An earlier after-patch run measured 290.1ms median and two POSTs; scheduling and CPU load affect these small samples. Treat the improvement as diagnostic evidence rather than a device-independent promise.

Validation: engine/replay/database 13 tests; browser at 320/390/430 with actual touch, one checkpoint write per valid swipe, saved metrics, stable wallet node, displayed tile values/root states matching the engine, server replay, offline reload, lost-ack retry and summaries. Existing saves and balance/skill rules are unchanged. Follow up with Chrome on the reporting handset after refreshing the page; if lag remains, obtain model and whether it is input delay, frame stutter or initial load.
