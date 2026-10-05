# Phase 5: three-act artwork

Completed 2026-10-05. Cave and sky now have dedicated scenes and enemy artwork. All 15 enemy designs face left. The final eagle uses revision 3: a forward launch with distinct near wing, far wing and tail, and a larger battle display.

## Art direction and roster

Painterly dimensional fantasy, faceted crystals, antique gold and restrained glow. Existing forest creatures and rune artwork establish the style.

| Enemy | Display name | Artwork |
| --- | --- | --- |
| mushroom | เห็ดผลึก | Existing crystal-mushroom-v1.png |
| beetle | ด้วงแก้ว | Existing crystal-beetle-v1.png |
| slow_striker | โกเล็มพฤกษ์ | Existing crystal-golem.png |
| glass_striker | ตั๊กแตนแก้ว | Existing crystal-swift-v1.webp |
| stag | กวางเทพพิทักษ์ | Existing divine-stag-guardian-v3.png |
| cave_light | ลูกหินผลึก | New cave-light-v2.webp |
| cave_guard | เต่าผลึก | Existing crystal-heavy-v1.webp |
| cave_heavy | โกเล็มถ้ำ | New cave-heavy.webp |
| cave_healer | ค้างคาวอัญมณี | New cave-healer-v2.webp |
| cave_guardian | หมีภูผาผลึก | New cave-boss.webp |
| sky_light | นกเมฆา | New sky-light-v2.webp |
| sky_haste | เหยี่ยววายุ | New sky-haste.webp |
| sky_heavy | แร้งผาหิน | New sky-heavy-v2.webp |
| sky_poison | ผีเสื้อหมอกพิษ | New sky-poison-v2.webp |
| sky_guardian | อินทรีเจ้านภา | New sky-boss-v3.webp |

Intro encounters reuse the corresponding first enemy. Forest scenery, all existing rune looks and 40 existing relic icons are reused. Twenty regional relic icons are added and appear in choices, inventory and details.

## Deliverables

- `public/2048/assets/acts-v1/`: nine enemy images, one crystal obstacle, two scenes and three SVG overlays for roots, cracks and crystal fragments.
- `public/2048/assets/icons/relic-v2/`: twenty transparent relic icons.
- `act-art.js` and `act-art.css`: scene selection, enemy labels and presentation effects for poison, crystal damage, crack rescue and guardian phase transition. Reduced motion is supported.
- Selected raster assets total 2,279,030 bytes. Sprite and relic transparency is checked during preparation.

Images were generated and edited with the built-in imagegen tool. Exact initial prompts, correction prompts, selected source paths and converted asset metadata are recorded in `output/acts-phase5/`. Original generated PNGs remain in the Codex generated-images directory; production WebP files are committed in the asset directories above. Contact sheets include all enemies for the left-facing audit.

Enemy IDs, stats, random queues, checkpoints and combat rules are unchanged. Merge rescue locations are captured separately from gameplay state so the visual effect also covers a cracked losing source.

## Verification

- 58 automated tests pass.
- Full 30-room journeys pass at 320, 390 and 430 pixels, including all three bosses; client and server state match.
- Art checks pass for 18 enemy mappings, 20 relic details and 32 decoded assets at all three widths plus reduced motion. No browser errors or failed asset requests.
- Regional hazard checks cover cave crystals, sky cracks and poison, forest roots and boss phase changes, including offline resume and lost acknowledgement recovery.
- Endless regression passes at all three widths with offline resume, retry and matching server state.
- Production webpack build and whitespace checks pass.

Browser evidence is saved under `output/art-phase5/`, `output/acts-phase5/`, `output/regional-phase5/` and `output/endless-phase5-regression/`. Art fixtures verify appearance and effect cleanup; they do not establish gameplay balance. Balance and trophies remain subsequent phase work.
