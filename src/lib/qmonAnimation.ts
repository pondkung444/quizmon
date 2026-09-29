export type AnimationState = "idle" | "happy" | "react";
export type SpriteClip = { src: string; columns: number; rows: number; frames: number; fps: number; frameSize: number };
export type AnimationSet = Record<AnimationState, SpriteClip>;

// React uses the eating stress-test asset until a dedicated React is exported.
export const dragonPrototype: AnimationSet = {
  idle: { src: "/qmon-animation-test/idle.webp", columns: 4, rows: 3, frames: 12, fps: 6, frameSize: 512 },
  happy: { src: "/qmon-animation-test/happy.webp", columns: 4, rows: 4, frames: 16, fps: 8, frameSize: 512 },
  react: { src: "/qmon-animation-test/react-snack.webp", columns: 4, rows: 4, frames: 16, fps: 8, frameSize: 512 },
};

export function validateClip(clip: SpriteClip) {
  if (![clip.columns, clip.rows, clip.frames, clip.frameSize].every(n => Number.isInteger(n) && n > 0)
    || !Number.isFinite(clip.fps) || clip.fps <= 0 || clip.frames > clip.columns * clip.rows) {
    throw new Error("Invalid sprite sheet configuration");
  }
}

export function animationFrame(clip: SpriteClip, elapsedMs: number, loop: boolean) {
  const step = Math.floor(Math.max(0, elapsedMs) * clip.fps / 1000);
  return { frame: loop ? step % clip.frames : Math.min(step, clip.frames - 1), done: !loop && step >= clip.frames };
}

export function frameRect(clip: SpriteClip, frame: number) {
  return { x: frame % clip.columns * clip.frameSize, y: Math.floor(frame / clip.columns) * clip.frameSize, size: clip.frameSize };
}
