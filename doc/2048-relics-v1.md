# Relics v1 — implementation and owner-test handoff

Base: origin/main 42f991a5d47dda0c93b76dadad82e2204cdb89a1 (PR #268), fetched 2 October 2026. Isolated branch codex/2048-relics. Existing checkout changes were preserved. No AGENTS.md was found in the workspace or this checkout.

## Accepted design sources

- [40 relics](https://app.notion.com/p/3ed7cdca67f1818ca0cad4d7ede9db99)
- [36 Auto skills](https://app.notion.com/p/3ec7cdca67f181dbabe0dc6a955850b7)
- [Six egg runes](https://app.notion.com/p/3ec7cdca67f1814ab2a4dd3232746743)
- [Endless](https://app.notion.com/p/3ec7cdca67f1815883b8f8e9a741994a)
- [Handoff](https://app.notion.com/p/3eb7cdca67f181eeb272c1a75a0fec0e)
- [Main design](https://app.notion.com/p/3ea7cdca67f1816c87fde52d4317db74)

The user's attached implementation request supersedes the older relic draft: Instant is Common without curse; seven cursed relics total; mark-source eligibility; interrupt lock; twin/seed exclusion; additive crown growth.

## Implemented scope

40 stable IDs: Common 13 / Rare 17 / Epic 10. Stage/mark/exclusion filters apply to rewards and shops. Grade weights 60/30/10, boss Epic guarantee if available, prices 30/50/80. Relic hooks for merges, Auto, marks, enemy attacks, utility rooms and Endless. Compact glyph icons use existing forest/crystal UI and avoid new asset downloads. Owned relics can be tapped. Coins, repeat counter, lucky direction, next rune and interrupt readiness are visible.

New journeys set relicVersion:1 in the existing version:3 save schema and keep the existing account-scoped save key. Old eight-room and no-relic Endless journeys retain their behavior. No pet stat, XP, learning-counter, account rewards or server persistence changes.

## Explicit engine decisions

- Merge bonuses add in one group before multiplying by original combo and eligible criticals. Skill, ongoing rune stacks and counters do not inherit ordinary merge relic bonuses. Weakness is enemy damage reception and applies at impact. Shield Strike checks armor against the displayed intent before simultaneous merge outputs.
- Swipe is the only event that advances moves, Auto buff age, periodic stacks, ordinary charge and spawns. No-op does none of these. Gravity merges use applicable spatial/general merge bonuses and marks; no combo/critical/ordinary charge, no root-layer decrement, no spawn or second Auto. Elemental units can be redeemed once on gravity merges. Pulse and explosion use 30%/40% rune output including stacks but no cold/spark units, marks, combo, critical or chain.
- Chain grants one extra link per lineage after ordinary pairs. Stable order is board lines in ascending index and directional cells. Mark number/type transformations happen before further links; marks are consumed by each successful merge at their fixed cell. Both input lineages lose further chain permission after a link. Garden neighbor changes happen after all merge outputs, preserving deterministic simultaneous behavior.
- Mirror, Growth and Seal trigger on both normal and resonance repeated casts. Resonance counts normal casts only and repeats once. Mark-created charge remains pending for the next swipe. All mark types share 16-cell occupancy. Pin stores remaining uses per cell; acquisition upgrades existing marks to two uses.
- Battery and Candle scale numeric skill damage/armor/healing, including snapshots for delayed power and mark power. They do not multiply status durations, cold units, reduction percentages, targets or rune-buff percentages. Candle records the combo of the casting swipe, never crit/echo. Overflow converts excess once, including existing skill overflow and wells.
- Interrupt cancellation locks the next heavy attack; the lock clears after that heavy action. State survives reload and resets with the room. Enemy death from reflection/counter stops subsequent attack events and settles once.
- Jar runs after carry cleanup, costs ceil(maxHP * .08), leaves at least 1 HP, and fills up to three available cells with random type at 16. Pierce persists through utility rooms and consumes at the next battle, capped at 50% max enemy HP before reception rules, with further carry disabled.
- Crown acquisition anchors the current enemyLevel; only later level intervals use 1.16, earlier intervals remain 1.08. Receiving it after a level-1 boss sets startLevel=1, wins=0; the already defeated boss grants no retroactive +20%, while level 2 damage uses one 1.16 step. Subsequent defeated stags add 0.20, never compound merge power.

## Economy and saves

Restored original reward cadence at local rooms 2 and 4, plus every stag. This gives two guaranteed setup opportunities before the first stag. Coin rewards remain 20 / 45 at local room 4; quiz cash and exhausted-pool compensation remain 25 per unfilled selection. Tome picks two distinct IDs from the same persisted three-offer set and blocks revival; if conflict filtering empties the set, compensate each remaining pick. NoRest wells become reward rooms with no healing. HeavyCoin disables purchases with a reason.

The entire battle snapshot stores per-room relic state, marks/remaining uses, preview rune, interrupt lock and buffs; run stores relic IDs, offers, remaining picks, RNG, repeat counter carry, pierce carry, crown anchor/wins. No load-time offer generation is used for v1.

## Verification

- Run: `node --test tests/forest2048/*.test.mjs` (eight programs, original seven plus relic behavior suite).
- Build: `npm run build` passed compilation, TypeScript, page data and static generation. Installed locked dependencies using npm ci --ignore-scripts in this checkout. The initial attempt using the owner's older parent dependencies failed on missing unrelated packages; no dependency manifest or application code outside /2048 was changed.
- Browser: `node tests/forest2048/relics-browser.cjs` with Playwright available; Edge API fixtures at 320x568, 390x844, 430x844. Start, reward, shop purchase, reload, inspect, input, stag Epic offer, level 2, reload; no page error/horizontal overflow. Evidence in output/relic-verification/browser.json and mobile screenshots.
- Browser tests deliberately set some room outcomes and use fixture accounts. They are flow verification, not owner balance playtest, real authenticated account verification, physical-device testing or production verification.
- Browser input uses Edge CDP touch events through the game's actual gesture handlers. Agent-browser was unavailable on PATH, so the existing project Playwright/Edge verification route was used.
- Existing simulator does not load relic-engine/relic-run. Its old no-relic results are not relic balance evidence. No relic balance claim is made; owner playtest comes next.

## Start owner testing

[PR #270](https://github.com/pondkung444/quizmon/pull/270) · [Preview /2048/](https://quizmon-git-codex-2048-relics-pon-d.vercel.app/2048/). Vercel checks passed and deployment reported Ready for 43d80d7. Opening the preview redirected to Login – Vercel due to deployment protection, so game behavior on the remote Preview was not verified. The owner must authenticate with authorized Vercel access first. No production merge/deploy occurred.

Open the PR deployment's /2048/ page, sign in normally, choose a Qmon and start a new journey. Existing saved journeys continue under their old rules. If an old journey resumes, use Pause > new journey to enter relicVersion:1. Obtain first relic after room 2; shop/quiz/well choices begin according to the existing route. Production is unchanged until this branch is approved and merged.
