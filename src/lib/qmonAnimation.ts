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

// ตัวควบคุมการเล่น (state machine ล้วน ไม่มี DOM — ทดสอบด้วย node ได้)
// main = ท่าที่วนตลอด (Idle) · other = ท่าที่เล่น 1 รอบแล้วกลับ main (Happy)
// - requestOther() ระหว่าง other กำลังเล่น/รอเล่นอยู่ = false (แตะซ้ำไม่เริ่มใหม่)
// - other จบ -> กลับ main ที่ elapsed 0 (เฟรม 0 = ท่าเดียวกับรูปต้นฉบับ)
export type SpriteFrameRef = { clip: "main" | "other"; frame: number };
export type SpritePlayer = {
  tick(dtMs: number): SpriteFrameRef;
  requestOther(): boolean;
  readonly mainElapsed: number; // เวลาที่ main เล่นไปแล้ว (เก็บข้ามการ remount)
};

export function createSpritePlayer(main: SpriteClip, other: SpriteClip, startElapsed = 0): SpritePlayer {
  let mode: "main" | "other" = "main";
  let mainElapsed = startElapsed;
  let otherElapsed = 0;
  let pending = false;
  return {
    tick(dtMs) {
      if (mode === "main" && pending) {
        pending = false;
        mode = "other";
        otherElapsed = 0;
      } else if (mode === "main") {
        mainElapsed += dtMs;
      } else {
        otherElapsed += dtMs;
      }
      if (mode === "other") {
        const step = animationFrame(other, otherElapsed, false);
        if (!step.done) return { clip: "other", frame: step.frame };
        mode = "main";
        mainElapsed = 0;
      }
      return { clip: "main", frame: animationFrame(main, mainElapsed, true).frame };
    },
    requestOther() {
      if (mode === "other" || pending) return false;
      pending = true;
      return true;
    },
    get mainElapsed() {
      return mainElapsed;
    },
  };
}
