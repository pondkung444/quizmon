# Factory Office Production Assets v1

Status: **Production sprite set prepared**

## Asset boundary

Approved concept sheets remain under `doc/QuizMon_Question_Factory/assets/factory-office/`. Runtime-ready assets live under `public/factory-office/v1/` and must be reproducible from an approved visual reference plus deterministic preparation steps.

Characters, role props, work folders, status tokens, transfer paths and environment layers remain separate assets. A character sprite must not bake in a slot ID, status label, workflow arrow or animation duration.

The first clean production environment master is `public/factory-office/v1/environment/office-background-v1.png` (1628 x 966), with `office-background-v1.webp` as its optimized runtime export. It deliberately contains no characters, workflow arrows, status folders, labels or runtime state. The approved overview remains the composition reference; it is not used as the runtime background because its workers and states are baked into the image.

## Character sprite master

- source format: transparent PNG;
- master canvas: 1024 by 1024 pixels;
- runtime export: lossless transparent WebP at 512 by 512 pixels;
- horizontal anchor: canvas center;
- shared foot baseline: y = 944 on the master canvas;
- target character height: 860 pixels unless a role prop requires additional safe area;
- no floor shadow, backdrop, status token or UI text;
- filename: `<action>.png` for the master and `<action>.webp` for runtime;
- path: `public/factory-office/v1/characters/<role>/`.

Every action for one character must preserve face, skin tone, hairstyle, outfit silhouette, palette, proportion and baseline. Props that are intrinsic to an action may be included; reusable workflow state remains a separate layer.

## Runtime behavior

The Office UI selects one semantic action asset from persisted Factory state through the state-to-action adapter. Individual action files are preferred over one large sprite sheet for the v1 prototype so each role can be loaded independently and missing actions can fall back to `idle`.

Reduced-motion mode uses the first static frame of the selected semantic action. Animation timing remains UI-only.

## Prototype acceptance

The Question Author `idle` prototype must pass all of the following before the remaining actions are prepared:

1. the PNG and WebP contain a real alpha channel;
2. no generated checkerboard or pale matte remains;
3. the complete silhouette fits the shared canvas and baseline;
4. enclosed light areas such as eyes, notebook and shoes remain intact;
5. the character remains readable at 128 CSS pixels tall;
6. identity matches the approved Question Author references;
7. the runtime file loads without relying on the documentation asset path.

The deterministic preparation tool is `scripts/prepare-factory-office-sprite.py`.
It requires Python 3 and Pillow. Generated-image input is treated as source material; the tool writes normalized project assets and never modifies the source file.

## Prepared v1 inventory

The runtime inventory is declared in `public/factory-office/v1/manifest.json`. It contains 47 semantic character actions across all six roles, exported as 47 PNG masters and 47 WebP runtime assets.

| Role | Actions |
|---|---|
| Factory Manager | idle, receive_work, working, send_work, monitoring, error, success |
| Question Author | idle, receive_work, working, thinking, error, revision, send_work, success |
| Question QC | idle, receive_work, working, thinking, compare, success, revision, error |
| Image Builder | idle, receive_work, working, thinking, asset_ready, revision, send_work, success |
| Image QC | idle, receive_work, compare, working, mobile_preview, success, revision, error |
| Publisher | idle, receive_work, final_check, working, send_work, success, waiting, error |

Batch preparation crops the approved action-sheet grid, removes the connected pale backdrop and floor shadow, retains the primary character/held-prop component, discards detached status tokens and neighboring-cell debris, then normalizes every output to the shared canvas and baseline. Question Author `idle` retains the separately approved high-resolution prototype.
