"use client";

import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { createSpritePlayer, frameRect, sheetSize, validateClip, type SpriteClip, type SpriteFrameRef, type SpriteGeometry } from "@/lib/qmonAnimation";
import type { SpriteSet } from "@/lib/qmonSprites";

// sprite Qmon บน canvas (ไม่มี <button> เพราะอยู่ในปุ่ม avatar ของ PetCard แล้ว)
// วางแบบ absolute ทับรูปนิ่งตาม staticFit จึงล้นกรอบรูปนิ่งได้ (ปีก/เอฟเฟกต์) โดยไม่ดันเลย์เอาต์
// ผู้เรียกต้องห่อคู่รูปนิ่ง + component นี้ด้วย <div className="relative" style={{ width: size, height: size }}>
// (ไม่พึ่ง filter ของ .evo-glow เป็น containing block) เพื่อให้มุมซ้ายบนของ wrapper = มุมของรูปนิ่ง

export type QmonSpriteHandle = {
  // เล่น Happy 1 รอบแล้วกลับ Idle · คืน false ถ้า Happy กำลังเล่นอยู่ (แตะซ้ำไม่เริ่มใหม่)/sheet ยังโหลดไม่เสร็จ/ปิดแอนิเมชัน (เฟส 4 ผูก trigger)
  playHappy: () => boolean;
};

// cache ระดับ module: wrapper key={tapPulse} ใน PetCard remount ลูกทุกครั้งที่แตะ ห้าม decode sheet ใหม่
const pending = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>(); // decode เสร็จแล้ว — remount วาดเฟรมแรกแบบ sync ได้ ไม่มีจังหวะว่าง
const idlePhase = new Map<string, number>(); // เวลา Idle ที่เล่นไปแล้วต่อ sheet — remount แล้วเล่นต่อ ไม่กลับเฟรม 0

function loadSheet(geo: SpriteGeometry, clip: SpriteClip): Promise<HTMLImageElement> {
  const cached = pending.get(clip.src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const done = () => {
        const size = sheetSize(geo);
        if (img.naturalWidth !== size.width || img.naturalHeight !== size.height) {
          reject(new Error(`ขนาด sprite sheet ไม่ตรง manifest: ${clip.src} ${img.naturalWidth}x${img.naturalHeight}`));
        } else {
          loaded.set(clip.src, img);
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
  pending.set(clip.src, promise);
  promise.catch(() => pending.delete(clip.src));
  return promise;
}

export default function QmonSprite({
  set,
  size,
  visible,
  onReady,
  onError,
  loopClip = "idle",
  ref,
}: {
  set: SpriteSet;
  size: number; // W = ด้านของกรอบรูปนิ่ง (px)
  visible: boolean; // fade เข้า/ออก (~200ms) คุมโดยผู้เรียก — รูปนิ่งควร fade ออกพร้อมกัน
  onReady?: () => void; // วาดเฟรมแรกลง canvas แล้ว
  onError?: () => void; // โหลดไม่สำเร็จ (ผู้เรียกใช้รูปนิ่งต่อ)
  loopClip?: "idle" | "happy"; // ตัวช่วยตรวจบน preview: วนท่านี้ตลอด
  ref?: Ref<QmonSpriteHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestHappyRef = useRef<() => boolean>(() => false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  useImperativeHandle(ref, () => ({ playHappy: () => requestHappyRef.current() }), []);

  const { geometry: geo, idle, happy, staticFit, key } = set;
  const main = loopClip === "happy" ? happy : idle;
  const other = loopClip === "happy" ? idle : happy;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let cancelled = false;
    let raf = 0;
    let idleTimer: number | undefined;
    let cleanup = () => {};
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // เฟรม 0 นิ่ง

    // backing store ตามขนาดที่แสดงจริง (x dpr) แทนที่จะเป็น 588px เต็ม — ย่อภาพครั้งเดียวตอนวาด ได้ภาพคมกว่า CSS scale
    const px = Math.min(geo.cell, Math.ceil(size * staticFit.scale * (window.devicePixelRatio || 1)));
    canvas.width = px;
    canvas.height = px;
    ctx.imageSmoothingQuality = "high";
    const draw = (img: HTMLImageElement, frame: number) => {
      const r = frameRect(geo, frame);
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(img, r.x, r.y, r.size, r.size, 0, 0, px, px);
    };

    const start = (mainImg: HTMLImageElement) => {
      validateClip(geo, main);
      const player = createSpritePlayer(main, other, loopClip === "idle" ? idlePhase.get(main.src) ?? 0 : 0);
      let shown = "";
      const paint = (r: SpriteFrameRef) => {
        const k = `${r.clip}:${r.frame}`;
        if (k === shown) return; // วาดใหม่เฉพาะตอนเฟรมเปลี่ยน
        shown = k;
        draw(r.clip === "main" ? mainImg : loaded.get(other.src)!, r.frame);
      };
      paint(player.tick(0));
      onReadyRef.current?.();
      if (reduced) return;

      // คืน false ถ้า Happy กำลังเล่น/รอเล่นอยู่ (แตะซ้ำไม่เริ่มใหม่) หรือ sheet Happy ยังโหลดไม่เสร็จ
      requestHappyRef.current = () => loopClip === "idle" && !!loaded.get(other.src) && player.requestOther();
      let last: number | null = null;
      const tick = (now: number) => {
        const dt = last !== null && !document.hidden ? now - last : 0;
        last = now;
        paint(player.tick(dt));
        if (loopClip === "idle") idlePhase.set(main.src, player.mainElapsed);
        raf = requestAnimationFrame(tick);
      };
      const onVisibility = () => {
        last = null; // reset timestamp กันเวลากระโดดตอนกลับมาที่แท็บ
      };
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(tick);
      cleanup = () => document.removeEventListener("visibilitychange", onVisibility);
    };

    const preloadOther = () => {
      // โหลดอีกท่าหลัง main เล่นแล้ว (ไม่แย่ง bandwidth ตอนโหลดแรก) พลาดก็ไม่เป็นไร
      const go = () => loadSheet(geo, other).catch(() => {});
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(go, { timeout: 3000 });
        cleanup = ((prev) => () => { prev(); window.cancelIdleCallback(id); })(cleanup);
      } else {
        idleTimer = window.setTimeout(go, 1500);
      }
    };

    const ready = loaded.get(main.src);
    if (ready) {
      start(ready); // remount (แตะแล้ว key เปลี่ยน): วาดแบบ sync ก่อน paint ไม่กระพริบ
      if (!cancelled && !reduced) preloadOther();
    } else {
      loadSheet(geo, main).then(
        (img) => {
          if (cancelled) return;
          start(img);
          if (!reduced) preloadOther(); // reduced-motion ไม่เล่น Happy จึงไม่ต้องโหลด
        },
        (err) => {
          console.error(err);
          if (!cancelled) onErrorRef.current?.();
        },
      );
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      requestHappyRef.current = () => false;
      cleanup();
    };
  }, [key, geo, main, other, loopClip, size, staticFit.scale]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute transition-opacity duration-200"
      style={{
        left: staticFit.dx * size,
        top: staticFit.dy * size,
        width: staticFit.scale * size,
        height: staticFit.scale * size,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}
