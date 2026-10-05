/**
 * แกนกลางที่ใช้ร่วมกันทุกพัซเซิล
 * - สุ่มแบบกำหนดเมล็ดได้ (เมล็ดเดียวกัน ได้ผังเดียวกันเสมอ) เพื่อให้เซิร์ฟเวอร์สร้างผังซ้ำและตรวจคำตอบได้
 * - ไม่มี dependency ภายนอก ใช้ได้ทั้ง Node (Supabase edge/Next route) และเบราว์เซอร์
 */

export const PUZZLE_VERSION = 1;

export interface Rng {
  /** ค่าสุ่มช่วง [0,1) */
  next(): number;
  /** จำนวนเต็มช่วง [min,max] รวมปลายทั้งสอง */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
}

/** mulberry32: เล็ก เร็ว กระจายพอสำหรับเกม ไม่ใช่การเข้ารหัส */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[int(0, arr.length - 1)] as T;
  };
  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };
  return { next, int, pick, shuffle };
}

/** ผลตรวจคำตอบ: wrong คือรหัสส่วนที่ผิด ใช้ให้ UI ไฮไลต์ และใช้เลือกคำใบ้ขั้น 2 */
export interface ValidateResult {
  ok: boolean;
  wrong: string[];
  /** เหตุผลสั้น ๆ สำหรับ log ฝั่งเซิร์ฟเวอร์ ไม่ส่งให้เด็ก */
  reason?: string;
}

export type HintTier = 1 | 2 | 3;

/**
 * สัญญาของพัซเซิลทุกชนิด
 *  - generate: สร้างผังจากเมล็ด (เก็บเฉลยไว้ในตัวเอง ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น)
 *  - publicView: ส่วนที่ส่งให้เครื่องเด็กได้ ไม่มีเฉลย
 *  - validate: ตรวจคำตอบฝั่งเซิร์ฟเวอร์
 *  - hint: คำใบ้ 3 ขั้น (1 ทั่วไป 2 ชี้ส่วนที่ผิด 3 เผยหนึ่งตำแหน่งที่ถูก) ไม่เฉลยทั้งหมด
 *  - fingerprint: ลายนิ้วมือของผัง ใช้เลี่ยงผังซ้ำกับครั้งก่อน
 */
export interface PuzzleModule<Puzzle, Public, Answer, Hint> {
  readonly kind: string;
  generate(seed: number): Puzzle;
  publicView(p: Puzzle): Public;
  validate(p: Puzzle, ans: Answer): ValidateResult;
  hint(p: Puzzle, ans: Answer | null, tier: HintTier): Hint;
  fingerprint(p: Puzzle): string;
}

/** สร้างผังใหม่ที่ไม่ซ้ำลายนิ้วมือล่าสุดของเด็กคนนั้น (ลองเปลี่ยนเมล็ดสูงสุด 25 ครั้ง) */
export function generateNext<P, Pub, A, H>(
  mod: PuzzleModule<P, Pub, A, H>,
  baseSeed: number,
  lastFingerprint: string | null,
): { puzzle: P; seed: number } {
  for (let i = 0; i < 25; i++) {
    const seed = (baseSeed + Math.imul(i, 0x9e3779b1)) >>> 0;
    const puzzle = mod.generate(seed);
    if (lastFingerprint === null || mod.fingerprint(puzzle) !== lastFingerprint) {
      return { puzzle, seed };
    }
  }
  const seed = (baseSeed + 25) >>> 0;
  return { puzzle: mod.generate(seed), seed };
}

/** แฮชข้อความสั้น ๆ (FNV-1a) ไว้ทำลายนิ้วมือ ไม่ใช่เรื่องความปลอดภัย */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
