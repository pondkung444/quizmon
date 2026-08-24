"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

// แสดง overlay เต็มจอตอนไม่มีอินเทอร์เน็ต — เฉพาะบน native platform เท่านั้น
// (เว็บปกติไม่ต้องมี เพราะ browser จัดการเองอยู่แล้ว และ dev คนทดสอบผ่าน localhost ไม่ควรโดนบัง)
//
// หมายเหตุสำคัญเรื่อง scope: component นี้ handle ได้เฉพาะเคส "แอปโหลดสำเร็จแล้ว แต่เน็ตหลุด
// ระหว่างใช้งาน" หรือ "กลับมาเปิดแอปที่ค้าง WebView เดิมอยู่ในหน่วยความจำตอนไม่มีเน็ต"
// เคส "เปิดแอปครั้งแรกสุดตอนไม่มีเน็ตเลย (WebView โหลด remote URL ไม่ผ่านตั้งแต่ต้น)" ยังโชว์
// หน้า error ของระบบอยู่ เพราะ JS bundle ของเราเองยังไม่ทันโหลดขึ้นมา — ต้องแก้ที่ native
// WebViewClient (Android) แยกเป็นงานคนละก้อน ไม่ได้อยู่ใน scope นี้
export default function OfflineScreen() {
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryHint, setRetryHint] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let mounted = true;

    Network.getStatus().then((status) => {
      if (mounted) setIsOffline(!status.connected);
    });

    const listenerPromise = Network.addListener("networkStatusChange", (status) => {
      if (!mounted) return;
      setIsOffline(!status.connected);
      if (status.connected) setRetryHint(null);
    });

    return () => {
      mounted = false;
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  if (!isOffline) return null;

  async function handleRetry() {
    setIsRetrying(true);
    setRetryHint(null);

    try {
      const status = await Network.getStatus();
      if (!status.connected) {
        setRetryHint("ยังไม่เจอสัญญาณ ลองอีกครั้งได้เลย");
        return;
      }

      // เช็คซ้ำว่าต่อเน็ตได้จริง ไม่ใช่แค่ต่อไวไฟที่ไม่มีอินเทอร์เน็ตจริง (captive portal ฯลฯ)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch("/", { method: "HEAD", cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);

      // ต่อได้จริง — โหลดหน้าปัจจุบันใหม่เพื่อดึงข้อมูลที่อาจค้างจากตอนออฟไลน์
      window.location.reload();
    } catch {
      setRetryHint("ยังไม่เจอสัญญาณ ลองอีกครั้งได้เลย");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-bg px-8 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="relative mb-1 flex h-[230px] w-[230px] items-center justify-center">
        <span className="absolute h-[100px] w-[100px] animate-[offline-ring_2.8s_cubic-bezier(0.2,0.6,0.4,1)_infinite] rounded-full border-[1.5px] border-indigo [animation-delay:0s]" />
        <span className="absolute h-[100px] w-[100px] animate-[offline-ring_2.8s_cubic-bezier(0.2,0.6,0.4,1)_infinite] rounded-full border-[1.5px] border-indigo [animation-delay:0.9s]" />
        <span className="absolute h-[100px] w-[100px] animate-[offline-ring_2.8s_cubic-bezier(0.2,0.6,0.4,1)_infinite] rounded-full border-[1.5px] border-indigo [animation-delay:1.8s]" />
        <div className="relative z-10 w-[118px] animate-egg-wobble drop-shadow-[0_12px_22px_rgba(0,0,0,0.55)]">
          <Image
            src="/offline-egg.png"
            alt=""
            width={399}
            height={477}
            className="h-auto w-full"
            priority
          />
        </div>
      </div>

      <h2 className="mt-4 text-center font-sans text-xl font-semibold text-text">
        ยังหาสัญญาณไม่เจอเลย
      </h2>
      <p className="mt-2 max-w-[260px] text-center text-sm leading-relaxed text-text2">
        เช็กไวไฟหรือเน็ตมือถือแป๊บนึง
        <br />
        แล้วลองอีกครั้งนะ
      </p>

      <button
        onClick={handleRetry}
        disabled={isRetrying}
        className="mt-7 flex items-center gap-2 rounded-full bg-gradient-to-b from-[#f0a05c] to-amber px-9 py-3 font-sans text-[15.5px] font-semibold text-bg shadow-[0_8px_22px_rgba(224,134,58,0.35)] transition-transform active:scale-95 disabled:opacity-70"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`h-[15px] w-[15px] ${isRetrying ? "animate-spin" : ""}`}
        >
          <path
            d="M4 4V9H4.58152M20 20V15H19.4185M19.4185 15C18.234 18.4956 14.9187 21 11 21C6.02944 21 2 16.9706 2 12M4.58152 9C5.76603 5.50442 9.08133 3 13 3C17.9706 3 22 7.02944 22 12"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {isRetrying ? "กำลังลองเชื่อมต่อ..." : "ลองอีกครั้ง"}
      </button>

      <p className="mt-5 min-h-[18px] text-center text-xs text-indigo-hi">{retryHint}</p>

      <p className="absolute bottom-[calc(2.1rem+env(safe-area-inset-bottom))] left-8 right-8 text-center text-xs leading-relaxed text-text3">
        เคล็ดลับ: ลองเปิด-ปิด <span className="text-text2">ไวไฟ</span> หรือสลับไป{" "}
        <span className="text-text2">เน็ตมือถือ</span> ดูได้นะ
      </p>
    </div>
  );
}
