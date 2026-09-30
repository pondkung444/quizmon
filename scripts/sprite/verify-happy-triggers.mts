// รัน: node --experimental-strip-types scripts/sprite/verify-happy-triggers.mts
// เช็ค logic trigger Happy: key กลับจาก quiz (เขียน/อ่าน/หมดอายุ/ลบ) และเงื่อนไขการสุ่ม
import {
  DEFAULT_RANDOM_TUNING,
  FAST_RANDOM_TUNING,
  QUIZ_HAPPY_KEY,
  QUIZ_HAPPY_TTL_MS,
  clearQuizHappy,
  markQuizHappy,
  readQuizHappy,
  shouldPlayRandomHappy,
} from "../../src/lib/qmonHappyTriggers.ts";
let ok = true;
const check = (name: string, cond: boolean, extra = "") => {
  console.log((cond ? "PASS" : "FAIL") + " " + name + " " + extra);
  if (!cond) ok = false;
};
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const T = 1_000_000;
const s = mem();
check("no key -> none", readQuizHappy(s, T) === "none");
markQuizHappy(s, T);
check("mark writes key", s.m.get(QUIZ_HAPPY_KEY) === String(T));
check("fresh within TTL", readQuizHappy(s, T + QUIZ_HAPPY_TTL_MS) === "fresh");
check("stale after TTL", readQuizHappy(s, T + QUIZ_HAPPY_TTL_MS + 1) === "stale");
check("garbage value -> stale", (s.setItem(QUIZ_HAPPY_KEY, "abc"), readQuizHappy(s, T) === "stale"));
check("future timestamp -> stale", (s.setItem(QUIZ_HAPPY_KEY, String(T + 10 * 60_000)), readQuizHappy(s, T) === "stale"));
clearQuizHappy(s);
check("clear removes key", readQuizHappy(s, T) === "none");
const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
check("storage that throws is swallowed", (markQuizHappy(broken, T), clearQuizHappy(broken), readQuizHappy(broken, T) === "none"));
check("null storage is safe", (markQuizHappy(null, T), clearQuizHappy(null), readQuizHappy(null, T) === "none"));

const base = { now: 100_000, mountedAt: 0, lastHappyEndAt: null as number | null, hidden: false, queued: false };
const D = DEFAULT_RANDOM_TUNING;
check("random: before start delay -> no", !shouldPlayRandomHappy({ ...base, now: 19_999 }, D, 0));
check("random: after delay + roll under chance -> yes", shouldPlayRandomHappy({ ...base, now: 20_000 }, D, 0.14));
check("random: roll over chance -> no", !shouldPlayRandomHappy(base, D, 0.15));
check("random: within cooldown -> no", !shouldPlayRandomHappy({ ...base, lastHappyEndAt: 100_000 - 44_999 }, D, 0));
check("random: cooldown elapsed -> yes", shouldPlayRandomHappy({ ...base, lastHappyEndAt: 100_000 - 45_000 }, D, 0));
check("random: hidden tab -> no", !shouldPlayRandomHappy({ ...base, hidden: true }, D, 0));
check("random: Happy already queued -> no", !shouldPlayRandomHappy({ ...base, queued: true }, D, 0));
check("random fast: 2s delay, chance 1, 6s cooldown", shouldPlayRandomHappy({ ...base, now: 2_000 }, FAST_RANDOM_TUNING, 0.999) && !shouldPlayRandomHappy({ ...base, now: 1_999 }, FAST_RANDOM_TUNING, 0) && !shouldPlayRandomHappy({ ...base, now: 10_000, lastHappyEndAt: 5_000 }, FAST_RANDOM_TUNING, 0));
console.log(ok ? "ALL PASS" : "SOME FAIL");
process.exit(ok ? 0 : 1);
