"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

// สแกน QR เข้าห้องด้วยกล้อง — progressive enhancement:
// ใช้ BarcodeDetector API (รองรับบน Android Chrome / Capacitor WebView, เดสก์ท็อป Chrome)
// ถ้าเบราว์เซอร์ไม่รองรับ (เช่น iOS Safari) ปุ่มจะไม่แสดง — ผู้ใช้กรอกรหัสมือแทน

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

// ดึงรหัสห้อง 6 หลักจากข้อความใน QR (ทั้ง URL เต็มหรือรหัสล้วน)
function extractCode(raw: string): string | null {
  const m = raw.match(/[?&]code=([A-Za-z0-9]{6})\b/);
  if (m) return m[1].toUpperCase();
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(trimmed) ? trimmed : null;
}

export default function QrScanButton({ onCode }: { onCode: (code: string) => void }) {
  const [supported] = useState(() => getCtor() != null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const Ctor = getCtor();
    if (!Ctor) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ["qr_code"] });

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const c of codes) {
              const code = extractCode(c.rawValue);
              if (code) {
                stopped = true;
                onCode(code);
                setOpen(false);
                return;
              }
            }
          } catch {
            // detect() โยน error เป็นครั้งคราวระหว่างเฟรมไม่พร้อม — ข้ามไปเฟรมถัดไป
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        if (!stopped) setError("เปิดกล้องไม่ได้ — อนุญาตการใช้กล้อง หรือกรอกรหัสมือแทน");
      }
    }

    void run();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold-dim bg-track px-4 py-3 text-sm font-bold text-gold-hi transition active:scale-95"
      >
        <ScanLine size={18} />
        สแกน QR ด้วยกล้อง
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full border border-white/30 p-2 text-white"
            aria-label="ปิด"
          >
            <X size={20} />
          </button>
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-[70vh] w-full max-w-sm rounded-2xl border border-gold-dim object-cover"
          />
          <p className="mt-4 text-center text-sm text-white/80">
            {error ?? "หันกล้องไปที่ QR บนจอครู"}
          </p>
        </div>
      )}
    </>
  );
}
