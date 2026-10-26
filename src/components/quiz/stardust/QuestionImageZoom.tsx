"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { STARDUST_TEXT } from "@/lib/stardust";

const T = STARDUST_TEXT.image;

// รูปโจทย์แบบย่อ (สูงไม่เกิน 30svh / จอเตี้ย 22svh ดู .sd-qimg ใน globals.css) + ป้าย "ขยาย" → เต็มจอ ซูมนิ้วได้
// เปิดเต็มจอ = pushState 1 รายการ · ปุ่ม Back ของ Android (popstate) ปิดรูปแทนการออกจากรอบ
// ปิดด้วยปุ่ม/Escape = history.back() เพื่อเก็บรายการที่ push ไว้คืน · คืน focus ไปที่รูปย่อ
// flow โหลดรูป/โหลดไม่สำเร็จ/โหลดอีกครั้ง เหมือน QuizQuestionImage เดิม
export default function QuestionImageZoom({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pushedRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // รูปที่โหลดเสร็จก่อน hydrate (SSR / cache) จะไม่ยิง onLoad ให้ React — เช็คสถานะจริงตอน mount/ลองใหม่
  useEffect(() => {
    const img = imgRef.current;
    if (!img?.complete) return;
    const t = setTimeout(() => (img.naturalWidth > 0 ? setLoaded(true) : setFailed(true)), 0);
    return () => clearTimeout(t);
  }, [attempt]);

  const close = useCallback(() => {
    if (pushedRef.current) {
      // popstate จะเรียก setOpen(false) ให้เอง
      window.history.back();
    } else {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onPop = () => {
      pushedRef.current = false;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // ปิดแล้วคืน focus · unmount ระหว่างเปิด (เช่นไปข้อถัดไป) → เก็บรายการ history ที่ push ไว้คืน
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) wasOpenRef.current = true;
    else if (wasOpenRef.current) thumbRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(
    () => () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    },
    []
  );

  function openViewer() {
    window.history.pushState({ ...(window.history.state ?? {}), sdImage: true }, "");
    pushedRef.current = true;
    setOpen(true);
  }

  if (failed) {
    return (
      <div role="alert" className="sd-qimg sd-qimg-msg">
        <p>{T.failed}</p>
        <button
          type="button"
          className="sd-qimg-retry"
          onClick={() => {
            setFailed(false);
            setLoaded(false);
            setAttempt((n) => n + 1);
          }}
        >
          {T.retry}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        ref={thumbRef}
        type="button"
        className="sd-qimg"
        onClick={openViewer}
        disabled={!loaded}
        aria-label={T.zoomLabel}
        aria-haspopup="dialog"
      >
        {!loaded && (
          <span role="status" className="sd-qimg-loading">
            {T.loading}
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={attempt}
          ref={imgRef}
          src={src}
          alt={T.alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={loaded ? undefined : "sd-qimg-pending"}
        />
        {loaded && (
          <span className="sd-zoom" aria-hidden>
            <ZoomIn strokeWidth={2.4} />
            {T.zoom}
          </span>
        )}
      </button>
      {open && (
        <div className="sd-viewer" role="dialog" aria-modal="true" aria-label={T.dialog}>
          <div className="sd-viewer-bar">
            <button ref={closeRef} type="button" onClick={close}>
              {T.close}
            </button>
          </div>
          <div className="sd-viewer-pane">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${T.alt} ขนาดเต็ม`} />
          </div>
        </div>
      )}
    </>
  );
}
