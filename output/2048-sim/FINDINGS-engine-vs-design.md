# Engine vs design — observations (reported only, nothing changed)

Engine: quizmon `main` @ `2fc0896`. Design source of truth: Notion “สกิล Auto Stage 4 ครบ 36 ร่าง · ฉบับล็อก 1 ต.ค. 2026”.
Probes were run on a scratch copy; the repo's 5 forest2048 tests pass (5/5) on the same files.

## Answers to the four pre-implementation questions

| question | what the code does |
|---|---|
| เทพพฤกษา "ออกผล 1 ครั้ง" | = one ordinary god-rune merge event: 1 round if not awake, 2 if awake. Not a special override. Mark converts the result to a god tile (`t='x'`) first, so only the god effect fires (original type does not). Probe: 8+8→16 non-awake ⇒ attack 15 + armor 16, once. |
| Order when a rune beside a mark merges in the same swipe | Fixed pipeline (not loop-order dependent): slide/merge → skill periodic ticks → mark conversion/number override → ordinary rune effects → supplementary skill effects → garden neighbour doubling → status aging → finish check → spawn → Auto → enemy attack → counters/rebuild → roots → jam recovery. Garden doubling runs after every pair resolved. |
| Rounding / caps / stacking | Ordinary rune output: `floor` per merge per type. Skill effects: `floor` per effect, raw power (no combo/crit/Echo). Rune buffs scale the base *before* rounding and only new periodic/counter stacks. Enemy-damage reduction: `floor(power*(1-x))`. Skill number doubling saturates at 2^30. Ties on “lowest number” use row-major order. |
| Board full / no target | Full 16 marks: skip placement only, keep other effects, spend charge. No target: do what exists, spend charge, no refund/deferral. |

## Points where the engine differs from, or is ambiguous against, the design text

1. **Beetle stance rounds per hit for skill damage.** Ordinary rune damage in a swipe is summed, then `ceil(sum/2)`. Skill damage is `ceil(n/2)` **per `autoHit` call**. Probe: two 1-damage skill hits ⇒ 2 total (aggregate would be 1). Design says only “ลดดาเมจดาบและสกิล 50% ปัดขึ้น”. Favours multi-hit skills (follow-up, burn, storm) against the beetle.
2. **“Lowest-number N tiles” skills hit the freshly spawned tile.** Spawn happens *before* Auto, and a fresh 2/4 is almost always among the lowest. Probe: 400/400 casts of เพลิงยกระดับ (egg3 idx 4) doubled the new spawn (probed on that skill only). Same selection code (`autoTargets`) is used by อัสนีแปรรูน (egg5 idx 4, non-god tiles), ฌานยกระดับศิลา (egg6 idx 5, god tiles — spawn qualifies only if it spawned as the egg rune) and พฤกษ์แปรทิพย์ (egg3 idx 2, non-god tiles). Design says only “เลขต่ำสุด”.
3. **Garden doubling includes neighbours that merged in the same swipe.** Probe: a 4+4→8 beside the mark became 16 in the same swipe. Design item 7 does not say whether just-merged neighbours count.
4. **Reduction is rounded down** (`floor`) while stance/heavy hits are rounded up (`ceil`); both are existing-rule consistent but worth knowing when tuning small enemy damage (mushroom 12).
5. **Roots + jam recovery:** `recover()` clears the lowest half of tiles regardless of root state (rooted tiles can be cleared). Pre-existing rule, noted because roots only matter for the stag.

## Things verified as matching the design
Charge persists across rooms and fires after the first valid swipe of the next battle room · buffs/marks cleared at room end · no-op swipe: no charge/age/spawn · Blessing totals 3 rounds (probe: attack 45, armor 48) · rune buffs do not change old stacks · mirror still fires after Auto · supplementary effects ignore combo/crit/Echo.
