"use client";

import { useEffect, useRef, useState } from "react";
import { animationFrame, frameRect, validateClip, type SpriteClip } from "@/lib/qmonAnimation";

// โหมดทดลอง Qmon Animation v1 — แสดง sprite บน canvas (ไม่มี <button> เพราะอยู่ในปุ่ม avatar ของ PetCard แล้ว)
// ลบได้เมื่อมี renderer จริง
// cache ระดับ module: wrapper key={tapPulse} ใน PetCard remount ลูกทุกครั้งที่แตะ ห้าม decode sheet ใหม่ทุกแตะ
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadSheet(clip: SpriteClip): Promise<HTMLImageElement> {
  const cached = imageCache.get(clip.src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const done = () => {
        if (img.naturalWidth !== clip.columns * clip.frameSize || img.naturalHeight !== clip.rows * clip.frameSize) {
          reject(new Error(`ขนาด sprite sheet ไม่ตรง grid: ${clip.src} ${img.naturalWidth}x${img.naturalHeight}`));
        } else {
          resolve(img);
        }
      };
      // decode ล่วงหน้าเพื่อไม่ให้กระตุกตอนวาดเฟรมแรก
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = () => reject(new Error(`โหลด sprite ไม่สำเร็จ: ${clip.src}`));
    img.src = clip.src;
  });
  imageCache.set(clip.src, promise);
  promise.catch(() => imageCache.delete(clip.src));
  return promise;
}

// clip = Idle (วนตลอด) · playClip = ท่าที่เล่นรอบเดียวตอนเริ่ม แล้วกลับ Idle (PetCard remount ตัวนี้ทุกครั้งที่แตะ
// จึงได้เล่นจากเฟรม 0 ทุกครั้ง) · blend: crossfade เฟรมปัจจุบัน→ถัดไปด้วย globalAlpha (ต้องวาดทุก rAF)
export default function QmonIdleSprite({
  clip,
  size,
  blend = false,
  playClip = null,
  preload,
}: {
  clip: SpriteClip;
  size: number;
  blend?: boolean;
  playClip?: SpriteClip | null;
  preload?: SpriteClip[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let cleanup = () => {};

    const run = async () => {
      validateClip(clip);
      if (playClip) validateClip(playClip);
      const idleImg = await loadSheet(clip);
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) throw new Error("สร้าง canvas ไม่ได้");

      const draw = (c: SpriteClip, img: HTMLImageElement, frame: number, next?: number, mix = 0) => {
        const r = frameRect(c, frame);
        ctx.clearRect(0, 0, c.frameSize, c.frameSize);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, r.x, r.y, r.size, r.size, 0, 0, c.frameSize, c.frameSize);
        if (next !== undefined && mix > 0) {
          const n = frameRect(c, next);
          ctx.globalAlpha = mix;
          ctx.drawImage(img, n.x, n.y, n.size, n.size, 0, 0, c.frameSize, c.frameSize);
          ctx.globalAlpha = 1;
        }
      };

      draw(clip, idleImg, 0); // ระหว่างรอ sheet ของท่าที่แตะ ให้เห็น Idle ไปก่อน ไม่ให้จอว่าง
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // เฟรม 0 นิ่ง

      const playImg = playClip ? await loadSheet(playClip) : null;
      if (cancelled) return;

      let seg: { clip: SpriteClip; img: HTMLImageElement; loop: boolean } =
        playClip && playImg ? { clip: playClip, img: playImg, loop: false } : { clip, img: idleImg, loop: true };
      let elapsed = 0;
      let last: number | null = null;
      let shown = "";
      const tick = (now: number) => {
        if (last !== null && !document.hidden) elapsed += now - last;
        last = now;
        const step = animationFrame(seg.clip, elapsed, seg.loop);
        let frame = step.frame;
        if (step.done) {
          seg = { clip, img: idleImg, loop: true };
          elapsed = 0;
          frame = 0;
          shown = "";
        }
        if (blend) {
          const nextFrame = seg.loop ? (frame + 1) % seg.clip.frames : frame + 1 < seg.clip.frames ? frame + 1 : undefined;
          draw(seg.clip, seg.img, frame, nextFrame, (elapsed * seg.clip.fps / 1000) % 1);
        } else {
          const key = `${seg.clip.src}:${frame}`;
          if (key !== shown) {
            shown = key;
            draw(seg.clip, seg.img, frame);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      const onVisibility = () => {
        last = null; // reset timestamp กันเวลากระโดดตอนกลับมาที่แท็บ
      };
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(tick);
      cleanup = () => document.removeEventListener("visibilitychange", onVisibility);

      // โหลดท่าอื่นล่วงหน้า (โหมดทดลองเท่านั้น) ให้แตะครั้งแรกไม่หน่วง — พลาดก็ไม่เป็นไร
      if (!playClip && preload) for (const other of preload) loadSheet(other).catch(() => {});
    };

    run().catch((err) => {
      console.error(err);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [clip, playClip, blend, preload]);

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="relative flex items-center justify-center rounded-xl bg-track text-sm text-text3"
      >
        โหลด sprite ไม่สำเร็จ
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={clip.frameSize}
      height={clip.frameSize}
      style={{ width: size, height: size }}
      role="img"
      aria-label="ภาพ Qmon"
      className="relative"
    />
  );
}
