// Qmon Animation v1 — ชนิดข้อมูลและคณิตศาสตร์ของ sprite sheet (ไม่มี DOM/React)
// sheet มาจาก scripts/sprite/prepare_qmon_sprites.py: 4x4 ช่อง ช่องละ cell px เว้นช่องว่างโปร่งใส gutter px

export type SpriteGeometry = { cell: number; gutter: number; columns: number; rows: number };
export type SpriteClip = { src: string; frames: number; fps: number; pingPong: boolean };

export function sheetSize(geo: SpriteGeometry) {
  return {
    width: geo.columns * geo.cell + (geo.columns - 1) * geo.gutter,
    height: geo.rows * geo.cell + (geo.rows - 1) * geo.gutter,
  };
}

export function validateClip(geo: SpriteGeometry, clip: SpriteClip) {
  const ints = [geo.cell, geo.columns, geo.rows, clip.frames];
  if (!ints.every((n) => Number.isInteger(n) && n > 0) || !Number.isInteger(geo.gutter) || geo.gutter < 0
    || !Number.isFinite(clip.fps) || clip.fps <= 0 || clip.frames > geo.columns * geo.rows) {
    throw new Error("Invalid sprite sheet configuration");
  }
}

// loop=true วนไม่จบ · loop=false เล่นครบ 1 รอบแล้ว done
// pingPong: 0→N-1→0 โดยไม่ซ้ำเฟรมปลาย (1 รอบ = 2*(N-1) สเต็ป)
export function animationFrame(clip: SpriteClip, elapsedMs: number, loop: boolean) {
  const step = Math.floor(Math.max(0, elapsedMs) * clip.fps / 1000);
  if (clip.pingPong && clip.frames > 1) {
    const period = 2 * (clip.frames - 1);
    const p = loop ? step % period : Math.min(step, period - 1);
    return { frame: p < clip.frames ? p : period - p, done: !loop && step >= period };
  }
  return { frame: loop ? step % clip.frames : Math.min(step, clip.frames - 1), done: !loop && step >= clip.frames };
}

// x = col*(cell+gutter) — ช่องว่าง gutter อยู่ระหว่างช่อง ไม่ใช่รอบนอก
export function frameRect(geo: SpriteGeometry, frame: number) {
  const col = frame % geo.columns;
  const row = Math.floor(frame / geo.columns);
  return { x: col * (geo.cell + geo.gutter), y: row * (geo.cell + geo.gutter), size: geo.cell };
}

// จำนวนสเต็ปต่อ 1 รอบของท่าที่วน (pingPong = 2*(N-1))
export function loopPeriodSteps(clip: SpriteClip) {
  return clip.pingPong && clip.frames > 1 ? 2 * (clip.frames - 1) : clip.frames;
}

// ตัวควบคุมการเล่น (state machine ล้วน ไม่มี DOM — ทดสอบด้วย node ได้)
// main = ท่าที่วนตลอด (Idle) · other = ท่าที่เล่น 1 รอบแล้วกลับ main (Happy)
// - requestOther() ระหว่าง other กำลังเล่น/รอเล่นอยู่ = false (แตะซ้ำไม่เริ่มใหม่)
//   ยกเว้นคำขอแบบทันทีที่แทรกระหว่างรอ atLoopEnd -> ยกระดับเป็นเริ่มทันที (true)
// - atLoopEnd: รอ main ครบรอบ (ข้ามจุด wrap) แล้วค่อยเริ่ม other เฟรม 0 · คำขอที่มาจาก onMainLoop
//   (หลัง wrap แล้ว) จึงรอรอบถัดไป ไม่เริ่มทันที
// - other จบ -> กลับ main ที่ elapsed 0 (เฟรม 0 = ท่าเดียวกับรูปต้นฉบับ)
export type SpriteFrameRef = { clip: "main" | "other"; frame: number };
export type SpritePlayerEvents = {
  onMainLoop?: () => void; // main ครบรอบ 1 รอบ (เรียกทุกครั้งที่ข้ามจุด wrap)
  onOtherEnd?: () => void; // other เล่นจบและกลับ main แล้ว
};
export type SpritePlayer = {
  tick(dtMs: number): SpriteFrameRef;
  requestOther(opts?: { atLoopEnd?: boolean }): boolean;
  readonly mainElapsed: number; // เวลาที่ main เล่นไปแล้ว (เก็บข้ามการ remount)
};

export function createSpritePlayer(
  main: SpriteClip,
  other: SpriteClip,
  startElapsed = 0,
  events: SpritePlayerEvents = {},
): SpritePlayer {
  const period = loopPeriodSteps(main);
  const loopIndex = (ms: number) => Math.floor((Math.max(0, ms) * main.fps) / 1000 / period);
  let mode: "main" | "other" = "main";
  let mainElapsed = startElapsed;
  let lastLoop = loopIndex(startElapsed);
  let otherElapsed = 0;
  let pending: "now" | "loopEnd" | null = null;
  return {
    tick(dtMs) {
      if (mode === "main" && pending === "now") {
        pending = null;
        mode = "other";
        otherElapsed = 0;
      } else if (mode === "main") {
        mainElapsed += dtMs;
        const idx = loopIndex(mainElapsed);
        if (idx > lastLoop) {
          lastLoop = idx;
          const startOther = pending === "loopEnd"; // เช็คก่อน callback: คำขอที่มาจาก callback ต้องรอรอบหน้า
          events.onMainLoop?.();
          if (startOther) {
            pending = null;
            mode = "other";
            otherElapsed = 0;
          }
        }
      } else {
        otherElapsed += dtMs;
      }
      if (mode === "other") {
        const step = animationFrame(other, otherElapsed, false);
        if (!step.done) return { clip: "other", frame: step.frame };
        mode = "main";
        mainElapsed = 0;
        lastLoop = 0;
        events.onOtherEnd?.();
      }
      return { clip: "main", frame: animationFrame(main, mainElapsed, true).frame };
    },
    requestOther(opts) {
      if (mode === "other") return false;
      const kind = opts?.atLoopEnd ? "loopEnd" : "now";
      if (pending === null || (pending === "loopEnd" && kind === "now")) {
        pending = kind;
        return true;
      }
      return false;
    },
    get mainElapsed() {
      return mainElapsed;
    },
  };
}
