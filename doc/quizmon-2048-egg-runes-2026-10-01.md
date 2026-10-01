# QuizMon 2048: egg runes, utility carry fix and difficulty trial

Owner-approved design: https://www.notion.so/3ec7cdca67f1814ab2a4dd3232746743

## Behavior

New account runs have four equally likely types: sword, shield, heal, and the companion egg rune (25% each, all stages for this initial experiment). The API snapshots `eggPrefix`; equipped gear remains excluded. Existing saves remain playable with their existing three-type board/config; start a new run to try egg runes. No learning counters, EXP, or growth rewards are added.

Equal numbers merge across types; the destination-side type wins. Six rune families:

- Fire: 60% sword hit, plus independent 30% burn stacks ticking on the next two valid swipes.
- Wood: 70% shield, plus independent 20% heal stacks on the next two valid swipes.
- Ice: 90% shield; every three merged pairs spend three cold to delay the enemy one swipe. At most one delay per swipe.
- Sky: 90% sword; every two pairs spend two charges to add one skill charge, at most one per swipe. Charges wait while the skill is ready.
- Earth: 110% shield, store 40% of created armor per stack; surviving an enemy strike releases all stored counter damage. Stance reduction applies, no criticals.
- Divine: 100% sword + 70% shield + 40% heal. Two divine tiles merge to awaken, or reaching 64 awakens; an awakened winning destination retains awakening. Awakening repeats that same effect twice, not another extra multiplier.

Periodic effects tick before this swipe's new stacks are created and before the enemy acts. Stack powers freeze at creation (including combo/echo), stance reduction happens on damage delivery. Aggregate fractional periodic/counter power is floored at delivery. Shield reset/root collisions/no-op rules remain. Current lane skills are temporary; `awakenRune`, `convertRune`, `consumeRuneStacks` and independently identified stacks provide future skill hooks.

## Reported board reset

Previously utility entry called `cleanFrom`, halving low tiles at every shop/rest/quiz; `enterBattle` halved again. Three consecutive utility rooms could erase almost the entire board. Utilities now preserve the exact board. The next combat clears low tiles once and removes roots, retaining HP and high/awakened tiles. Utility healing/rewards stay unchanged.

## Difficulty trial (not proven final balance)

- Stag: HP 300 → 1200; base attack 24 → 30 (heavy 45), still every three valid swipes and roots two tiles.
- Echo: ×2 → ×1.5, including newly created rune effects.
- Shadow: copy highest tile type at value capped at 16, rather than duplicating an arbitrarily large tile/awakening.
- Seed: 100% value 4 → 35% value 4, versus normal 10%.
- Other relics unchanged. Freeze/reflect checks now use actual enemy attack events, avoiding phantom thorn/VFX triggers when a freeze delays a countdown of one.

At sword base 5, a single 256 merge deals floor(64^0.8 × 5) = 139 before critical/combo. HP 300 fell to three such hits (fewer with echo/crit), whereas 1200 needs nine ordinary hits. High tiles remain useful; human full-run timing, fun and rarity strength require owner playtests. No bot/forced-flow result is presented as player balance evidence.

## Artwork

Built-in imagegen produced `public/2048/assets/egg-runes-concept-v1.png`: left to right fire, wood, ice, sky, earth, divine normal, divine awakened. Seven panels extracted to 256px WebP for the game; numbers are rendered in HTML. White/gold wing pose distinguishes awakening.

Prompt used: One landscape concept contact sheet on deep teal, exactly seven equally sized front-facing carved rune slabs; consistent magical crystal forest RPG style. Empty dark central/lower number areas, no generated numbers or words. Upper emblems: orange-red flame; wood trunk/green leaves; frost-white blue ice droplet; yellow lightning/purple-blue cloud; amber mountain/ram horns; ivory-gold crystal/folded eagle wings; same divine slab awakened with spread wings, crown and luminous frame. Painterly detailed game inventory art, clear phone-scale silhouettes, restrained glow, no characters/text/watermarks.

## Validation

Engine regression covers all six families, independent stacks/expiry/no-op, cold timing, charge caps, lethal/counter behavior, awakening/direction/root preservation and high-tile boss survival. Run regression covers echo/mirror/seed and freeze/thorn interaction. Browser fixtures cover shop → reload → rest → quiz → boss with full board retained until combat's single carry cleanup, awakened 256 preserved, artwork for six eggs, divine awakening/reload and 320×480/320×568/390×844 layout. Existing actual test accounts verify pet-only stats, questions, ownership checks and unchanged stats/learning counters. Flow fixtures force phases and are not balance playtests.

Next: owner tests new run and rune identities; then species skills; then full gameplay balance.
