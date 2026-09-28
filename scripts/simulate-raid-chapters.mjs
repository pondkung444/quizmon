import {
  createChapterBattle,
  resolveTurn,
} from "../src/lib/raid/cards/engineV4.ts";
import { BOSSES, QUESTION_LIMITS } from "../src/lib/raid/cards/engineV3.ts";
import { writeFileSync, mkdirSync } from "node:fs";
const profiles = {
  starter: { hp: 40, atk: 40, def: 40, spd: 40, foc: 40 },
  attack: { hp: 65, atk: 95, def: 55, spd: 75, foc: 70 },
  defense: { hp: 90, atk: 65, def: 95, spd: 55, foc: 70 },
};
const rows = [];
for (const boss of Object.keys(BOSSES))
  for (const [profile, stats] of Object.entries(profiles))
    for (const accuracy of [0.6, 0.8, 1])
      for (const policy of ["strike", "tactical"]) {
        let wins = 0,
          totalTurns = 0;
        for (let seed = 1; seed <= 300; seed++) {
          let s = seed;
          const rng = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 2 ** 32;
          };
          let b = createChapterBattle(boss, stats, rng);
          while (!b.outcome) {
            const pool = ["counter"];
            if (b.turn < QUESTION_LIMITS[boss]) pool.push("focus");
            if (b.intent === "brace") pool.push("pierce");
            if (["charge", "thunder"].includes(b.intent))
              pool.push("interrupt");
            const hand = ["strike", "mend"];
            while (hand.length < 4) {
              const i = Math.floor(rng() * pool.length);
              hand.push(pool.length ? pool.splice(i, 1)[0] : "pierce");
            }
            let skill = "strike";
            if (policy === "tactical") {
              const expected = hand.map((card) => {
                const next = resolveTurn(b, card, () => 0.4, true);
                const l = next.log.at(-1);
                return {
                  card,
                  value:
                    l.dealt +
                    (l.healed - l.taken) * 0.7 +
                    ((next.momentum * BOSSES[boss].hp) /
                      QUESTION_LIMITS[boss]) *
                      accuracy,
                };
              });
              skill = expected.sort((a, c) => c.value - a.value)[0].card;
            }
            b = resolveTurn(b, skill, rng, rng() < accuracy);
            totalTurns++;
          }
          if (b.outcome === "win") wins++;
        }
        rows.push({
          boss,
          profile,
          accuracy,
          policy,
          winPct: Math.round(wins / 3),
          meanTurns: Math.round((totalTurns / 300) * 10) / 10,
        });
      }
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/raid-chapter-balance.json",
  JSON.stringify(rows, null, 2),
);
console.table(
  rows.filter((r) => r.profile === "starter" || r.accuracy === 0.8),
);
